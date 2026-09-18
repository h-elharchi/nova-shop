-- fix-merge-compare-addresses.sql
-- Ajoute la comparaison d'adresses à l'écran de fusion : l'agent choisit
-- explicitement quelle adresse (parmi celles des deux fiches) devient
-- l'adresse par défaut du client conservé, au lieu d'une déduction
-- automatique (fix-merge-duplicate-default-address.sql). Toutes les autres
-- adresses restent rattachées au client, juste non marquées par défaut.
--
-- ⚠ Signature changée (10 → 11 arguments) : DROP obligatoire.
--
-- Exécuter APRÈS fix-merge-duplicate-default-address.sql, dans Supabase SQL Editor.

DROP FUNCTION IF EXISTS public.merge_customers(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION public.merge_customers(
  p_keep_id             UUID,
  p_merge_id            UUID,
  p_first_name          TEXT,
  p_last_name           TEXT,
  p_phone               TEXT DEFAULT NULL,
  p_phone2              TEXT DEFAULT NULL,
  p_email               TEXT DEFAULT NULL,
  p_email2              TEXT DEFAULT NULL,
  p_whatsapp_phone      TEXT DEFAULT NULL,
  p_notes               TEXT DEFAULT NULL,
  p_default_address_id  UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_keep  customers%ROWTYPE;
  v_merge customers%ROWTYPE;
  v_keep_default_address_id UUID;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'permission denied'; END IF;
  IF p_keep_id = p_merge_id THEN RAISE EXCEPTION 'cannot merge a customer into itself'; END IF;

  SELECT * INTO v_keep  FROM customers WHERE id = p_keep_id  FOR UPDATE;
  SELECT * INTO v_merge FROM customers WHERE id = p_merge_id FOR UPDATE;

  IF v_keep.id IS NULL OR v_merge.id IS NULL THEN
    RAISE EXCEPTION 'customer not found';
  END IF;
  IF v_keep.status = 'merged' OR v_merge.status = 'merged' THEN
    RAISE EXCEPTION 'customer already merged';
  END IF;
  IF p_first_name IS NULL OR TRIM(p_first_name) = '' THEN
    RAISE EXCEPTION 'first_name required';
  END IF;
  IF NULLIF(TRIM(p_phone), '') IS NULL AND NULLIF(TRIM(p_email), '') IS NULL THEN
    RAISE EXCEPTION 'phone or email required';
  END IF;
  -- L'adresse choisie doit appartenir à l'un des deux clients fusionnés
  IF p_default_address_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM customer_addresses
    WHERE id = p_default_address_id AND customer_id IN (p_keep_id, p_merge_id)
  ) THEN
    RAISE EXCEPTION 'default_address_id does not belong to either customer';
  END IF;

  -- Marquer le client fusionné et libérer son téléphone AVANT de l'assigner
  -- au client conservé (contrainte UNIQUE sur phone).
  UPDATE customers SET
    status      = 'merged',
    merged_into = p_keep_id,
    phone       = NULL,
    version     = version + 1,
    updated_at  = now()
  WHERE id = p_merge_id;

  UPDATE customers SET
    first_name     = TRIM(p_first_name),
    last_name      = COALESCE(TRIM(p_last_name), ''),
    phone          = NULLIF(TRIM(p_phone), ''),
    phone2         = NULLIF(TRIM(p_phone2), ''),
    email          = NULLIF(TRIM(p_email), ''),
    email2         = NULLIF(TRIM(p_email2), ''),
    whatsapp_phone = NULLIF(TRIM(p_whatsapp_phone), ''),
    notes          = NULLIF(p_notes, ''),
    tags           = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(v_keep.tags, '{}') || COALESCE(v_merge.tags, '{}')))),
    version        = v_keep.version + 1,
    updated_at     = now()
  WHERE id = p_keep_id;

  -- Adresse par défaut du client conservé AVANT réaffectation (repli si
  -- l'agent n'a fait aucun choix explicite).
  SELECT id INTO v_keep_default_address_id
  FROM customer_addresses WHERE customer_id = p_keep_id AND is_default = true LIMIT 1;

  -- Rattacher tout l'historique du client fusionné au client conservé
  UPDATE orders             SET customer_id = p_keep_id WHERE customer_id = p_merge_id;
  UPDATE interactions       SET customer_id = p_keep_id WHERE customer_id = p_merge_id;
  UPDATE email_messages     SET customer_id = p_keep_id WHERE customer_id = p_merge_id;
  UPDATE callback_requests  SET customer_id = p_keep_id WHERE customer_id = p_merge_id;
  UPDATE customer_addresses SET customer_id = p_keep_id WHERE customer_id = p_merge_id;

  IF p_default_address_id IS NOT NULL THEN
    -- Choix explicite de l'agent : cette adresse devient la seule par défaut.
    UPDATE customer_addresses
    SET is_default = (id = p_default_address_id)
    WHERE customer_id = p_keep_id;
  ELSE
    -- Pas de choix (aucune adresse des deux côtés) : garantir au plus une
    -- adresse par défaut malgré tout, le trigger ne réagissant pas au
    -- changement de customer_id.
    UPDATE customer_addresses
    SET is_default = false
    WHERE customer_id = p_keep_id
      AND is_default = true
      AND id != COALESCE(
        v_keep_default_address_id,
        (SELECT id FROM customer_addresses
         WHERE customer_id = p_keep_id AND is_default = true
         ORDER BY updated_at DESC LIMIT 1)
      );
  END IF;

  INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, customer_number, reason)
  VALUES (
    auth.uid(), 'merge_customer', 'customer', p_merge_id, v_merge.customer_number,
    'merged into ' || COALESCE(v_keep.customer_number, p_keep_id::text)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_customers(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
) TO authenticated;
