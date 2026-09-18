-- diagnostic-foreign-keys.sql
-- Requêtes READ-ONLY pour vérifier les FK sur interactions, interaction_events
-- et callback_attempts.
-- Exécuter AVANT et APRÈS fix-foreign-keys.sql pour confirmer la migration.

-- 1. FK actuelles sur les tables du workspace
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_schema AS foreign_schema,
  ccu.table_name   AS foreign_table,
  ccu.column_name  AS foreign_column,
  tc.constraint_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage  AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema   = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema   = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN ('interactions', 'interaction_events', 'callback_attempts')
  AND kcu.column_name IN (
    'assigned_agent_id', 'offered_to', 'closed_by', 'actor_id', 'agent_id'
  )
ORDER BY tc.table_name, kcu.column_name;

-- Résultat attendu AVANT fix :
--   interactions / assigned_agent_id → auth / users
--   interactions / closed_by         → auth / users
--   interactions / offered_to        → auth / users
--   interaction_events / actor_id    → auth / users
--   callback_attempts / agent_id     → auth / users
--
-- Résultat attendu APRÈS fix :
--   Toutes les FK doivent pointer vers public / profiles

-- 2. Vérifier que PostgREST peut résoudre la jointure profiles!assigned_agent_id
-- (Tester après NOTIFY pgrst, 'reload schema')
-- La requête suivante doit retourner des lignes sans erreur :
-- SELECT i.id, p.first_name, p.last_name
-- FROM public.interactions i
-- LEFT JOIN public.profiles p ON p.id = i.assigned_agent_id
-- LIMIT 5;
