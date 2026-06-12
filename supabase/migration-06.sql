-- ============================================================
-- MathTutor Pro — Migration 06 : préférences de notifications
-- À exécuter dans : Dashboard Supabase → SQL Editor → Run
-- Ré-exécutable sans risque.
-- ============================================================

-- Préférences par utilisateur : { "session_start": false, ... }
-- Une clé absente = notification activée (tout est activé par défaut).
alter table public.profiles
  add column if not exists notification_prefs jsonb not null default '{}'::jsonb;
