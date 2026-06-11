-- ============================================================
-- MathTutor Pro — Migration 03 : cours collectifs
-- À exécuter dans : Dashboard Supabase → SQL Editor → Run
-- Ré-exécutable sans risque.
-- ============================================================

-- Les sessions d'un même cours collectif partagent un group_key :
-- 1 ligne par élève (facturation et suivi individuels conservés),
-- mais le tuteur les pilote comme une seule session.
alter table public.sessions
  add column if not exists group_key uuid;
