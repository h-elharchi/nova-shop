-- ============================================================
-- NOVA SHOP — Lot 5 : Base clients unifiée
-- Ordre d'exécution : 7 (après supabase-supervision.sql)
-- Idempotent : peut être ré-exécuté sans risque
-- ============================================================

BEGIN;

-- ─── Table clients ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      TEXT        UNIQUE NOT NULL,
  first_name TEXT        NOT NULL,
  last_name  TEXT        NOT NULL DEFAULT '',
  email      TEXT,
  notes      TEXT,
  source     TEXT        NOT NULL DEFAULT 'site'
               CHECK (source IN ('site','whatsapp','email','chat','phone')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger updated_at
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'customers_updated_at'
  ) THEN
    CREATE TRIGGER customers_updated_at
      BEFORE UPDATE ON customers
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- Index téléphone
CREATE INDEX IF NOT EXISTS customers_phone_idx  ON customers (phone);
CREATE INDEX IF NOT EXISTS customers_email_idx  ON customers (email) WHERE email IS NOT NULL;

-- ─── RLS ──────────────────────────────────────────────────────
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_all_customers" ON customers;
CREATE POLICY "staff_all_customers" ON customers
  USING  (is_staff())
  WITH CHECK (is_staff());

-- Realtime pour live-search
ALTER PUBLICATION supabase_realtime ADD TABLE customers;

COMMIT;
