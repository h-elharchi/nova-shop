-- fix-merge-duplicate-default-address.sql
-- merge_customers() réaffecte les adresses du client fusionné au client
-- conservé via un simple UPDATE customer_id. Le trigger
-- single_default_address_trig ne se déclenche que sur un changement de la
-- colonne is_default elle-même (AFTER INSERT OR UPDATE OF is_default), pas
-- sur customer_id — donc si les deux clients avaient chacun une adresse par
-- défaut, le client conservé se retrouve avec DEUX adresses is_default=true.
-- customers_view (LEFT JOIN ... AND is_default = true) duplique alors la
-- ligne du client, une fois par adresse par défaut — symptôme observé :
-- même client, deux lignes, deux villes différentes.
--
-- Ce script : 1) corrige merge_customers() pour garantir une seule adresse
-- par défaut après réaffectation, 2) nettoie les données déjà affectées par
-- ce bug (clients ayant actuellement plusieurs adresses par défaut).
--
-- Exécuter APRÈS fix-merge-customers-v2.sql, dans Supabase SQL Editor.

-- ─── 1. Nettoyage des données déjà corrompues par le bug ─────
-- Ne garde comme "par défaut" que l'adresse la plus récemment modifiée par
-- client ; toutes les autres en doublon repassent à false.
UPDATE customer_addresses ca
SET is_default = false, updated_at = now()
WHERE ca.is_default = true
  AND ca.id NOT IN (
    SELECT DISTINCT ON (customer_id) id
    FROM customer_addresses
    WHERE is_default = true
    ORDER BY customer_id, updated_at DESC
  );

-- ─── 2. Correction de merge_customers() ───────────────────────
-- Signature inchangée (10 arguments) → CREATE OR REPLACE suffit.
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

  -- Adresse par défaut du client conservé AVANT réaffectation (pour décider
  -- laquelle garder en cas de doublon après le rattachement ci-dessous).
  SELECT id INTO v_keep_default_address_id
  FROM customer_addresses WHERE customer_id = p_keep_id AND is_default = true LIMIT 1;

  -- Rattacher tout l'historique du client fusionné au client conservé
  UPDATE orders             SET customer_id = p_keep_id WHERE customer_id = p_merge_id;
  UPDATE interactions       SET customer_id = p_keep_id WHERE customer_id = p_merge_id;
  UPDATE email_messages     SET customer_id = p_keep_id WHERE customer_id = p_merge_id;
  UPDATE callback_requests  SET customer_id = p_keep_id WHERE customer_id = p_merge_id;
  UPDATE customer_addresses SET customer_id = p_keep_id WHERE customer_id = p_merge_id;

  -- Garantir une seule adresse par défaut après réaffectation : le trigger
  -- single_default_address_trig ne se déclenche pas sur un changement de
  -- customer_id (seulement sur is_default), donc on le fait explicitement ici.
  -- Priorité à l'adresse par défaut que le client conservé avait déjà ; sinon
  -- la plus récemment modifiée parmi ce qu'il reste.
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
