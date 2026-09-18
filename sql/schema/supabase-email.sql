-- ============================================================
-- NOVA SHOP — Lot 6 : Canal email Gmail
-- Ordre d'exécution : 9 (après supabase-orders-v2.sql)
-- Prérequis Supabase : extension pg_net activée
-- ============================================================

BEGIN;

-- ─── Fonctions Vault (lues uniquement par service_role) ───────
CREATE OR REPLACE FUNCTION store_vault_secret(p_value TEXT, p_name TEXT)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER SET search_path = public, vault
AS $$
  SELECT vault.create_secret(p_value, p_name, 'Gmail OAuth token — NOVA SHOP');
$$;

CREATE OR REPLACE FUNCTION read_vault_secret(p_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER SET search_path = public, vault
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id = p_id;
$$;

CREATE OR REPLACE FUNCTION update_vault_secret(p_id UUID, p_new_value TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER SET search_path = public, vault
AS $$
  UPDATE vault.secrets SET secret = p_new_value WHERE id = p_id;
$$;

REVOKE ALL ON FUNCTION store_vault_secret  FROM PUBLIC;
REVOKE ALL ON FUNCTION read_vault_secret   FROM PUBLIC;
REVOKE ALL ON FUNCTION update_vault_secret FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION store_vault_secret  TO service_role;
GRANT  EXECUTE ON FUNCTION read_vault_secret   TO service_role;
GRANT  EXECUTE ON FUNCTION update_vault_secret TO service_role;

-- ─── Table : comptes Gmail connectés ──────────────────────────
CREATE TABLE IF NOT EXISTS email_accounts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  label               TEXT        NOT NULL,
  gmail_address       TEXT        UNIQUE NOT NULL,
  vault_refresh_token UUID,              -- référence vault.secrets.id
  token_expires_at    TIMESTAMPTZ,
  is_active           BOOLEAN     NOT NULL DEFAULT true,
  last_sync_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- ─── Table : messages email ───────────────────────────────────
CREATE TABLE IF NOT EXISTS email_messages (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email_account_id UUID        NOT NULL REFERENCES email_accounts(id) ON DELETE CASCADE,
  gmail_message_id TEXT        UNIQUE NOT NULL,
  gmail_thread_id  TEXT        NOT NULL,
  subject          TEXT,
  from_address     TEXT        NOT NULL,
  to_address       TEXT        NOT NULL,
  body_text        TEXT,
  body_html        TEXT,
  direction        TEXT        NOT NULL CHECK (direction IN ('in','out')),
  status           TEXT        NOT NULL DEFAULT 'new'
                   CHECK (status IN ('new','read','replied','archived')),
  customer_id      UUID        REFERENCES customers(id) ON DELETE SET NULL,
  order_id         UUID        REFERENCES orders(id)   ON DELETE SET NULL,
  received_at      TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ─── Table : journal de synchronisation ──────────────────────
CREATE TABLE IF NOT EXISTS email_sync_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email_account_id UUID        REFERENCES email_accounts(id) ON DELETE CASCADE,
  synced_at        TIMESTAMPTZ DEFAULT now(),
  messages_fetched INT         NOT NULL DEFAULT 0,
  error            TEXT
);

-- ─── Index ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS email_msgs_account_idx  ON email_messages (email_account_id);
CREATE INDEX IF NOT EXISTS email_msgs_status_idx   ON email_messages (status);
CREATE INDEX IF NOT EXISTS email_msgs_customer_idx ON email_messages (customer_id);
CREATE INDEX IF NOT EXISTS email_msgs_received_idx ON email_messages (received_at DESC);
CREATE INDEX IF NOT EXISTS email_msgs_thread_idx   ON email_messages (gmail_thread_id);

-- ─── RLS ──────────────────────────────────────────────────────
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sync_log ENABLE ROW LEVEL SECURITY;

-- Comptes : lecture staff, écriture admin
DROP POLICY IF EXISTS "staff_select_email_accounts" ON email_accounts;
CREATE POLICY "staff_select_email_accounts" ON email_accounts
  FOR SELECT USING (is_staff());

DROP POLICY IF EXISTS "admin_write_email_accounts" ON email_accounts;
CREATE POLICY "admin_write_email_accounts" ON email_accounts
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Messages : lecture/écriture staff
DROP POLICY IF EXISTS "staff_all_email_messages" ON email_messages;
CREATE POLICY "staff_all_email_messages" ON email_messages
  FOR ALL USING (is_staff()) WITH CHECK (is_staff());

-- Sync log : lecture staff uniquement
DROP POLICY IF EXISTS "staff_select_sync_log" ON email_sync_log;
CREATE POLICY "staff_select_sync_log" ON email_sync_log
  FOR SELECT USING (is_staff());

-- ─── Realtime ─────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE email_messages;

-- ─── Fonction : matching client par adresse email ────────────
CREATE OR REPLACE FUNCTION match_customer_by_email_address(p_from_address TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id
  FROM customers
  WHERE LOWER(email) = LOWER(TRIM(p_from_address))
  LIMIT 1;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION match_customer_by_email_address TO authenticated;

-- ─── Vue pratique : messages avec info compte ─────────────────
CREATE OR REPLACE VIEW email_messages_view AS
SELECT
  em.*,
  ea.label             AS account_label,
  ea.gmail_address     AS account_gmail_address,
  c.first_name         AS customer_first_name,
  c.last_name          AS customer_last_name,
  c.phone              AS customer_phone
FROM email_messages em
JOIN email_accounts ea ON em.email_account_id = ea.id
LEFT JOIN customers  c  ON em.customer_id      = c.id;

GRANT SELECT ON email_messages_view TO authenticated;

COMMIT;
