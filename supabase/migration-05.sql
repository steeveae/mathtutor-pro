-- ============================================================
-- MathTutor Pro — Migration 05 : plateforme multi-tuteurs,
-- matières, et verrouillage anti-triche.
-- À exécuter dans : Dashboard Supabase → SQL Editor → Run
-- Ré-exécutable sans risque.
-- ============================================================

-- ------------------------------------------------------------
-- 1. MATIÈRES : chaque tuteur déclare les matières qu'il
--    dispense (intitulé libre + tarif horaire optionnel qui
--    prime sur le tarif de l'élève).
-- ------------------------------------------------------------
create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  hourly_rate integer, -- FCFA/h ; null = utiliser le tarif de l'élève
  created_at timestamptz not null default now()
);
alter table public.subjects enable row level security;

drop policy if exists "subjects: tuteur gère ses matières" on public.subjects;
create policy "subjects: tuteur gère ses matières"
  on public.subjects for all
  using (tutor_id = auth.uid())
  with check (tutor_id = auth.uid());

drop policy if exists "subjects: lecture connectée" on public.subjects;
create policy "subjects: lecture connectée"
  on public.subjects for select
  using (auth.uid() is not null);

-- ------------------------------------------------------------
-- 2. RATTACHEMENTS : matière sur les sessions et devoirs,
--    tuteur propriétaire sur les devoirs et documents.
-- ------------------------------------------------------------
alter table public.sessions
  add column if not exists subject_id uuid references public.subjects (id) on delete set null;
alter table public.homeworks
  add column if not exists subject_id uuid references public.subjects (id) on delete set null;
alter table public.homeworks
  add column if not exists tutor_id uuid references public.profiles (id) on delete cascade;
alter table public.resources
  add column if not exists tutor_id uuid references public.profiles (id) on delete cascade;

-- Reprise de l'existant : tout appartient au premier tuteur créé
update public.homeworks
  set tutor_id = (select id from public.profiles where role = 'tutor' order by created_at limit 1)
  where tutor_id is null;
update public.resources
  set tutor_id = (select id from public.profiles where role = 'tutor' order by created_at limit 1)
  where tutor_id is null;

-- ------------------------------------------------------------
-- 3. CLOISONNEMENT MULTI-TUTEURS : chaque tuteur ne voit et ne
--    gère QUE ses propres sessions, devoirs, documents, slides
--    et messages (plus de « tout tuteur voit tout »).
-- ------------------------------------------------------------
drop policy if exists "sessions: tuteur accès complet" on public.sessions;
drop policy if exists "sessions: tuteur gère ses sessions" on public.sessions;
create policy "sessions: tuteur gère ses sessions"
  on public.sessions for all
  using (tutor_id = auth.uid())
  with check (tutor_id = auth.uid());

drop policy if exists "homeworks: tuteur accès complet" on public.homeworks;
drop policy if exists "homeworks: tuteur gère ses devoirs" on public.homeworks;
create policy "homeworks: tuteur gère ses devoirs"
  on public.homeworks for all
  using (tutor_id = auth.uid())
  with check (tutor_id = auth.uid());

drop policy if exists "resources: tuteur accès complet" on public.resources;
drop policy if exists "resources: tuteur gère ses documents" on public.resources;
create policy "resources: tuteur gère ses documents"
  on public.resources for all
  using (tutor_id = auth.uid())
  with check (tutor_id = auth.uid());

drop policy if exists "slides: tuteur accès complet" on public.slides;
drop policy if exists "slides: tuteur gère ses slides" on public.slides;
create policy "slides: tuteur gère ses slides"
  on public.slides for all
  using (exists (
    select 1 from public.sessions s
    where s.id = session_id and s.tutor_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.sessions s
    where s.id = session_id and s.tutor_id = auth.uid()
  ));

drop policy if exists "messages: participants lisent" on public.session_messages;
create policy "messages: participants lisent"
  on public.session_messages for select
  using (exists (
    select 1 from public.sessions s
    where s.id = session_id
      and (s.tutor_id = auth.uid() or s.student_id = auth.uid())
  ));

drop policy if exists "messages: participants écrivent" on public.session_messages;
create policy "messages: participants écrivent"
  on public.session_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.sessions s
      where s.id = session_id
        and (s.tutor_id = auth.uid() or s.student_id = auth.uid())
    )
  );

drop policy if exists "hwfiles: tuteur accès complet" on public.homework_files;
drop policy if exists "hwfiles: tuteur gère les fichiers de ses devoirs" on public.homework_files;
create policy "hwfiles: tuteur gère les fichiers de ses devoirs"
  on public.homework_files for all
  using (exists (
    select 1 from public.homeworks h
    where h.id = homework_id and h.tutor_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.homeworks h
    where h.id = homework_id and h.tutor_id = auth.uid()
  ));

-- ------------------------------------------------------------
-- 4. ANTI-TRICHE : verrous au niveau base de données.
--    Un élève ne peut JAMAIS modifier : son rôle, son tarif,
--    son lien parent, ni la note/correction/consigne/échéance
--    d'un devoir. Les durées de session ne sont modifiables que
--    par le tuteur (aucune politique UPDATE élève n'existe).
-- ------------------------------------------------------------
create or replace function public.protect_profiles()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- auth.uid() nul = action d'administration (dashboard) : autorisée
  if auth.uid() is not null and not public.is_tutor() then
    if new.role is distinct from old.role
       or new.hourly_rate is distinct from old.hourly_rate
       or new.linked_parent_id is distinct from old.linked_parent_id then
      raise exception 'Modification non autorisée (champ protégé)';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profiles_trigger on public.profiles;
create trigger protect_profiles_trigger
  before update on public.profiles
  for each row execute function public.protect_profiles();

create or replace function public.protect_homeworks()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_tutor() then
    -- L'élève ne peut que déposer ses fichiers et passer le
    -- statut à « submitted » : tout le reste est verrouillé.
    if new.grade is distinct from old.grade
       or new.feedback is distinct from old.feedback
       or new.description is distinct from old.description
       or new.deadline is distinct from old.deadline
       or new.student_id is distinct from old.student_id
       or new.tutor_id is distinct from old.tutor_id
       or new.subject_id is distinct from old.subject_id
       or (new.status is distinct from old.status and new.status <> 'submitted') then
      raise exception 'Modification non autorisée (champ protégé)';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_homeworks_trigger on public.homeworks;
create trigger protect_homeworks_trigger
  before update on public.homeworks
  for each row execute function public.protect_homeworks();
