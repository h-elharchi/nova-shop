-- fix-data-purge.sql
-- Purge de données pilotée par l'admin depuis Paramètres → Purge : durée de
-- rétention configurable + sélection des catégories à supprimer (historique
-- des interactions, interactions en cours, clients, commandes, produits).
-- Remplace l'usage manuel de sql/maintenance/purge-transactional-data.sql
-- par une purge sélective et paramétrable, admin uniquement.
--
-- Utilisateurs/Admins : gérés séparément via l'Edge Function admin-users
-- (action "purge") car la suppression d'un compte doit passer par l'API
-- Admin Supabase (auth.users), jamais accessible depuis le frontend.
--
-- Exécuter dans Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.purge_data(
  p_retention_days  INT,
  p_purge_history   BOOLEAN DEFAULT false,  -- interactions closed/abandoned/timeout/failed
  p_purge_active    BOOLEAN DEFAULT false,  -- interactions en cours (tout le reste)
  p_purge_customers BOOLEAN DEFAULT false,
  p_purge_orders    BOOLEAN DEFAULT false,
  p_purge_products  BOOLEAN DEFAULT false
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff TIMESTAMPTZ;
  v_n      INT;
  v_counts JSONB := '{}'::jsonb;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'permission denied — admin only';
  END IF;
  IF p_retention_days IS NULL OR p_retention_days < 0 THEN
    RAISE EXCEPTION 'retention_days must be >= 0';
  END IF;

  v_cutoff := now() - (p_retention_days || ' days')::INTERVAL;

  IF p_purge_history THEN
    DELETE FROM interactions
    WHERE status IN ('closed','abandoned','timeout','failed')
      AND created_at < v_cutoff;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('interactions_history', v_n);
  END IF;

  IF p_purge_active THEN
    DELETE FROM interactions
    WHERE status NOT IN ('closed','abandoned','timeout','failed')
      AND created_at < v_cutoff;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('interactions_active', v_n);
  END IF;

  -- Commandes avant produits : orders.product_id est en ON DELETE RESTRICT
  IF p_purge_orders THEN
    DELETE FROM orders WHERE created_at < v_cutoff;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('orders', v_n);
  END IF;

  IF p_purge_customers THEN
    DELETE FROM customers WHERE created_at < v_cutoff;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('customers', v_n);
  END IF;

  IF p_purge_products THEN
    -- Ne supprime que les produits sans commande référencée (product_id est en
    -- ON DELETE RESTRICT) — évite un échec de toute la purge sur conflit FK.
    DELETE FROM products
    WHERE created_at < v_cutoff
      AND id NOT IN (SELECT DISTINCT product_id FROM orders);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_counts := v_counts || jsonb_build_object('products', v_n);
  END IF;

  INSERT INTO admin_audit_log (actor_id, action, target_user_id, details)
  VALUES (
    auth.uid(), 'purge_data', NULL,
    jsonb_build_object(
      'retention_days', p_retention_days,
      'history',   p_purge_history,
      'active',    p_purge_active,
      'customers', p_purge_customers,
      'orders',    p_purge_orders,
      'products',  p_purge_products,
      'counts',    v_counts
    )
  );

  RETURN v_counts::json;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_data TO authenticated;
