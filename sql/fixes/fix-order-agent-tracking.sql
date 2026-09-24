-- fix-order-agent-tracking.sql
-- Trace quel agent est intervenu sur une commande (création, confirmation,
-- annulation...). Jusqu'ici, orders.assigned_agent_id n'était renseigné
-- qu'une fois, à la création, et jamais mis à jour ; les changements de
-- statut passaient par un simple UPDATE sans acteur ni historique.
--
-- Ajoute :
--   1. Table order_status_history (order_id, actor_id, old_status, new_status,
--      note, created_at) — lecture staff uniquement, écriture via RPC only.
--   2. RPC update_order_status() — remplace le UPDATE direct fait jusqu'ici
--      par useOrders().updateStatus ; journalise auth.uid() à chaque
--      changement.
--   3. Journalisation de la création elle-même dans create_order_admin(),
--      create_order_site() et son trigger de repli, pour que "création"
--      apparaisse dans la même timeline que les changements de statut.
--
-- Nécessite fix-order-address-sync.sql déjà exécuté (fournit
-- upsert_customer_default_address(), réutilisée ici telle quelle).
--
-- Exécuter dans Supabase SQL Editor.

-- ─── 1. Table d'historique ────────────────────────────────────
-- actor_id référence directement public.profiles (pas auth.users) : c'est ce
-- que PostgREST exige pour pouvoir résoudre profiles!actor_id(...) côté
-- frontend — voir fix-orders-foreign-keys.sql pour la même correction sur
-- orders.assigned_agent_id.
CREATE TABLE IF NOT EXISTS order_status_history (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  actor_id   UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  old_status TEXT,
  new_status TEXT        NOT NULL,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_status_history_order_idx   ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS order_status_history_created_idx ON order_status_history(created_at DESC);

ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_select_order_status_history" ON order_status_history;
CREATE POLICY "staff_select_order_status_history"
  ON order_status_history FOR SELECT
  USING (is_staff());

-- Pas de policy INSERT pour authenticated/anon : uniquement via les fonctions
-- SECURITY DEFINER ci-dessous (create_order_admin, create_order_site,
-- update_order_status, trigger_create_order_callback).

-- ─── 2. RPC : changer le statut avec journalisation ───────────
CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id UUID,
  p_status   TEXT,
  p_note     TEXT DEFAULT NULL
)
RETURNS SETOF orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_status TEXT;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'permission denied'; END IF;

  SELECT status INTO v_old_status FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;

  IF v_old_status IS DISTINCT FROM p_status THEN
    UPDATE orders SET status = p_status, updated_at = now() WHERE id = p_order_id;

    INSERT INTO order_status_history (order_id, actor_id, old_status, new_status, note)
    VALUES (p_order_id, auth.uid(), v_old_status, p_status, NULLIF(p_note, ''));
  END IF;

  RETURN QUERY SELECT * FROM orders WHERE id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_order_status(UUID, TEXT, TEXT) TO authenticated;

-- ─── 3. Journaliser la création dans create_order_admin() ─────
-- Signature inchangée (13 arguments, avec p_quantity) → CREATE OR REPLACE
-- suffit, pas de DROP.
CREATE OR REPLACE FUNCTION public.create_order_admin(
  p_product_id         UUID,
  p_channel            TEXT,
  p_first_name         TEXT,
  p_last_name          TEXT,
  p_phone              TEXT,
  p_email              TEXT        DEFAULT NULL,
  p_delivery_city      TEXT        DEFAULT NULL,
  p_delivery_address   TEXT        DEFAULT NULL,
  p_delivery_district  TEXT        DEFAULT NULL,
  p_delivery_landmark  TEXT        DEFAULT NULL,
  p_notes              TEXT        DEFAULT NULL,
  p_callback_at        TIMESTAMPTZ DEFAULT NULL,
  p_quantity           INTEGER     DEFAULT 1
)
RETURNS SETOF orders
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_product      RECORD;
  v_customer_id  UUID;
  v_agent_id     UUID;
  v_order        orders%ROWTYPE;
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
  RETURNING * INTO v_order;

  INSERT INTO order_status_history (order_id, actor_id, old_status, new_status, note)
  VALUES (v_order.id, v_agent_id, NULL, 'new', 'Commande créée (' || p_channel || ')');

  RETURN QUERY SELECT * FROM orders WHERE id = v_order.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_order_admin(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER
) TO authenticated;

-- ─── 4. Journaliser la création dans create_order_site() ──────
-- Signature inchangée (10 arguments) → CREATE OR REPLACE suffit.
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

  INSERT INTO order_status_history (order_id, actor_id, old_status, new_status, note)
  VALUES (v_order_id, NULL, NULL, 'new', 'Commande créée depuis le site');

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

GRANT EXECUTE ON FUNCTION public.create_order_site(
  UUID, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon, authenticated;

-- ─── 5. Journaliser la création dans le trigger de repli ──────
-- Signature inchangée (trigger, sans arguments) → CREATE OR REPLACE suffit.
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

  INSERT INTO order_status_history (order_id, actor_id, old_status, new_status, note)
  VALUES (NEW.id, NULL, NULL, 'new', 'Commande créée depuis le site');

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

-- ─── 6. Backfill : entrée "création" pour les commandes existantes ───
-- Sans acteur connu (pas d'historique avant ce script) — juste pour que la
-- timeline ne parte pas vide sur les commandes déjà en base.
INSERT INTO order_status_history (order_id, actor_id, old_status, new_status, note, created_at)
SELECT o.id, o.assigned_agent_id, NULL, 'new', 'Historique reconstitué (avant activation du suivi)', o.created_at
FROM orders o
WHERE NOT EXISTS (SELECT 1 FROM order_status_history h WHERE h.order_id = o.id);
