-- fix-order-address-sync.sql
-- La ville d'un client restait vide (customers_view.default_city) même après
-- une commande renseignant la ville, pour deux raisons :
--   1. create_order_admin() n'enregistrait l'adresse par défaut QUE si la ville
--      ET l'adresse complète étaient toutes les deux fournies — une commande
--      avec juste la ville (sans adresse détaillée) ne créait donc rien.
--   2. Son "ON CONFLICT DO NOTHING" n'avait aucune contrainte UNIQUE derrière
--      sur customer_addresses — cette branche aurait de toute façon levé une
--      erreur Postgres si elle avait été atteinte.
--   3. create_order_site() (formulaire public) et son trigger de repli
--      trigger_create_order_callback() n'écrivaient JAMAIS dans
--      customer_addresses — seulement sur la commande elle-même.
--
-- Ce script introduit une fonction commune upsert_customer_default_address()
-- (créer l'adresse par défaut si absente, sinon compléter les champs
-- manquants sans écraser ce qui existe) et l'utilise dans les 3 points
-- d'entrée où un client peut donner sa ville.
--
-- Exécuter dans Supabase SQL Editor.

-- ─── Helper commun ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_customer_default_address(
  p_customer_id UUID,
  p_city        TEXT,
  p_address     TEXT DEFAULT NULL,
  p_district    TEXT DEFAULT NULL,
  p_landmark    TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_city IS NULL AND p_address IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM customer_addresses WHERE customer_id = p_customer_id AND is_default = true
  ) THEN
    UPDATE customer_addresses SET
      city       = COALESCE(p_city, city),
      address    = COALESCE(p_address, address),
      district   = COALESCE(p_district, district),
      landmark   = COALESCE(p_landmark, landmark),
      updated_at = now()
    WHERE customer_id = p_customer_id AND is_default = true;
  ELSE
    INSERT INTO customer_addresses (customer_id, city, address, district, landmark, is_default, label)
    VALUES (p_customer_id, p_city, p_address, p_district, p_landmark, true, 'Livraison');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_customer_default_address TO authenticated, anon;

-- ─── 1. create_order_admin() — corrige la condition ville+adresse ───
-- Signature réelle en base (13 arguments, avec p_quantity ajouté par
-- add-order-quantity.sql) — reprise à l'identique pour que CREATE OR REPLACE
-- remplace bien la fonction existante au lieu d'en créer une seconde surcharge
-- ambiguë. Si cette étape échoue à nouveau avec "not unique", exécuter d'abord :
--   SELECT p.oid, pg_get_function_identity_arguments(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'create_order_admin';
-- et adapter la liste de paramètres ci-dessous en conséquence.
CREATE OR REPLACE FUNCTION public.create_order_admin(
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

  SELECT id, name_fr, price INTO v_product
  FROM products WHERE id = p_product_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product not found or inactive';
  END IF;

  v_agent_id := auth.uid();

  INSERT INTO customers (phone, first_name, last_name, email, source)
  VALUES (p_phone, p_first_name, p_last_name, p_email, p_channel)
  ON CONFLICT (phone) DO UPDATE
    SET first_name  = EXCLUDED.first_name,
        last_name   = EXCLUDED.last_name,
        email       = COALESCE(EXCLUDED.email, customers.email),
        updated_at  = now()
  RETURNING id INTO v_customer_id;

  PERFORM upsert_customer_default_address(
    v_customer_id, p_delivery_city, p_delivery_address, p_delivery_district, p_delivery_landmark
  );

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

GRANT EXECUTE ON FUNCTION public.create_order_admin(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER
) TO authenticated;

-- ─── 2. create_order_site() — écrit désormais l'adresse par défaut ───
CREATE OR REPLACE FUNCTION public.create_order_site(
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

  SELECT id, name_fr, price INTO v_product
  FROM products
  WHERE id = p_product_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_not_found';
  END IF;

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
    RAISE WARNING '[create_order_site] callback failed for order % : %', v_order_id, SQLERRM;
  END;

  RETURN json_build_object(
    'order_id',       v_order_id,
    'customer_id',    v_customer_id,
    'interaction_id', v_interaction_id
  );
END;
$$;

-- GRANT dynamique : évite l'erreur "function name is not unique" si une autre
-- surcharge de create_order_site traîne encore (même classe de problème que
-- create_order_admin ci-dessus) — s'applique à toutes les signatures trouvées.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_order_site'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', r.sig);
  END LOOP;
END $$;

-- ─── 3. Trigger de repli (inserts directs hors RPC) ──────────
CREATE OR REPLACE FUNCTION public.trigger_create_order_callback()
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
  IF NEW.channel IS DISTINCT FROM 'site' THEN
    RETURN NEW;
  END IF;

  IF NEW.customer_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

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

  v_msg := 'Commande site : ' || COALESCE(NEW.product_name, '—') ||
           CASE WHEN COALESCE(NEW.quantity, 1) > 1
                THEN ' ×' || NEW.quantity::TEXT
                ELSE '' END ||
           ' — ' || COALESCE((NEW.product_price * COALESCE(NEW.quantity,1))::TEXT, '0') || ' MAD';
  IF NEW.delivery_city    IS NOT NULL THEN v_msg := v_msg || ' | ' || NEW.delivery_city; END IF;
  IF NEW.delivery_address IS NOT NULL THEN v_msg := v_msg || ', '  || NEW.delivery_address; END IF;

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

GRANT EXECUTE ON FUNCTION public.trigger_create_order_callback() TO service_role;

-- ─── 4. Backfill : renseigner l'adresse par défaut à partir des commandes
--        existantes pour les clients qui n'en ont pas encore ───────────
INSERT INTO customer_addresses (customer_id, city, address, district, landmark, is_default, label)
SELECT DISTINCT ON (o.customer_id)
  o.customer_id, o.delivery_city, o.delivery_address, o.delivery_district, o.delivery_landmark,
  true, 'Livraison'
FROM orders o
WHERE o.customer_id IS NOT NULL
  AND (o.delivery_city IS NOT NULL OR o.delivery_address IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM customer_addresses ca
    WHERE ca.customer_id = o.customer_id AND ca.is_default = true
  )
ORDER BY o.customer_id, o.created_at DESC;
