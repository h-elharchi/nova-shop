-- add-order-quantity.sql
-- Ajoute la colonne quantity à orders et met à jour create_order_admin.
-- Idempotent — peut être ré-exécuté sans danger.

-- ─── 1. Colonne quantity ──────────────────────────────────────

ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_quantity_check' AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_quantity_check CHECK (quantity > 0);
  END IF;
END;
$$;

-- ─── 2. Drop toutes les surcharges de create_order_admin ──────
-- La signature a évolué entre les lots ; on supprime toutes les
-- variantes connues avant de recréer.

DROP FUNCTION IF EXISTS create_order_admin(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS create_order_admin(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS create_order_admin(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER);

-- ─── 3. Nouvelle version complète ────────────────────────────

CREATE OR REPLACE FUNCTION create_order_admin(
  p_product_id        UUID,
  p_channel           TEXT,
  p_first_name        TEXT,
  p_last_name         TEXT,
  p_phone             TEXT,
  p_email             TEXT        DEFAULT NULL,
  p_delivery_city     TEXT        DEFAULT NULL,
  p_delivery_address  TEXT        DEFAULT NULL,
  p_delivery_district TEXT        DEFAULT NULL,
  p_delivery_landmark TEXT        DEFAULT NULL,
  p_notes             TEXT        DEFAULT NULL,
  p_callback_at       TIMESTAMPTZ DEFAULT NULL,
  p_quantity          INTEGER     DEFAULT 1
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

  IF COALESCE(p_quantity, 1) < 1 THEN
    RAISE EXCEPTION 'quantity must be >= 1';
  END IF;

  -- Récupérer le produit
  SELECT id, name_fr, price INTO v_product
  FROM products WHERE id = p_product_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product not found or inactive';
  END IF;

  v_agent_id := auth.uid();

  -- Créer ou réutiliser le customer
  INSERT INTO customers (phone, first_name, last_name, email, source)
  VALUES (p_phone, p_first_name, p_last_name, p_email, p_channel)
  ON CONFLICT (phone) DO UPDATE
    SET first_name = EXCLUDED.first_name,
        last_name  = EXCLUDED.last_name,
        updated_at = now()
  RETURNING id INTO v_customer_id;

  -- Insérer la commande
  RETURN QUERY
  INSERT INTO orders (
    product_id,    product_name,      product_price,
    quantity,
    customer_first_name, customer_last_name, customer_phone, customer_email,
    customer_id,   channel,           assigned_agent_id,
    delivery_city, delivery_address,  delivery_district, delivery_landmark,
    notes,         callback_at,       status
  ) VALUES (
    v_product.id,  v_product.name_fr, v_product.price,
    COALESCE(p_quantity, 1),
    p_first_name,  p_last_name,       p_phone,          p_email,
    v_customer_id, p_channel,         v_agent_id,
    p_delivery_city, p_delivery_address, p_delivery_district, p_delivery_landmark,
    p_notes,       p_callback_at,     'new'
  )
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION create_order_admin TO authenticated;

-- ─── Vérification ─────────────────────────────────────────────
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'orders' AND column_name = 'quantity';
