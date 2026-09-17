-- fix-order-callback-trigger.sql
-- Crée automatiquement un rappel callback + interaction à chaque nouvelle commande
-- passée depuis le site client (channel = 'site').
--
-- Exécuter dans Supabase SQL Editor APRÈS supabase-workspace.sql.
-- Idempotent : peut être ré-exécuté sans danger.
--
-- Ce trigger complète l'appel frontend de create_callback_request.
-- Si les deux tournent simultanément, une contrainte UNIQUE sur (phone, created_at)
-- n'existe pas ; on accepte l'éventuel doublon rare plutôt que de bloquer.
-- En pratique, le frontend appelle le RPC et le trigger ne se déclenche que
-- si le RPC échoue côté client (réseau, timeout).

-- ─── Fonction de trigger ──────────────────────────────────────

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
  -- Uniquement pour les commandes passées depuis le site client
  IF NEW.channel IS DISTINCT FROM 'site' THEN
    RETURN NEW;
  END IF;

  -- ── Upsert client ────────────────────────────────────────────
  INSERT INTO customers (phone, first_name, last_name, email, source)
  VALUES (
    NEW.customer_phone,
    NEW.customer_first_name,
    NEW.customer_last_name,
    NEW.customer_email,
    'site'
  )
  ON CONFLICT (phone) DO UPDATE
    SET first_name  = EXCLUDED.first_name,
        last_name   = EXCLUDED.last_name,
        updated_at  = NOW()
  RETURNING id INTO v_customer_id;

  -- Lier la commande au client si ce n'est pas déjà fait
  IF NEW.customer_id IS NULL THEN
    UPDATE orders SET customer_id = v_customer_id WHERE id = NEW.id;
  END IF;

  -- ── Message pour l'agent ─────────────────────────────────────
  v_msg := 'Commande site : ' || COALESCE(NEW.product_name, '—') ||
           ' — ' || COALESCE(NEW.product_price::TEXT, '0') || ' MAD';

  IF NEW.delivery_city    IS NOT NULL THEN
    v_msg := v_msg || ' | ' || NEW.delivery_city;
  END IF;
  IF NEW.delivery_address IS NOT NULL THEN
    v_msg := v_msg || ', '  || NEW.delivery_address;
  END IF;

  -- ── Créer le callback_request ────────────────────────────────
  INSERT INTO callback_requests (
    customer_id,
    first_name,  last_name,  phone,
    email,       city,       address,  landmark,
    message,     preferred_slot,      max_attempts
  ) VALUES (
    v_customer_id,
    NEW.customer_first_name,
    NEW.customer_last_name,
    NEW.customer_phone,
    NEW.customer_email,
    NEW.delivery_city,
    NEW.delivery_address,
    NEW.delivery_landmark,
    v_msg,
    'asap',
    3
  )
  RETURNING id INTO v_callback_id;

  -- ── Créer l'interaction ──────────────────────────────────────
  INSERT INTO interactions (
    channel, customer_id, subject, status, queued_at, priority
  ) VALUES (
    'callback',
    v_customer_id,
    v_msg,
    'queued',
    NOW(),
    1
  )
  RETURNING id INTO v_interaction_id;

  -- ── Lier interaction ↔ callback ──────────────────────────────
  UPDATE callback_requests
  SET    interaction_id = v_interaction_id
  WHERE  id = v_callback_id;

  -- ── Log de création ──────────────────────────────────────────
  INSERT INTO interaction_events (interaction_id, event_type, data)
  VALUES (
    v_interaction_id,
    'created',
    jsonb_build_object(
      'order_id',   NEW.id,
      'source',     'order_site',
      'product',    NEW.product_name,
      'price',      NEW.product_price
    )
  );

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Ne pas bloquer la création de commande si le rappel échoue
  RAISE WARNING '[trigger_create_order_callback] échec pour la commande % : %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION trigger_create_order_callback() TO service_role;

-- ─── Trigger sur orders INSERT ────────────────────────────────

DROP TRIGGER IF EXISTS trg_order_callback ON orders;

CREATE TRIGGER trg_order_callback
  AFTER INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION trigger_create_order_callback();

-- ─── Vérification ─────────────────────────────────────────────
-- SELECT trigger_name, event_manipulation, action_timing
-- FROM information_schema.triggers
-- WHERE event_object_table = 'orders';
