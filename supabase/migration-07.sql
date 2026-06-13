-- ============================================================
-- Migration 07 — Fiabilise le partage de fichiers (Storage)
--
-- Garantit que les deux buckets existent et que TOUTES les
-- politiques d'accès sont en place. Idempotent : peut être
-- relancé sans erreur.
--
-- À lancer dans Supabase → SQL Editor.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Buckets privés (création si absents) + limite de taille
--    portée à 50 Mo pour accepter photos/PDF volumineux.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('resources', 'resources', false, 52428800)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

insert into storage.buckets (id, name, public, file_size_limit)
values ('homeworks', 'homeworks', false, 52428800)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

-- ------------------------------------------------------------
-- 2. Politiques bucket "resources" (documents du tuteur)
-- ------------------------------------------------------------
drop policy if exists "storage: tuteur dépose des documents" on storage.objects;
create policy "storage: tuteur dépose des documents"
  on storage.objects for insert
  with check (bucket_id = 'resources' and public.is_tutor());

drop policy if exists "storage: tuteur met à jour des documents" on storage.objects;
create policy "storage: tuteur met à jour des documents"
  on storage.objects for update
  using (bucket_id = 'resources' and public.is_tutor());

drop policy if exists "storage: tuteur supprime des documents" on storage.objects;
create policy "storage: tuteur supprime des documents"
  on storage.objects for delete
  using (bucket_id = 'resources' and public.is_tutor());

drop policy if exists "storage: lecture documents (connectés)" on storage.objects;
create policy "storage: lecture documents (connectés)"
  on storage.objects for select
  using (bucket_id = 'resources' and auth.uid() is not null);

-- ------------------------------------------------------------
-- 3. Politiques bucket "homeworks" (fichiers des élèves)
--    Convention de chemin : {uid_eleve}/...
-- ------------------------------------------------------------
drop policy if exists "storage: élève uploade dans son dossier" on storage.objects;
create policy "storage: élève uploade dans son dossier"
  on storage.objects for insert
  with check (
    bucket_id = 'homeworks'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "storage: élève met à jour son dossier" on storage.objects;
create policy "storage: élève met à jour son dossier"
  on storage.objects for update
  using (
    bucket_id = 'homeworks'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "storage: lecture par élève propriétaire ou tuteur" on storage.objects;
create policy "storage: lecture par élève propriétaire ou tuteur"
  on storage.objects for select
  using (
    bucket_id = 'homeworks'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_tutor())
  );

drop policy if exists "storage: tuteur supprime les devoirs" on storage.objects;
create policy "storage: tuteur supprime les devoirs"
  on storage.objects for delete
  using (bucket_id = 'homeworks' and public.is_tutor());
