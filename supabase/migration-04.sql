-- ============================================================
-- MathTutor Pro — Migration 04 : vraies notifications push
-- À exécuter dans : Dashboard Supabase → SQL Editor → Run
-- Ré-exécutable sans risque.
-- ============================================================

-- Un abonnement push par appareil (téléphone, PC…) et par compte.
-- La fonction serveur "push" lit cette table (clé service role)
-- pour envoyer les notifications chiffrées à chaque appareil.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique, -- URL fournie par Google/Apple/Mozilla
  p256dh text not null,          -- clé publique de chiffrement de l'appareil
  auth text not null,            -- secret d'authentification de l'appareil
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;

drop policy if exists "push: chacun gère ses abonnements" on public.push_subscriptions;
create policy "push: chacun gère ses abonnements"
  on public.push_subscriptions for all
  using (auth.uid() is not null)
  with check (user_id = auth.uid());
