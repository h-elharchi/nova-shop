-- ============================================================
-- NOVA SHOP — Lot Multicanal : Gestion contacts v2
-- Ordre d'exécution : 11 (après supabase-interactions.sql)
-- Idempotent — étend la table customers existante
-- ============================================================

BEGIN;

-- ─── Extensions table customers ──────────────────────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS status          TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','archived','blocked','merged','anonymized')),
  ADD COLUMN IF NOT EXISTS customer_number TEXT,
  ADD COLUMN IF NOT EXISTS phone2          TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_phone  TEXT,
  ADD COLUMN IF NOT EXISTS email2          TEXT,
  ADD COLUMN IF NOT EXISTS preferred_lang  TEXT DEFAULT 'fr' CHECK (preferred_lang IN ('fr','ar')),
  ADD COLUMN IF NOT EXISTS tags            TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS archived_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archive_reason  TEXT,
  ADD COLUMN IF NOT EXISTS anonymized_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS merged_into     UUID REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version         INTEGER NOT NULL DEFAULT 1;

-- Séquence pour numéros clients lisibles
CREATE SEQUENCE IF NOT EXISTS customer_seq START 1;

-- Générer customer_number pour les clients existants sans numéro
UPDATE customers
SET customer_number = 'CL-' || LPAD(nextval('customer_seq')::TEXT, 6, '0')
WHERE customer_number IS NULL;

-- Contrainte unique sur customer_number
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_customer_number_key'
  ) THEN
    ALTER TABLE customers ADD CONSTRAINT customers_customer_number_key UNIQUE (customer_number);
  END IF;
END $$;

