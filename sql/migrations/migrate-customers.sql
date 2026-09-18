-- ============================================================
-- NOVA SHOP — Script de migration : clients depuis commandes
-- ⚠ FAIRE UNE SAUVEGARDE AVANT D'EXÉCUTER CE SCRIPT
-- Exécuter après supabase-customers.sql et supabase-orders-v2.sql
-- ============================================================

BEGIN;

-- 1. Créer un customer par numéro de téléphone unique
--    (première occurrence chronologique comme référence)
INSERT INTO customers (phone, first_name, last_name, source)
SELECT DISTINCT ON (customer_phone)
  customer_phone,
  customer_first_name,
  COALESCE(NULLIF(TRIM(customer_last_name), ''), customer_first_name),
  'site'
FROM orders
ORDER BY customer_phone, created_at ASC
ON CONFLICT (phone) DO NOTHING;

-- 2. Rattacher toutes les commandes à leur customer
UPDATE orders o
SET customer_id = c.id
FROM customers c
WHERE o.customer_phone = c.phone
  AND o.customer_id IS NULL;

-- Vérification
SELECT
  COUNT(*)                                          AS total_orders,
  COUNT(*) FILTER (WHERE customer_id IS NOT NULL)   AS orders_linked,
  COUNT(*) FILTER (WHERE customer_id IS NULL)       AS orders_unlinked,
  (SELECT COUNT(*) FROM customers)                  AS total_customers
FROM orders;

COMMIT;
