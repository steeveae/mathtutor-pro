-- ============================================================
-- MathTutor Pro — Schéma Supabase (Étape 1 / MVP)
-- À exécuter dans : Dashboard Supabase → SQL Editor → Run
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLE profiles
--    Liée 1:1 à auth.users. Le rôle détermine l'interface
--    affichée (dashboard Tuteur ou Élève).
-- ------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'student' check (role in ('tutor', 'student')),
  name text not null,
  email text not null,
  linked_parent_id uuid references public.profiles (id), -- contact parent (facturation), optionnel
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. TABLE sessions
--    scheduled_time = créneau planifié.
--    start_time / end_time = horodatage réel (boutons Démarrer /
--    Terminer) → base du calcul de facturation bimensuelle.
--    live_content = "slide" texte poussé par le Tuteur pendant
--    une session in_progress (lu en Realtime par l'Élève).
-- ------------------------------------------------------------
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  tutor_id uuid not null references public.profiles (id) on delete cascade,
  scheduled_time timestamptz not null,
  start_time timestamptz,
  end_time timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'completed', 'cancelled')),
  notes text,
  live_content text, -- contenu de cours affiché en direct (MVP : texte simple)
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3. TABLE homeworks
--    photo_url = chemin du fichier dans le bucket Storage
--    "homeworks" (uploadé par l'Élève).
-- ------------------------------------------------------------
create table public.homeworks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  description text not null,
  deadline timestamptz,
  photo_url text,
  feedback text,
  status text not null default 'pending'
    check (status in ('pending', 'submitted', 'graded')),
  created_at timestamptz not null default now()
);

-- Index pour les requêtes fréquentes (dashboard, facturation 14 jours)
create index sessions_student_idx on public.sessions (student_id, scheduled_time);
create index sessions_tutor_billing_idx on public.sessions (tutor_id, end_time);
create index homeworks_student_idx on public.homeworks (student_id, status);

-- ------------------------------------------------------------
-- 4. CRÉATION AUTOMATIQUE DU PROFIL À L'INSCRIPTION
--    Le rôle/nom peuvent être passés dans options.data au signUp,
--    sinon valeurs par défaut (student).
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'role', 'student'),
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 5. SÉCURITÉ (RLS)
--    Règle générale : le Tuteur voit/gère tout,
--    l'Élève ne voit que ses propres données.
-- ------------------------------------------------------------
alter table public.profiles  enable row level security;
alter table public.sessions  enable row level security;
alter table public.homeworks enable row level security;

-- Helper : l'utilisateur connecté est-il tuteur ?
-- (security definer pour éviter la récursion RLS sur profiles)
create or replace function public.is_tutor()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'tutor'
  );
$$;

-- --- profiles ---
create policy "profiles: lecture (soi-même ou tuteur)"
  on public.profiles for select
  using (id = auth.uid() or public.is_tutor());

create policy "profiles: modification de son propre profil"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- --- sessions ---
create policy "sessions: tuteur accès complet"
  on public.sessions for all
  using (public.is_tutor())
  with check (public.is_tutor());

create policy "sessions: élève lit ses sessions"
  on public.sessions for select
  using (student_id = auth.uid());

-- --- homeworks ---
create policy "homeworks: tuteur accès complet"
  on public.homeworks for all
  using (public.is_tutor())
  with check (public.is_tutor());

create policy "homeworks: élève lit ses devoirs"
  on public.homeworks for select
  using (student_id = auth.uid());

-- L'élève peut soumettre son devoir (photo_url + status), MVP :
-- update autorisé sur ses propres lignes.
create policy "homeworks: élève soumet son devoir"
  on public.homeworks for update
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

-- ------------------------------------------------------------
-- 6. REALTIME
--    Permet à l'Élève de recevoir en direct les slides poussés
--    par le Tuteur (changements sur sessions.live_content/status).
-- ------------------------------------------------------------
alter publication supabase_realtime add table public.sessions;

-- ------------------------------------------------------------
-- 7. STORAGE — bucket privé pour les photos de devoirs
--    Convention de chemin : {uid_eleve}/{homework_id}.jpg
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('homeworks', 'homeworks', false)
on conflict (id) do nothing;

-- L'élève uploade uniquement dans son propre dossier
create policy "storage: élève uploade dans son dossier"
  on storage.objects for insert
  with check (
    bucket_id = 'homeworks'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Lecture : le propriétaire du dossier ou le tuteur
create policy "storage: lecture par élève propriétaire ou tuteur"
  on storage.objects for select
  using (
    bucket_id = 'homeworks'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_tutor())
  );
