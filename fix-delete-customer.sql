-- fix-delete-customer.sql
-- Correctif : delete_customer échouait avec
--   "column customer_id does not exist"
-- La table chat_conversations n'a pas de colonne customer_id ;
-- l'anonymisation doit cibler les lignes par customer_phone.
--
-- Idempotent : CREATE OR REPLACE, signature inchangée.
-- Exécuter dans Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.delete_customer(
  p_customer_id  UUID,
  p_reason       TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_customer    RECORD;
  v_has_history BOOLEAN;
  v_allow_agent BOOLEAN;
  v_anon_label  TEXT;
BEGIN
  -- Vérification du rôle
  SELECT COALESCE((value::text)::boolean, false) INTO v_allow_agent
  FROM crc_settings WHERE key = 'allow_agent_delete_customers';

  IF NOT is_admin() AND NOT v_allow_agent THEN
    RAISE EXCEPTION 'permission denied: admin only';
  END IF;

  IF NOT is_staff() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer not found'; END IF;
  IF v_customer.status = 'anonymized' THEN RAISE EXCEPTION 'already anonymized'; END IF;
  IF v_customer.status = 'merged'     THEN RAISE EXCEPTION 'cannot delete merged customer'; END IF;

  -- Bloquer si interactions ouvertes
  IF EXISTS (
    SELECT 1 FROM interactions
    WHERE customer_id = p_customer_id
      AND status NOT IN ('closed','abandoned','timeout','failed')
  ) THEN
    RAISE EXCEPTION 'customer has open interactions — close them first';
  END IF;

  -- Vérifier s'il a un historique (commandes, interactions, rappels)
  SELECT EXISTS(
    SELECT 1 FROM orders            WHERE customer_id = p_customer_id
    UNION ALL
    SELECT 1 FROM interactions      WHERE customer_id = p_customer_id
    UNION ALL
    SELECT 1 FROM callback_requests WHERE customer_id = p_customer_id
  ) INTO v_has_history;

  v_anon_label := 'SUPPRIMÉ ' || v_customer.customer_number;

  IF v_has_history THEN
    -- ── Anonymisation : effacer les PII, conserver l'enregistrement ──
    UPDATE customers SET
      first_name      = v_anon_label,
      last_name       = '',
      phone           = 'SUPPRIMÉ-' || gen_random_uuid()::TEXT,
      phone2          = NULL,
      whatsapp_phone  = NULL,
      email           = NULL,
      email2          = NULL,
      notes           = NULL,
      tags            = '{}',
      status          = 'anonymized',
      anonymized_at   = now(),
      updated_at      = now()
    WHERE id = p_customer_id;

    -- Anonymiser dans les callback_requests
    UPDATE callback_requests SET
      first_name = v_anon_label,
      last_name  = '',
      phone      = 'SUPPRIMÉ',
      email      = NULL,
      city       = NULL, district = NULL, address = NULL, landmark = NULL,
      message    = '[données supprimées]'
    WHERE customer_id = p_customer_id;

    -- Supprimer les adresses
    DELETE FROM customer_addresses WHERE customer_id = p_customer_id;

    -- Anonymiser dans chat_conversations (par numéro de téléphone — pas de customer_id sur cette table)
    UPDATE chat_conversations SET
      customer_first_name = v_anon_label,
      customer_last_name  = '',
      customer_phone      = 'SUPPRIMÉ'
    WHERE customer_phone = v_customer.phone;

    INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, customer_number, reason)
    VALUES (auth.uid(), 'anonymize_customer', 'customer', p_customer_id, v_customer.customer_number, p_reason);

    RETURN 'anonymized';

  ELSE
    -- ── Suppression complète (pas d'historique) ───────────────────
    DELETE FROM customer_addresses WHERE customer_id = p_customer_id;
    DELETE FROM customers           WHERE id = p_customer_id;

    INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, customer_number, reason)
    VALUES (auth.uid(), 'delete_customer', 'customer', p_customer_id, v_customer.customer_number, p_reason);

    RETURN 'deleted';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_customer TO authenticated;
