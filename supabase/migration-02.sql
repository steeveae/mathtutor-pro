-- ============================================================
-- MathTutor Pro — Migration 02 (améliorations post-MVP)
-- À exécuter dans : Dashboard Supabase → SQL Editor → Run
-- (une seule fois, après schema.sql)
-- ============================================================

-- ------------------------------------------------------------
-- 1. PROFILS : rôle "parent" + tarif horaire par élève (FCFA)
-- ------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('tutor', 'student', 'parent'));

alter table public.profiles
  add column if not exists hourly_rate integer not null default 0; -- FCFA / heure

-- Le tuteur peut modifier les profils (tarif, lien parent-enfant)
create policy "profiles: tuteur met à jour"
  on public.profiles for update
  using (public.is_tutor())
  with check (public.is_tutor());

-- Le parent voit les profils de ses enfants
create policy "profiles: parent lit ses enfants"
  on public.profiles for select
  using (linked_parent_id = auth.uid());

-- ------------------------------------------------------------
-- 2. DEVOIRS : note sur 20 + fichiers multiples
-- ------------------------------------------------------------
alter table public.homeworks
  add column if not exists grade integer check (grade between 0 and 20);

create table if not exists public.homework_files (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null references public.homeworks (id) on delete cascade,
  file_path text not null, -- chemin dans le bucket Storage "homeworks"
  file_name text not null,
  created_at timestamptz not null default now()
);
alter table public.homework_files enable row level security;

create policy "hwfiles: tuteur accès complet"
  on public.homework_files for all
  using (public.is_tutor()) with check (public.is_tutor());

create policy "hwfiles: élève ajoute sur ses devoirs"
  on public.homework_files for insert
  with check (exists (
    select 1 from public.homeworks h
    where h.id = homework_id and h.student_id = auth.uid()
  ));

create policy "hwfiles: élève et parent lisent"
  on public.homework_files for select
  using (exists (
    select 1 from public.homeworks h
    join public.profiles p on p.id = h.student_id
    where h.id = homework_id
      and (h.student_id = auth.uid() or p.linked_parent_id = auth.uid())
  ));

-- ------------------------------------------------------------
-- 3. SLIDES : historique des contenus envoyés pendant les
--    sessions (l'élève peut réviser les cours passés)
-- ------------------------------------------------------------
create table if not exists public.slides (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.slides enable row level security;

create policy "slides: tuteur accès complet"
  on public.slides for all
  using (public.is_tutor()) with check (public.is_tutor());

create policy "slides: élève et parent lisent"
  on public.slides for select
  using (exists (
    select 1 from public.sessions s
    join public.profiles p on p.id = s.student_id
    where s.id = session_id
      and (s.student_id = auth.uid() or p.linked_parent_id = auth.uid())
  ));

-- ------------------------------------------------------------
-- 4. MESSAGES DE SESSION : l'élève peut poser une question /
--    répondre pendant le cours en direct
-- ------------------------------------------------------------
create table if not exists public.session_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.session_messages enable row level security;

create policy "messages: participants lisent"
  on public.session_messages for select
  using (
    public.is_tutor()
    or exists (
      select 1 from public.sessions s
      where s.id = session_id and s.student_id = auth.uid()
    )
  );

create policy "messages: participants écrivent"
  on public.session_messages for insert
  with check (
    sender_id = auth.uid()
    and (
      public.is_tutor()
      or exists (
        select 1 from public.sessions s
        where s.id = session_id and s.student_id = auth.uid()
      )
    )
  );

-- ------------------------------------------------------------
-- 5. DOCUMENTS DE COURS : fichiers partagés par le tuteur
--    (pour un élève précis, ou pour tous si student_id est nul)
-- ------------------------------------------------------------
create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.profiles (id) on delete cascade, -- null = tous
  title text not null,
  file_path text not null, -- chemin dans le bucket Storage "resources"
  file_name text not null,
  created_at timestamptz not null default now()
);
alter table public.resources enable row level security;

create policy "resources: tuteur accès complet"
  on public.resources for all
  using (public.is_tutor()) with check (public.is_tutor());

create policy "resources: élève lit"
  on public.resources for select
  using (student_id is null or student_id = auth.uid());

create policy "resources: parent lit"
  on public.resources for select
  using (
    student_id is null
    or exists (
      select 1 from public.profiles p
      where p.id = student_id and p.linked_parent_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 6. PARENTS : lecture des sessions et devoirs de leurs enfants
-- ------------------------------------------------------------
create policy "sessions: parent lit celles de ses enfants"
  on public.sessions for select
  using (exists (
    select 1 from public.profiles p
    where p.id = student_id and p.linked_parent_id = auth.uid()
  ));

create policy "homeworks: parent lit ceux de ses enfants"
  on public.homeworks for select
  using (exists (
    select 1 from public.profiles p
    where p.id = student_id and p.linked_parent_id = auth.uid()
  ));

-- ------------------------------------------------------------
-- 7. REALTIME : notifications en direct (devoirs, messages)
-- ------------------------------------------------------------
alter publication supabase_realtime add table public.homeworks;
alter publication supabase_realtime add table public.session_messages;

-- ------------------------------------------------------------
-- 8. STORAGE : bucket privé pour les documents de cours
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('resources', 'resources', false)
on conflict (id) do nothing;

create policy "storage: tuteur dépose des documents"
  on storage.objects for insert
  with check (bucket_id = 'resources' and public.is_tutor());

create policy "storage: tuteur supprime des documents"
  on storage.objects for delete
  using (bucket_id = 'resources' and public.is_tutor());

create policy "storage: lecture documents (connectés)"
  on storage.objects for select
  using (bucket_id = 'resources' and auth.uid() is not null);
