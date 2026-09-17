-- fix-foreign-keys.sql
-- Corrige les FK sur les tables interactions, interaction_events et callback_attempts
-- qui pointaient vers auth.users au lieu de public.profiles.
-- PostgREST ne peut pas construire la jointure profiles!assigned_agent_id(...)
-- si la FK ne pointe pas vers public.profiles.
--
-- Prérequis : supabase-workspace.sql déjà exécuté
-- Exécuter UNE SEULE FOIS dans Supabase SQL Editor

-- ─── 1. interactions.assigned_agent_id ───────────────────────

ALTER TABLE public.interactions
  DROP CONSTRAINT IF EXISTS interactions_assigned_agent_id_fkey;

ALTER TABLE public.interactions
  ADD CONSTRAINT interactions_assigned_agent_id_fkey
    FOREIGN KEY (assigned_agent_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ─── 2. interactions.offered_to ──────────────────────────────

ALTER TABLE public.interactions
  DROP CONSTRAINT IF EXISTS interactions_offered_to_fkey;

ALTER TABLE public.interactions
  ADD CONSTRAINT interactions_offered_to_fkey
    FOREIGN KEY (offered_to) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ─── 3. interactions.closed_by ───────────────────────────────

ALTER TABLE public.interactions
  DROP CONSTRAINT IF EXISTS interactions_closed_by_fkey;

ALTER TABLE public.interactions
  ADD CONSTRAINT interactions_closed_by_fkey
    FOREIGN KEY (closed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ─── 4. interaction_events.actor_id ──────────────────────────

ALTER TABLE public.interaction_events
  DROP CONSTRAINT IF EXISTS interaction_events_actor_id_fkey;

ALTER TABLE public.interaction_events
  ADD CONSTRAINT interaction_events_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ─── 5. callback_attempts.agent_id ───────────────────────────

ALTER TABLE public.callback_attempts
  DROP CONSTRAINT IF EXISTS callback_attempts_agent_id_fkey;

ALTER TABLE public.callback_attempts
  ADD CONSTRAINT callback_attempts_agent_id_fkey
    FOREIGN KEY (agent_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ─── 6. Forcer le rechargement du schéma PostgREST ───────────

NOTIFY pgrst, 'reload schema';

-- ─── Vérification ────────────────────────────────────────────
-- Exécuter après la migration pour confirmer les nouvelles FK :
-- SELECT
--   tc.table_name, kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
-- FROM information_schema.table_constraints AS tc
-- JOIN information_schema.key_column_usage AS kcu
--   ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
-- JOIN information_schema.constraint_column_usage AS ccu
--   ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
-- WHERE tc.constraint_type = 'FOREIGN KEY'
--   AND tc.table_name IN ('interactions', 'interaction_events', 'callback_attempts')
--   AND ccu.table_name = 'profiles'
-- ORDER BY tc.table_name, kcu.column_name;
