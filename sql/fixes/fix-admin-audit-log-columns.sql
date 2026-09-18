-- fix-admin-audit-log-columns.sql
-- admin_audit_log a deux définitions différentes dans le projet :
--   - supabase-accounts.sql (Lot 1)      : actor_id, action, target_user_id, details
--   - supabase-interactions.sql (Lot 7-11): actor_id, action, target_type, target_id
--                                           (NOT NULL), customer_number, reason
-- CREATE TABLE IF NOT EXISTS ne crée que la première rencontrée à l'exécution
-- initiale ; l'autre définition n'a donc jamais pris effet. Résultat concret :
--   - Les fonctions génériques (Edge Function admin-users : invite/update/
--     delete/reset-password, et la nouvelle purge_data()) utilisent
--     target_user_id/details → échouaient si seule la version "customers"
--     avait été créée (comme ici : "column target_user_id does not exist").
--   - Les fonctions clients (archive_customer, delete_customer, restore_customer
--     dans supabase-customers-v2.sql) utilisent target_type/target_id/
--     customer_number/reason → auraient échoué si seule la version "accounts"
--     avait été créée.
-- Ce script réconcilie les deux : ajoute les colonnes manquantes de chaque
-- côté et rend target_id nullable (les actions génériques n'ont pas toujours
-- une cible "client" unique). Idempotent, non destructif.
--
-- Exécuter dans Supabase SQL Editor.

ALTER TABLE public.admin_audit_log
  ADD COLUMN IF NOT EXISTS target_type     TEXT DEFAULT 'customer',
  ADD COLUMN IF NOT EXISTS target_id       UUID,
  ADD COLUMN IF NOT EXISTS customer_number TEXT,
  ADD COLUMN IF NOT EXISTS reason          TEXT,
  ADD COLUMN IF NOT EXISTS target_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS details         JSONB;

ALTER TABLE public.admin_audit_log ALTER COLUMN target_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS admin_audit_log_target_user_idx ON public.admin_audit_log(target_user_id);
