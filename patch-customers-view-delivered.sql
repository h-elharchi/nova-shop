-- ============================================================
-- NOVA SHOP — Patch : ajout delivered_count dans customers_view
-- ============================================================
-- Exécuter une seule fois dans Supabase SQL Editor
-- Ajoute le compte de commandes livrées (status='delivered')
-- pour identifier les vrais clients.
-- ============================================================

CREATE OR REPLACE VIEW customers_view AS
SELECT
  c.*,
  COALESCE(o.order_count,     0)    AS order_count,
  COALESCE(o.delivered_count, 0)    AS delivered_count,
  COALESCE(i.interaction_count, 0)  AS interaction_count,
  o.last_order_at,
  i.last_interaction_at,
  da.city AS default_city
FROM customers c
LEFT JOIN (
  SELECT
    customer_id,
    COUNT(*)                                            AS order_count,
    COUNT(*) FILTER (WHERE status = 'delivered')        AS delivered_count,
    MAX(created_at)                                     AS last_order_at
  FROM orders
  GROUP BY customer_id
) o ON o.customer_id = c.id
LEFT JOIN (
  SELECT customer_id, COUNT(*) AS interaction_count, MAX(created_at) AS last_interaction_at
  FROM interactions
  GROUP BY customer_id
) i ON i.customer_id = c.id
LEFT JOIN customer_addresses da ON da.customer_id = c.id AND da.is_default = true;

GRANT SELECT ON customers_view TO authenticated;
