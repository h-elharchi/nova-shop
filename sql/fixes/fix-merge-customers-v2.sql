-- fix-merge-customers-v2.sql
-- Corrige un bug de merge_customers() : le téléphone du client fusionné
-- n'était recopié que dans "Téléphone 2" (secondaire), jamais dans le
-- téléphone principal — même quand le client conservé n'en avait aucun. Le
-- téléphone semblait donc "disparaître" lors d'une fusion.
--
-- Remplace aussi la logique auto-décidée par un mécanisme de comparaison :
-- merge_customers() accepte désormais la valeur EXACTE choisie par l'agent
-- pour chaque champ de coordonnées (prénom, nom, téléphone, téléphone 2,
-- email, email 2, whatsapp, notes) — c'est le frontend (écran de comparaison)
-- qui les détermine, plus l'automatique.
--
-- ⚠ La signature change (2 args → 10 args) : DROP obligatoire avant recréation,
-- sinon on se retrouve avec deux surcharges ambiguës (voir l'incident sur
-- create_order_admin — même cause).
--
-- Exécuter dans Supabase SQL Editor. Remplace fix-merge-customers.sql.

DROP FUNCTION IF EXISTS public.merge_customers(UUID, UUID);

CREATE OR REPLACE FUNCTION public.merge_customers(
  p_keep_id        UUID,
  p_merge_id       UUID,
  p_first_name     TEXT,
  p_last_name      TEXT,
  p_phone          TEXT DEFAULT NULL,
  p_phone2         TEXT DEFAULT NULL,
  p_email          TEXT DEFAULT NULL,
  p_email2         TEXT DEFAULT NULL,
  p_whatsapp_phone TEXT DEFAULT NULL,
  p_notes          TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_keep  customers%ROWTYPE;
  v_merge customers%ROWTYPE;
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

  -- Marquer le client fusionné et libérer son téléphone AVANT de l'assigner
  -- au client conservé (contrainte UNIQUE sur phone).
  UPDATE customers SET
    status      = 'merged',
    merged_into = p_keep_id,
    phone       = NULL,
    version     = version + 1,
    updated_at  = now()
  WHERE id = p_merge_id;

  -- Appliquer les valeurs choisies par l'agent sur le client conservé
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

  -- Rattacher tout l'historique du client fusionné au client conservé
  UPDATE orders             SET customer_id = p_keep_id WHERE customer_id = p_merge_id;
  UPDATE interactions       SET customer_id = p_keep_id WHERE customer_id = p_merge_id;
  UPDATE email_messages     SET customer_id = p_keep_id WHERE customer_id = p_merge_id;
  UPDATE callback_requests  SET customer_id = p_keep_id WHERE customer_id = p_merge_id;
  UPDATE customer_addresses SET customer_id = p_keep_id WHERE customer_id = p_merge_id;

  INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, customer_number, reason)
  VALUES (
    auth.uid(), 'merge_customer', 'customer', p_merge_id, v_merge.customer_number,
    'merged into ' || COALESCE(v_keep.customer_number, p_keep_id::text)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_customers(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;