-- Trigger auto-numérotation
CREATE OR REPLACE FUNCTION generate_customer_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.customer_number IS NULL THEN
    NEW.customer_number := 'CL-' || LPAD(nextval('customer_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customers_number_trig ON customers;
CREATE TRIGGER customers_number_trig
  BEFORE INSERT ON customers
  FOR EACH ROW EXECUTE FUNCTION generate_customer_number();

-- Trigger version pour contrôle de concurrence
CREATE OR REPLACE FUNCTION increment_customer_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS customers_version_trig ON customers;
CREATE TRIGGER customers_version_trig
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION increment_customer_version();

-- ─── Index complémentaires ────────────────────────────────────
CREATE INDEX IF NOT EXISTS customers_status_idx   ON customers (status);
CREATE INDEX IF NOT EXISTS customers_tags_idx     ON customers USING GIN (tags);
CREATE INDEX IF NOT EXISTS customers_number_idx   ON customers (customer_number);

-- ─── RLS : séparer les opérations ────────────────────────────
-- Supprimer l'ancienne policy globale
DROP POLICY IF EXISTS "staff_all_customers" ON customers;

-- SELECT : staff voit tout, anon rien
DROP POLICY IF EXISTS "staff_select_customers" ON customers;
CREATE POLICY "staff_select_customers" ON customers
  FOR SELECT USING (is_staff());

-- INSERT : staff peut créer
DROP POLICY IF EXISTS "staff_insert_customers" ON customers;
CREATE POLICY "staff_insert_customers" ON customers
  FOR INSERT WITH CHECK (is_staff());

-- UPDATE : staff peut modifier (pas les anonymisés ni les merged)
DROP POLICY IF EXISTS "staff_update_customers" ON customers;
CREATE POLICY "staff_update_customers" ON customers
  FOR UPDATE USING (is_staff() AND status NOT IN ('anonymized','merged'))
  WITH CHECK (is_staff());

-- DELETE : personne ne peut supprimer directement (uniquement via fonctions)
-- (Pas de policy DELETE → interdit pour tout le monde via l'API)

-- ─── Fonction : archiver un client ───────────────────────────
CREATE OR REPLACE FUNCTION archive_customer(
  p_customer_id UUID,
  p_reason      TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_customer RECORD;
  v_open_interactions INT;
  v_open_orders INT;
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer not found'; END IF;
  IF v_customer.status = 'anonymized' THEN RAISE EXCEPTION 'cannot archive anonymized customer'; END IF;
  IF v_customer.status = 'merged' THEN RAISE EXCEPTION 'cannot archive merged customer'; END IF;

  -- Vérifier interactions ouvertes
  SELECT COUNT(*) INTO v_open_interactions
  FROM interactions
  WHERE customer_id = p_customer_id
    AND status NOT IN ('closed','abandoned','timeout','failed');

  IF v_open_interactions > 0 AND NOT is_admin() THEN
    RAISE EXCEPTION 'customer has % open interaction(s)', v_open_interactions;
  END IF;

  -- Vérifier commandes non finalisées
  SELECT COUNT(*) INTO v_open_orders
  FROM orders
  WHERE customer_id = p_customer_id
    AND status NOT IN ('delivered','returned','cancelled');

  IF v_open_orders > 0 AND NOT is_admin() THEN
    RAISE EXCEPTION 'customer has % open order(s)', v_open_orders;
  END IF;

  UPDATE customers
  SET status = 'archived', archived_at = now(), archived_by = auth.uid(),
      archive_reason = p_reason, updated_at = now()
  WHERE id = p_customer_id;

  INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, customer_number, reason)
  VALUES (auth.uid(), 'archive_customer', 'customer', p_customer_id, v_customer.customer_number, p_reason);
END;
$$;

GRANT EXECUTE ON FUNCTION archive_customer TO authenticated;

-- ─── Fonction : restaurer un client ──────────────────────────
CREATE OR REPLACE FUNCTION restore_customer(p_customer_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_customer RECORD;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'permission denied'; END IF;

  SELECT * INTO v_customer FROM customers WHERE id = p_customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer not found'; END IF;
  IF v_customer.status != 'archived' THEN RAISE EXCEPTION 'customer is not archived'; END IF;

  UPDATE customers
  SET status = 'active', archived_at = NULL, archived_by = NULL,
      archive_reason = NULL, updated_at = now()
  WHERE id = p_customer_id;

  INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, customer_number, reason)
  VALUES (auth.uid(), 'restore_customer', 'customer', p_customer_id, v_customer.customer_number, NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION restore_customer TO authenticated;

-- ─── Fonction : supprimer / anonymiser un client ─────────────
CREATE OR REPLACE FUNCTION delete_customer(
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
  IF v_customer.status = 'merged' THEN RAISE EXCEPTION 'cannot delete merged customer'; END IF;

  -- Vérifier interactions ouvertes (bloquant même pour admin)
  IF EXISTS (
    SELECT 1 FROM interactions
    WHERE customer_id = p_customer_id
      AND status NOT IN ('closed','abandoned','timeout','failed')
  ) THEN
    RAISE EXCEPTION 'customer has open interactions — close them first';
  END IF;

  -- Vérifier s'il a un historique (commandes ou interactions passées)
  SELECT EXISTS(
    SELECT 1 FROM orders WHERE customer_id = p_customer_id
    UNION ALL
    SELECT 1 FROM interactions WHERE customer_id = p_customer_id
    UNION ALL
    SELECT 1 FROM callback_requests WHERE customer_id = p_customer_id
  ) INTO v_has_history;

  v_anon_label := 'SUPPRIMÉ ' || v_customer.customer_number;

  IF v_has_history THEN
    -- Anonymisation : effacer les PII, conserver l'enregistrement
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

    -- Anonymiser dans les adresses
    DELETE FROM customer_addresses WHERE customer_id = p_customer_id;

    -- Anonymiser dans chat_conversations (ne pas toucher aux messages)
    UPDATE chat_conversations SET
      customer_first_name = v_anon_label,
      customer_last_name  = '',
      customer_phone      = 'SUPPRIMÉ'
    WHERE customer_id = p_customer_id;

    INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, customer_number, reason)
    VALUES (auth.uid(), 'anonymize_customer', 'customer', p_customer_id, v_customer.customer_number, p_reason);

    RETURN 'anonymized';
  ELSE
    -- Suppression complète (pas d'historique)
    DELETE FROM customer_addresses WHERE customer_id = p_customer_id;
    DELETE FROM customers WHERE id = p_customer_id;

    INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, customer_number, reason)
    VALUES (auth.uid(), 'delete_customer', 'customer', p_customer_id, v_customer.customer_number, p_reason);

    RETURN 'deleted';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION delete_customer TO authenticated;

-- ─── RPC : vérifier doublon téléphone ou email ───────────────
CREATE OR REPLACE FUNCTION check_customer_duplicate(
  p_phone        TEXT,
  p_email        TEXT    DEFAULT NULL,
  p_exclude_id   UUID    DEFAULT NULL
)
RETURNS TABLE (customer_id UUID, customer_number TEXT, first_name TEXT, last_name TEXT, status TEXT)
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, customer_number, first_name, last_name, status
  FROM customers
  WHERE status NOT IN ('anonymized','merged')
    AND (id IS DISTINCT FROM p_exclude_id)
    AND (
      (p_phone IS NOT NULL AND phone = p_phone)
      OR (p_email IS NOT NULL AND LOWER(email) = LOWER(p_email))
    )
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION check_customer_duplicate TO authenticated;

-- ─── RPC : fusionner deux fiches client suspectées d'être la même personne ───
-- p_keep_id reste actif ; p_merge_id passe en status='merged' (conservé pour
-- traçabilité, RLS interdit déjà toute modification ultérieure). Les champs
-- de coordonnées (p_first_name..p_notes) sont les valeurs EXACTES choisies
-- par l'agent via l'écran de comparaison côté frontend — pas de décision
-- automatique ici.
CREATE OR REPLACE FUNCTION merge_customers(
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
SECURITY DEFINER SET search_path = public
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

GRANT EXECUTE ON FUNCTION merge_customers(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- ─── RPC : historique des modifications client ────────────────
-- Vue admin_audit_log pour un client donné
CREATE OR REPLACE FUNCTION get_customer_audit(p_customer_id UUID)
RETURNS TABLE (
  action TEXT, actor_email TEXT, reason TEXT, created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.action, p.email AS actor_email, a.reason, a.created_at
  FROM admin_audit_log a
  LEFT JOIN profiles p ON p.id = a.actor_id
  WHERE a.target_id = p_customer_id
  ORDER BY a.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION get_customer_audit TO authenticated;

-- ─── Vue clients enrichie (exclut anonymisés et merged par défaut) ──
CREATE OR REPLACE VIEW customers_view AS
SELECT
  c.*,
  COALESCE(o.order_count, 0) AS order_count,
  COALESCE(i.interaction_count, 0) AS interaction_count,
  o.last_order_at,
  i.last_interaction_at,
  da.city AS default_city
FROM customers c
LEFT JOIN (
  SELECT customer_id, COUNT(*) AS order_count, MAX(created_at) AS last_order_at
  FROM orders GROUP BY customer_id
) o ON o.customer_id = c.id
LEFT JOIN (
  SELECT customer_id, COUNT(*) AS interaction_count, MAX(created_at) AS last_interaction_at
  FROM interactions GROUP BY customer_id
) i ON i.customer_id = c.id
LEFT JOIN customer_addresses da ON da.customer_id = c.id AND da.is_default = true;

GRANT SELECT ON customers_view TO authenticated;

COMMIT;
