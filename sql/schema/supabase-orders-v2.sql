-- ============================================================
-- NOVA SHOP — Lot 5 : Extension orders v2
-- Multi-canal, customer_id, 12 statuts
-- Ordre d'exécution : 8 (après supabase-customers.sql)
-- ⚠ Idempotent SAUF la migration status. Vérifier l'état avant.
-- ============================================================

BEGIN;

-- ─── 1. Nouvelles colonnes ────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_id       UUID REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channel           TEXT NOT NULL DEFAULT 'site',
  ADD COLUMN IF NOT EXISTS assigned_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes             TEXT,
  ADD COLUMN IF NOT EXISTS callback_at       TIMESTAMPTZ;

-- ─── 2. Contrainte canal ──────────────────────────────────────
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_channel_check;
ALTER TABLE orders ADD CONSTRAINT orders_channel_check
  CHECK (channel IN ('site','whatsapp','email','chat','phone'));

-- ─── 3. Migration status 'completed' → 'delivered' ───────────
UPDATE orders SET status = 'delivered' WHERE status = 'completed';

-- ─── 4. Nouveaux statuts (12) ─────────────────────────────────
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'new',
    'assigned',
    'contacted',
    'unreachable',
    'callback',
    'confirmed',
    'processing',
    'shipped',
    'delivered',
    'returned',
    'cancelled',
    'on_hold'
  ));

-- ─── 5. Index ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS orders_customer_id_idx    ON orders (customer_id);
CREATE INDEX IF NOT EXISTS orders_channel_idx        ON orders (channel);
CREATE INDEX IF NOT EXISTS orders_agent_idx          ON orders (assigned_agent_id);
CREATE INDEX IF NOT EXISTS orders_callback_at_idx    ON orders (callback_at) WHERE callback_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_status_idx         ON orders (status);

-- ─── 6. Fonction RPC pour créer une commande admin ───────────
-- Crée ou réutilise le customer, puis insère la commande
CREATE OR REPLACE FUNCTION create_order_admin(
  p_product_id   UUID,
  p_channel      TEXT,
  p_first_name   TEXT,
  p_last_name    TEXT,
  p_phone        TEXT,
  p_notes        TEXT   DEFAULT NULL,
  p_callback_at  TIMESTAMPTZ DEFAULT NULL
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

  -- Créer ou réutiliser le customer
  INSERT INTO customers (phone, first_name, last_name, source)
  VALUES (p_phone, p_first_name, p_last_name, p_channel)
  ON CONFLICT (phone) DO UPDATE
    SET first_name = EXCLUDED.first_name,
        last_name  = EXCLUDED.last_name,
        updated_at = now()
  RETURNING id INTO v_customer_id;

  -- Insérer la commande
  RETURN QUERY
  INSERT INTO orders (
    product_id, product_name, product_price,
    customer_first_name, customer_last_name, customer_phone,
    customer_id, channel, assigned_agent_id,
    notes, callback_at, status
  ) VALUES (
    v_product.id, v_product.name_fr, v_product.price,
    p_first_name, p_last_name, p_phone,
    v_customer_id, p_channel, v_agent_id,
    p_notes, p_callback_at, 'new'
  )
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION create_order_admin TO authenticated;

COMMIT;
