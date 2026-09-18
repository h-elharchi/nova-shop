-- fix-order-site-flow.sql
-- Remplace le flux en 2 étapes (INSERT direct + RPC create_callback_request)
-- par un RPC atomique create_order_site qui :
--   1. vérifie le produit
--   2. upsert le client (par téléphone)
--   3. insère la commande avec customer_id déjà renseigné
--   4. crée le callback_request + l'interaction liés au client
--
-- Met aussi à jour le trigger trg_order_callback pour qu'il ne
-- double-crée pas l'interaction quand customer_id est déjà présent.
--
-- Idempotent — exécuter APRÈS supabase-workspace.sql et add-order-quantity.sql.
-- Nécessite aussi upsert_customer_default_address() (voir
-- supabase-orders-address.sql / fix-order-address-sync.sql).

-- ─── 1. Mettre à jour le trigger de sécurité ──────────────────
-- Il ne s'active plus que si customer_id est NULL
-- (= inserts directs hors RPC, pour rétro-compatibilité)

CREATE OR REPLACE FUNCTION trigger_create_order_callback()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id     UUID;
  v_callback_id     UUID;
  v_interaction_id  UUID;
  v_msg             TEXT;
BEGIN
  -- Uniquement commandes site
  IF NEW.channel IS DISTINCT FROM 'site' THEN
    RETURN NEW;
  END IF;

  -- Si customer_id déjà renseigné (flux via create_order_site),
  -- la commande et l'interaction sont déjà créées correctement.
  IF NEW.customer_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- ── Upsert client ────────────────────────────────────────────
  INSERT INTO customers (phone, first_name, last_name, email, source)
  VALUES (NEW.customer_phone, NEW.customer_first_name, NEW.customer_last_name, NEW.customer_email, 'site')
  ON CONFLICT (phone) DO UPDATE
    SET first_name = EXCLUDED.first_name,
        last_name  = EXCLUDED.last_name,
        updated_at = NOW()
  RETURNING id INTO v_customer_id;

  UPDATE orders SET customer_id = v_customer_id WHERE id = NEW.id;

  PERFORM upsert_customer_default_address(
    v_customer_id, NEW.delivery_city, NEW.delivery_address, NEW.delivery_district, NEW.delivery_landmark
  );

  -- ── Message ─────────────────────────────────────────────────
  v_msg := 'Commande site : ' || COALESCE(NEW.product_name, '—') ||
           CASE WHEN COALESCE(NEW.quantity, 1) > 1
                THEN ' ×' || NEW.quantity::TEXT
                ELSE '' END ||
           ' — ' || COALESCE((NEW.product_price * COALESCE(NEW.quantity,1))::TEXT, '0') || ' MAD';
  IF NEW.delivery_city    IS NOT NULL THEN v_msg := v_msg || ' | ' || NEW.delivery_city; END IF;
  IF NEW.delivery_address IS NOT NULL THEN v_msg := v_msg || ', '  || NEW.delivery_address; END IF;

  -- ── Callback + interaction ───────────────────────────────────
  INSERT INTO callback_requests (
    customer_id, first_name, last_name, phone, email,
    city, address, landmark, message, preferred_slot, max_attempts
  ) VALUES (
    v_customer_id, NEW.customer_first_name, NEW.customer_last_name, NEW.customer_phone, NEW.customer_email,
    NEW.delivery_city, NEW.delivery_address, NEW.delivery_landmark,
    v_msg, 'asap', 3
  ) RETURNING id INTO v_callback_id;

  INSERT INTO interactions (channel, customer_id, subject, status, queued_at, priority)
  VALUES ('callback', v_customer_id, v_msg, 'queued', NOW(), 1)
  RETURNING id INTO v_interaction_id;

  UPDATE callback_requests SET interaction_id = v_interaction_id WHERE id = v_callback_id;

  INSERT INTO interaction_events (interaction_id, event_type, data)
  VALUES (v_interaction_id, 'created', jsonb_build_object(
    'order_id', NEW.id, 'source', 'order_site_trigger',
    'product', NEW.product_name, 'price', NEW.product_price, 'quantity', NEW.quantity
  ));

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[trigger_create_order_callback] échec commande % : %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION trigger_create_order_callback() TO service_role;

DROP TRIGGER IF EXISTS trg_order_callback ON orders;
CREATE TRIGGER trg_order_callback
  AFTER INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION trigger_create_order_callback();

-- ─── 2. RPC create_order_site ─────────────────────────────────
-- Remplace le flux frontend direct INSERT + create_callback_request.
-- Accessible aux utilisateurs anonymes (formulaire de commande public).

