-- diagnostic-customers.sql
-- Requêtes de diagnostic READ-ONLY pour la gestion des clients.
-- N'exécuter que pour inspecter l'état de la base — aucune modification.

-- 1. Vérifier que les RPCs nécessaires existent
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'archive_customer', 'restore_customer', 'delete_customer',
    'check_customer_duplicate', 'get_customer_audit'
  )
ORDER BY routine_name;

-- 2. Vérifier les GRANTs sur les RPCs
SELECT
  p.proname AS function_name,
  r.rolname AS grantee,
  has_function_privilege(r.oid, p.oid, 'EXECUTE') AS can_execute
FROM pg_proc p
JOIN pg_roles r ON r.rolname IN ('authenticated', 'anon', 'service_role')
WHERE p.proname IN (
  'archive_customer', 'restore_customer', 'delete_customer',
  'check_customer_duplicate', 'get_customer_audit'
)
ORDER BY p.proname, r.rolname;

-- 3. Vérifier la vue customers_view
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('customers', 'customers_view', 'customer_addresses', 'customer_audit_log');

-- 4. Compter les clients par statut
SELECT status, COUNT(*) AS nb
FROM customers
GROUP BY status
ORDER BY nb DESC;

-- 5. Vérifier les colonnes de la table customers
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'customers'
ORDER BY ordinal_position;

-- 6. Exemple : tester archive_customer (COMMENTÉ — décommenter pour tester avec un ID réel)
-- SELECT * FROM archive_customer('00000000-0000-0000-0000-000000000000', 'test diagnostic');

-- 7. Vérifier les politiques RLS sur la table customers
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'customers'
ORDER BY policyname;

-- 8. Vérifier que customer_audit_log existe et son schéma
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'customer_audit_log'
ORDER BY ordinal_position;
