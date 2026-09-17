-- ============================================================
-- NOVA SHOP — Extension orders : email + adresse de livraison
-- Ordre d'exécution : après supabase-orders-v2.sql
-- Idempotent — peut être ré-exécuté sans risque
-- ============================================================

BEGIN;

-- ─── 1. Nouvelles colonnes livraison ─────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_email      TEXT,
  ADD COLUMN IF NOT EXISTS delivery_city       TEXT,
  ADD COLUMN IF NOT EXISTS delivery_address    TEXT,
  ADD COLUMN IF NOT EXISTS delivery_district   TEXT,
  ADD COLUMN IF NOT EXISTS delivery_landmark   TEXT;

-- ─── 2. Index ville (filtres fréquents) ──────────────────────
CREATE INDEX IF NOT EXISTS orders_delivery_city_idx ON orders (delivery_city)
  WHERE delivery_city IS NOT NULL;

-- ─── 3. Recréation de create_order_admin avec nouveaux params ─
-- ⚠ DROP obligatoire car la signature change
DROP FUNCTION IF EXISTS create_order_admin(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION create_order_admin(
  p_product_id         UUID,
  p_channel            TEXT,
  p_first_name         TEXT,
  p_last_name          TEXT,
  p_phone              TEXT,
  p_email              TEXT       DEFAULT NULL,
  p_delivery_city      TEXT       DEFAULT NULL,
  p_delivery_address   TEXT       DEFAULT NULL,
  p_delivery_district  TEXT       DEFAULT NULL,
  p_delivery_landmark  TEXT       DEFAULT NULL,
  p_notes              TEXT       DEFAULT NULL,
  p_callback_at        TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF orders
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_product      RECORD;
  v_customer_id  UUID;
  v_agent_id     UUID;
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  -- Récupérer le produit
  SELECT id, name_fr, price INTO v_product
  FROM products WHERE id = p_product_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product not found or inactive';
  END IF;

  v_agent_id := auth.uid();

  -- Créer ou réutiliser le customer (upsert sur le téléphone)
  INSERT INTO customers (phone, first_name, last_name, email, source)
  VALUES (p_phone, p_first_name, p_last_name, p_email, p_channel)
  ON CONFLICT (phone) DO UPDATE
    SET first_name  = EXCLUDED.first_name,
        last_name   = EXCLUDED.last_name,
        email       = COALESCE(EXCLUDED.email, customers.email),
        updated_at  = now()
  RETURNING id INTO v_customer_id;

  -- Mettre à jour l'adresse par défaut si fournie
  IF p_delivery_city IS NOT NULL AND p_delivery_address IS NOT NULL THEN
    -- Créer adresse si elle n'existe pas encore pour ce client
    INSERT INTO customer_addresses (customer_id, city, address, district, landmark, is_default, label)
    VALUES (v_customer_id, p_delivery_city, p_delivery_address, p_delivery_district, p_delivery_landmark, true, 'Livraison')
    ON CONFLICT DO NOTHING;
  END IF;

  -- Insérer la commande
  RETURN QUERY
  INSERT INTO orders (
    product_id, product_name, product_price,
    customer_first_name, customer_last_name, customer_phone,
    customer_email, customer_id, channel, assigned_agent_id,
    delivery_city, delivery_address, delivery_district, delivery_landmark,
    notes, callback_at, status
  ) VALUES (
    v_product.id, v_product.name_fr, v_product.price,
    p_first_name, p_last_name, p_phone,
    p_email, v_customer_id, p_channel, v_agent_id,
    p_delivery_city, p_delivery_address, p_delivery_district, p_delivery_landmark,
    p_notes, p_callback_at, 'new'
  )
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION create_order_admin TO authenticated;

COMMIT;