DROP FUNCTION IF EXISTS create_order_site(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS create_order_site(UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION create_order_site(
  p_product_id        UUID,
  p_first_name        TEXT,
  p_last_name         TEXT,
  p_phone             TEXT,
  p_quantity          INTEGER     DEFAULT 1,
  p_email             TEXT        DEFAULT NULL,
  p_delivery_city     TEXT        DEFAULT NULL,
  p_delivery_address  TEXT        DEFAULT NULL,
  p_delivery_district TEXT        DEFAULT NULL,
  p_delivery_landmark TEXT        DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product        RECORD;
  v_customer_id    UUID;
  v_order_id       UUID;
  v_callback_id    UUID;
  v_interaction_id UUID;
  v_qty            INTEGER;
  v_msg            TEXT;
BEGIN
  v_qty := GREATEST(1, COALESCE(p_quantity, 1));

  -- ── Vérifier le produit ──────────────────────────────────────
  SELECT id, name_fr, price INTO v_product
  FROM products
  WHERE id = p_product_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_not_found';
  END IF;

  -- ── Upsert client ────────────────────────────────────────────
  INSERT INTO customers (phone, first_name, last_name, email, source)
  VALUES (p_phone, p_first_name, p_last_name, p_email, 'site')
  ON CONFLICT (phone) DO UPDATE
    SET first_name = EXCLUDED.first_name,
        last_name  = EXCLUDED.last_name,
        updated_at = NOW()
  RETURNING id INTO v_customer_id;

  PERFORM upsert_customer_default_address(
    v_customer_id, p_delivery_city, p_delivery_address, p_delivery_district, p_delivery_landmark
  );

  -- ── Insérer la commande avec customer_id ─────────────────────
  INSERT INTO orders (
    product_id,    product_name,      product_price,  quantity,
    customer_id,
    customer_first_name, customer_last_name, customer_phone, customer_email,
    channel,       status,
    delivery_city, delivery_address,  delivery_district, delivery_landmark
  ) VALUES (
    v_product.id,  v_product.name_fr, v_product.price, v_qty,
    v_customer_id,
    p_first_name,  p_last_name,       p_phone,          p_email,
    'site',        'new',
    p_delivery_city, p_delivery_address, p_delivery_district, p_delivery_landmark
  )
  RETURNING id INTO v_order_id;

  -- ── Callback + interaction (fail-safe) ───────────────────────
  BEGIN
    v_msg := 'Commande site : ' || v_product.name_fr ||
             CASE WHEN v_qty > 1 THEN ' ×' || v_qty::TEXT ELSE '' END ||
             ' — ' || (v_product.price * v_qty)::TEXT || ' MAD';
    IF p_delivery_city    IS NOT NULL THEN v_msg := v_msg || ' | ' || p_delivery_city;    END IF;
    IF p_delivery_address IS NOT NULL THEN v_msg := v_msg || ', '  || p_delivery_address; END IF;

    INSERT INTO callback_requests (
      customer_id, first_name, last_name, phone, email,
      city, address, landmark, message, preferred_slot, max_attempts
    ) VALUES (
      v_customer_id, p_first_name, p_last_name, p_phone, p_email,
      p_delivery_city, p_delivery_address, p_delivery_landmark,
      v_msg, 'asap', 3
    ) RETURNING id INTO v_callback_id;

    INSERT INTO interactions (channel, customer_id, subject, status, queued_at, priority)
    VALUES ('callback', v_customer_id, v_msg, 'queued', NOW(), 1)
    RETURNING id INTO v_interaction_id;

    UPDATE callback_requests SET interaction_id = v_interaction_id WHERE id = v_callback_id;

    INSERT INTO interaction_events (interaction_id, event_type, data)
    VALUES (v_interaction_id, 'created', jsonb_build_object(
      'order_id',   v_order_id,
      'source',     'order_site',
      'product',    v_product.name_fr,
      'price',      v_product.price,
      'quantity',   v_qty
    ));

  EXCEPTION WHEN OTHERS THEN
    -- La commande est créée ; le rappel échoue silencieusement
    RAISE WARNING '[create_order_site] callback failed for order % : %', v_order_id, SQLERRM;
  END;

  RETURN json_build_object(
    'order_id',       v_order_id,
    'customer_id',    v_customer_id,
    'interaction_id', v_interaction_id
  );
END;
$$;

-- Accessible depuis le formulaire public (anon) et les agents
GRANT EXECUTE ON FUNCTION create_order_site TO anon, authenticated;

-- ─── Vérification ─────────────────────────────────────────────
-- SELECT proname, pronargs FROM pg_proc WHERE proname = 'create_order_site';
-- SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'orders';
