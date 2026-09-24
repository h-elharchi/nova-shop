-- fix-orders-foreign-keys.sql
-- Même correctif que fix-foreign-keys.sql (déjà appliqué à interactions),
-- pour orders et order_status_history : PostgREST ne peut construire la
-- jointure profiles!assigned_agent_id(...) / profiles!actor_id(...) que si la
-- clé étrangère pointe directement vers public.profiles, pas vers auth.users.
-- Symptôme observé : "Could not find a relationship between 'orders' and
-- 'profiles' in the schema cache".
--
-- Prérequis : fix-order-agent-tracking.sql déjà exécuté (table
-- order_status_history créée).
-- Exécuter UNE SEULE FOIS dans Supabase SQL Editor.

-- ─── 1. orders.assigned_agent_id ──────────────────────────────

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_assigned_agent_id_fkey;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_assigned_agent_id_fkey
    FOREIGN KEY (assigned_agent_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ─── 2. order_status_history.actor_id ─────────────────────────

ALTER TABLE public.order_status_history
  DROP CONSTRAINT IF EXISTS order_status_history_actor_id_fkey;

ALTER TABLE public.order_status_history
  ADD CONSTRAINT order_status_history_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ─── 3. Forcer le rechargement du schéma PostgREST ────────────

NOTIFY pgrst, 'reload schema';

-- ─── Vérification ──────────────────────────────────────────────
-- SELECT
--   tc.table_name, kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
-- FROM information_schema.table_constraints AS tc
-- JOIN information_schema.key_column_usage AS kcu
--   ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
-- JOIN information_schema.constraint_column_usage AS ccu
--   ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
-- WHERE tc.constraint_type = 'FOREIGN KEY'
--   AND tc.table_name IN ('orders', 'order_status_history')
--   AND ccu.table_name = 'profiles'
-- ORDER BY tc.table_name, kcu.column_name;
