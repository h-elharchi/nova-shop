-- ============================================================
-- NOVA SHOP — Lot Multicanal : Interactions unifiées
-- Ordre d'exécution : 10 (après supabase-email.sql)
-- Idempotent : peut être ré-exécuté sans risque
-- ============================================================

BEGIN;

-- ─── Séquence pour numérotation lisible ──────────────────────
CREATE SEQUENCE IF NOT EXISTS interaction_seq START 1;

-- ─── Channels de référence ───────────────────────────────────
CREATE TABLE IF NOT EXISTS interaction_channels (
  code        TEXT PRIMARY KEY,
  label_fr    TEXT NOT NULL,
  label_ar    TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO interaction_channels (code, label_fr, label_ar) VALUES
  ('website_chat',    'Chat Web',         'دردشة الموقع'),
  ('website_contact', 'Formulaire Contact','نموذج الاتصال'),
  ('email',           'Email',            'البريد الإلكتروني'),
  ('phone',           'Téléphone',        'الهاتف'),
  ('whatsapp',        'WhatsApp',         'واتساب')
ON CONFLICT (code) DO NOTHING;

-- ─── Table principale interactions ───────────────────────────
CREATE TABLE IF NOT EXISTS interactions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_number  TEXT        UNIQUE NOT NULL DEFAULT '',
  channel             TEXT        NOT NULL CHECK (channel IN ('chat','email','callback')),
  origin_channel      TEXT        REFERENCES interaction_channels(code),
  customer_id         UUID        REFERENCES customers(id) ON DELETE SET NULL,
  subject             TEXT,
  priority            INTEGER     NOT NULL DEFAULT 0,
  status              TEXT        NOT NULL DEFAULT 'queued'
                      CHECK (status IN (
                        'queued','offered','assigned','active',
                        'pending_customer','scheduled','wrap_up',
                        'closed','abandoned','timeout','failed'
                      )),
  queued_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at              TIMESTAMPTZ,
  offered_to          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  offered_at          TIMESTAMPTZ,
  offer_expires_at    TIMESTAMPTZ,
  assigned_agent_id   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at         TIMESTAMPTZ,
  first_response_at   TIMESTAMPTZ,
  closed_at           TIMESTAMPTZ,
  closed_by           UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  outcome             TEXT        CHECK (outcome IN ('treated','not_treated')),
  disposition_code_id UUID        REFERENCES crc_disposition_codes(id) ON DELETE SET NULL,
  wrap_up_notes       TEXT,
  wrap_up_started_at  TIMESTAMPTZ,
  wrap_up_seconds     INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger numérotation automatique
CREATE OR REPLACE FUNCTION generate_interaction_number()
RETURNS TRIGGER AS $$
BEGIN
  NEW.interaction_number := 'INT-' || TO_CHAR(now(), 'YYYY') || '-' ||
    LPAD(nextval('interaction_seq')::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS interactions_number_trig ON interactions;
CREATE TRIGGER interactions_number_trig
  BEFORE INSERT ON interactions
  FOR EACH ROW
  WHEN (NEW.interaction_number = '')
  EXECUTE FUNCTION generate_interaction_number();

-- Trigger updated_at
DROP TRIGGER IF EXISTS interactions_updated_at ON interactions;
CREATE TRIGGER interactions_updated_at
  BEFORE UPDATE ON interactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Index interactions ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS interactions_status_idx     ON interactions (status);
CREATE INDEX IF NOT EXISTS interactions_channel_idx    ON interactions (channel);
CREATE INDEX IF NOT EXISTS interactions_customer_idx   ON interactions (customer_id);
CREATE INDEX IF NOT EXISTS interactions_agent_idx      ON interactions (assigned_agent_id);
CREATE INDEX IF NOT EXISTS interactions_due_at_idx     ON interactions (due_at) WHERE due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS interactions_queued_at_idx  ON interactions (queued_at);
CREATE INDEX IF NOT EXISTS interactions_offered_to_idx ON interactions (offered_to) WHERE offered_to IS NOT NULL;

-- ─── Chronologie des événements ──────────────────────────────
CREATE TABLE IF NOT EXISTS interaction_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_id  UUID        NOT NULL REFERENCES interactions(id) ON DELETE CASCADE,
  event_type      TEXT        NOT NULL CHECK (event_type IN (
    'created','queued','offered','offer_accepted','offer_rejected','offer_expired',
    'assigned','reassigned','message_in','message_out','call_attempt',
    'transferred','rescheduled','status_changed','customer_modified',
    'order_created','wrap_up_started','closed','abandoned','timeout','failed'
  )),
  actor_id        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  data            JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ievents_interaction_idx ON interaction_events (interaction_id);
CREATE INDEX IF NOT EXISTS ievents_type_idx        ON interaction_events (event_type);
CREATE INDEX IF NOT EXISTS ievents_created_at_idx  ON interaction_events (created_at DESC);

-- ─── Fils email (1 thread Gmail = 1 objet persistant) ─────────
CREATE TABLE IF NOT EXISTS email_threads (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_thread_id  TEXT        UNIQUE NOT NULL,
  email_account_id UUID        REFERENCES email_accounts(id) ON DELETE SET NULL,
  subject          TEXT,
  from_address     TEXT,
  last_message_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ethreads_gmail_idx   ON email_threads (gmail_thread_id);
CREATE INDEX IF NOT EXISTS ethreads_account_idx ON email_threads (email_account_id);

-- Ajouter thread_id à email_messages (idempotent)
ALTER TABLE email_messages
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES email_threads(id) ON DELETE SET NULL;

-- Ajouter interaction_id à chat_conversations (idempotent)
ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS interaction_id UUID REFERENCES interactions(id) ON DELETE SET NULL;

-- Ajouter interaction_id à orders (idempotent)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS interaction_id UUID REFERENCES interactions(id) ON DELETE SET NULL;

-- ─── Demandes de rappel ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS callback_requests (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_id          UUID        REFERENCES interactions(id) ON DELETE SET NULL,
  customer_id             UUID        REFERENCES customers(id) ON DELETE SET NULL,
  first_name              TEXT        NOT NULL,
  last_name               TEXT        NOT NULL DEFAULT '',
  phone                   TEXT        NOT NULL,
  email                   TEXT,
  city                    TEXT,
  district                TEXT,
  address                 TEXT,
  landmark                TEXT,
  message                 TEXT,
  preferred_slot          TEXT        NOT NULL DEFAULT 'asap'
                          CHECK (preferred_slot IN ('asap','scheduled')),
  preferred_datetime      TIMESTAMPTZ,
  origin_conversation_id  UUID        REFERENCES chat_conversations(id) ON DELETE SET NULL,
  attempts_count          INTEGER     NOT NULL DEFAULT 0,
  max_attempts            INTEGER     NOT NULL DEFAULT 3,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cb_requests_interaction_idx ON callback_requests (interaction_id);
CREATE INDEX IF NOT EXISTS cb_requests_customer_idx    ON callback_requests (customer_id);
CREATE INDEX IF NOT EXISTS cb_requests_phone_idx       ON callback_requests (phone);

-- ─── Tentatives de rappel ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS callback_attempts (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  callback_request_id   UUID        NOT NULL REFERENCES callback_requests(id) ON DELETE CASCADE,
  agent_id              UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  attempted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  result                TEXT        NOT NULL CHECK (result IN (
    'reached','no_answer','busy','voicemail','wrong_number','callback_later'
  )),
  next_attempt_at       TIMESTAMPTZ,
  comment               TEXT
);

CREATE INDEX IF NOT EXISTS cb_attempts_request_idx ON callback_attempts (callback_request_id);
CREATE INDEX IF NOT EXISTS cb_attempts_agent_idx   ON callback_attempts (agent_id);

-- ─── Capacités agents par canal ──────────────────────────────
CREATE TABLE IF NOT EXISTS agent_channel_capacity (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel      TEXT    NOT NULL CHECK (channel IN ('chat','email','callback')),
  max_capacity INTEGER NOT NULL DEFAULT 3,
  is_enabled   BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, channel)
);

CREATE INDEX IF NOT EXISTS acc_agent_idx ON agent_channel_capacity (agent_id);

-- ─── Adresses clients ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_addresses (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID    NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label       TEXT    NOT NULL DEFAULT 'Adresse',
  city        TEXT,
  district    TEXT,
  address     TEXT,
  landmark    TEXT,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Garantir 1 seule adresse par défaut par client
CREATE OR REPLACE FUNCTION enforce_single_default_address()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE customer_addresses
    SET is_default = false
    WHERE customer_id = NEW.customer_id AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS single_default_address_trig ON customer_addresses;
CREATE TRIGGER single_default_address_trig
  AFTER INSERT OR UPDATE OF is_default ON customer_addresses
  FOR EACH ROW
  WHEN (NEW.is_default = true)
  EXECUTE FUNCTION enforce_single_default_address();

DROP TRIGGER IF EXISTS customer_addresses_updated_at ON customer_addresses;
CREATE TRIGGER customer_addresses_updated_at
  BEFORE UPDATE ON customer_addresses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS caddr_customer_idx ON customer_addresses (customer_id);

-- ─── Journal d'audit admin ────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  action          TEXT        NOT NULL,
  target_type     TEXT        NOT NULL DEFAULT 'customer',
  target_id       UUID        NOT NULL,
  customer_number TEXT,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_actor_idx   ON admin_audit_log (actor_id);
CREATE INDEX IF NOT EXISTS audit_log_target_idx  ON admin_audit_log (target_id);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON admin_audit_log (created_at DESC);

-- ─── Paramètres CRC complémentaires ──────────────────────────
-- Capacités par défaut par canal
INSERT INTO crc_settings (key, value, description) VALUES
  ('default_chat_capacity',       '3',    'Capacité chat par défaut par agent'),
  ('default_email_capacity',      '5',    'Capacité email par défaut par agent'),
  ('default_callback_capacity',   '1',    'Capacité rappel par défaut par agent'),
  ('chat_accept_delay_seconds',   '20',   'Délai d''acceptation d''une proposition chat (secondes)'),
  ('chat_distribution_mode',      '"offer"',   'Mode distribution chat : offer | direct'),
  ('email_distribution_mode',     '"direct"',  'Mode distribution email'),
  ('callback_distribution_mode',  '"direct"',  'Mode distribution rappel'),
  ('callback_max_attempts',       '3',    'Nombre maximal de tentatives rappel avant clôture auto'),
  ('callback_reschedule_delay_minutes', '30', 'Délai de reprogrammation rappel par défaut (minutes)'),
  ('callback_prefer_same_agent',  'true', 'Préférer le même agent pour un rappel reprogrammé'),
  ('email_first_response_target_minutes', '60', 'Délai cible de première réponse email (minutes)'),
  ('allow_agent_delete_customers', 'false', 'Autoriser les agents à supprimer définitivement des clients'),
  ('chat_email_required',         'false', 'Email obligatoire dans le formulaire chat'),
  ('callback_email_required',     'false', 'Email obligatoire dans le formulaire rappel')
ON CONFLICT (key) DO NOTHING;

-- ─── RLS ──────────────────────────────────────────────────────
ALTER TABLE interactions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE interaction_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_threads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE callback_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE callback_attempts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_channel_capacity ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE interaction_channels   ENABLE ROW LEVEL SECURITY;

-- interactions : staff FULL, anon rien
DROP POLICY IF EXISTS "staff_all_interactions" ON interactions;
CREATE POLICY "staff_all_interactions" ON interactions
  FOR ALL USING (is_staff()) WITH CHECK (is_staff());

-- interaction_events : staff SELECT seulement (INSERT via fonctions SECURITY DEFINER)
DROP POLICY IF EXISTS "staff_select_events" ON interaction_events;
CREATE POLICY "staff_select_events" ON interaction_events
  FOR SELECT USING (is_staff());

-- email_threads : staff ALL
DROP POLICY IF EXISTS "staff_all_email_threads" ON email_threads;
CREATE POLICY "staff_all_email_threads" ON email_threads
  FOR ALL USING (is_staff()) WITH CHECK (is_staff());

-- callback_requests : staff ALL
DROP POLICY IF EXISTS "staff_all_callback_requests" ON callback_requests;
CREATE POLICY "staff_all_callback_requests" ON callback_requests
  FOR ALL USING (is_staff()) WITH CHECK (is_staff());

-- callback_attempts : staff ALL
DROP POLICY IF EXISTS "staff_all_callback_attempts" ON callback_attempts;
CREATE POLICY "staff_all_callback_attempts" ON callback_attempts
  FOR ALL USING (is_staff()) WITH CHECK (is_staff());

-- agent_channel_capacity : staff SELECT, admin ALL
DROP POLICY IF EXISTS "staff_select_acc" ON agent_channel_capacity;
CREATE POLICY "staff_select_acc" ON agent_channel_capacity
  FOR SELECT USING (is_staff());

DROP POLICY IF EXISTS "admin_write_acc" ON agent_channel_capacity;
CREATE POLICY "admin_write_acc" ON agent_channel_capacity
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- customer_addresses : staff ALL
DROP POLICY IF EXISTS "staff_all_customer_addresses" ON customer_addresses;
CREATE POLICY "staff_all_customer_addresses" ON customer_addresses
  FOR ALL USING (is_staff()) WITH CHECK (is_staff());

-- admin_audit_log : staff SELECT
DROP POLICY IF EXISTS "staff_select_audit_log" ON admin_audit_log;
CREATE POLICY "staff_select_audit_log" ON admin_audit_log
  FOR SELECT USING (is_staff());

-- interaction_channels : tous peuvent lire
DROP POLICY IF EXISTS "public_select_channels" ON interaction_channels;
CREATE POLICY "public_select_channels" ON interaction_channels
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "admin_write_channels" ON interaction_channels;
CREATE POLICY "admin_write_channels" ON interaction_channels
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ─── Realtime ─────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE interactions;
ALTER PUBLICATION supabase_realtime ADD TABLE callback_requests;

-- ─── Fonction helper : insérer un événement ──────────────────
CREATE OR REPLACE FUNCTION log_interaction_event(
  p_interaction_id UUID,
  p_event_type     TEXT,
  p_actor_id       UUID DEFAULT NULL,
  p_data           JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  INSERT INTO interaction_events (interaction_id, event_type, actor_id, data)
  VALUES (p_interaction_id, p_event_type, p_actor_id, p_data);
$$;

REVOKE ALL ON FUNCTION log_interaction_event FROM PUBLIC;
GRANT EXECUTE ON FUNCTION log_interaction_event TO service_role;
GRANT EXECUTE ON FUNCTION log_interaction_event TO authenticated;

-- ─── RPC : créer une demande de rappel (depuis le site) ──────
CREATE OR REPLACE FUNCTION create_callback_request(
  p_first_name          TEXT,
  p_last_name           TEXT,
  p_phone               TEXT,
  p_email               TEXT    DEFAULT NULL,
  p_city                TEXT    DEFAULT NULL,
  p_district            TEXT    DEFAULT NULL,
  p_address             TEXT    DEFAULT NULL,
  p_landmark            TEXT    DEFAULT NULL,
  p_message             TEXT    DEFAULT NULL,
  p_preferred_slot      TEXT    DEFAULT 'asap',
  p_preferred_datetime  TIMESTAMPTZ DEFAULT NULL,
  p_origin_conv_id      UUID    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_customer_id UUID;
  v_interaction_id UUID;
  v_callback_id UUID;
  v_due_at TIMESTAMPTZ;
BEGIN
  -- Upsert customer
  INSERT INTO customers (phone, first_name, last_name, email, source)
  VALUES (p_phone, p_first_name, p_last_name, p_email, 'phone')
  ON CONFLICT (phone) DO UPDATE
    SET first_name = EXCLUDED.first_name,
        last_name  = EXCLUDED.last_name,
        email      = COALESCE(customers.email, EXCLUDED.email),
        updated_at = now()
  RETURNING id INTO v_customer_id;

  -- Calculer due_at
  v_due_at := CASE
    WHEN p_preferred_slot = 'scheduled' AND p_preferred_datetime IS NOT NULL
    THEN p_preferred_datetime
    ELSE now()
  END;

  -- Créer l'interaction
  INSERT INTO interactions (channel, origin_channel, customer_id, subject, status, queued_at, due_at)
  VALUES ('callback', 'website_contact', v_customer_id,
          COALESCE(p_message, 'Demande de rappel'),
          'queued', now(), v_due_at)
  RETURNING id INTO v_interaction_id;

  PERFORM log_interaction_event(v_interaction_id, 'created', NULL,
    jsonb_build_object('channel', 'callback', 'origin', 'website'));

  -- Créer la demande de rappel
  INSERT INTO callback_requests (
    interaction_id, customer_id, first_name, last_name, phone, email,
    city, district, address, landmark, message,
    preferred_slot, preferred_datetime, origin_conversation_id
  ) VALUES (
    v_interaction_id, v_customer_id, p_first_name, p_last_name, p_phone, p_email,
    p_city, p_district, p_address, p_landmark, p_message,
    p_preferred_slot, p_preferred_datetime, p_origin_conv_id
  ) RETURNING id INTO v_callback_id;

  RETURN v_callback_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_callback_request TO anon;
GRANT EXECUTE ON FUNCTION create_callback_request TO authenticated;

-- ─── RPC : enregistrer une tentative de rappel ───────────────
CREATE OR REPLACE FUNCTION record_callback_attempt(
  p_callback_request_id UUID,
  p_result              TEXT,
  p_comment             TEXT    DEFAULT NULL,
  p_next_attempt_at     TIMESTAMPTZ DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cb         RECORD;
  v_interaction RECORD;
  v_max_attempts INT;
  v_reschedule_delay INT;
  v_next_at    TIMESTAMPTZ;
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  SELECT cr.*, i.id AS i_id, i.status AS i_status
    INTO v_cb
  FROM callback_requests cr
  JOIN interactions i ON i.id = cr.interaction_id
  WHERE cr.id = p_callback_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'callback_request not found';
  END IF;

  -- Lire paramètres
  SELECT COALESCE((value::text)::int, 3) INTO v_max_attempts
  FROM crc_settings WHERE key = 'callback_max_attempts';

  SELECT COALESCE((value::text)::int, 30) INTO v_reschedule_delay
  FROM crc_settings WHERE key = 'callback_reschedule_delay_minutes';

  -- Calculer next_attempt_at
  v_next_at := COALESCE(p_next_attempt_at,
    CASE WHEN p_result IN ('no_answer','busy','voicemail')
    THEN now() + (v_reschedule_delay || ' minutes')::INTERVAL
    ELSE NULL END);

  -- Insérer la tentative
  INSERT INTO callback_attempts (callback_request_id, agent_id, result, next_attempt_at, comment)
  VALUES (p_callback_request_id, auth.uid(), p_result, v_next_at, p_comment);

  -- Mettre à jour le compteur
  UPDATE callback_requests SET attempts_count = attempts_count + 1
  WHERE id = p_callback_request_id;

  -- Logger l'événement
  PERFORM log_interaction_event(
    v_cb.i_id, 'call_attempt', auth.uid(),
    jsonb_build_object('result', p_result, 'attempt_number', v_cb.attempts_count + 1)
  );

  -- Logique de reprogrammation ou clôture auto
  IF p_result = 'callback_later' AND v_next_at IS NOT NULL THEN
    UPDATE interactions
    SET status = 'scheduled', due_at = v_next_at
    WHERE id = v_cb.i_id;
    PERFORM log_interaction_event(v_cb.i_id, 'rescheduled', auth.uid(),
      jsonb_build_object('next_at', v_next_at));

  ELSIF p_result IN ('no_answer','busy','voicemail') THEN
    IF (v_cb.attempts_count + 1) >= v_max_attempts THEN
      -- Clôture automatique
      UPDATE interactions
      SET status = 'closed', outcome = 'not_treated',
          closed_at = now(), closed_by = auth.uid(),
          disposition_code_id = (SELECT id FROM crc_disposition_codes WHERE code = 'NO_RESPONSE' LIMIT 1)
      WHERE id = v_cb.i_id;
      PERFORM log_interaction_event(v_cb.i_id, 'closed', auth.uid(),
        jsonb_build_object('reason', 'max_attempts_reached'));
    ELSE
      -- Reprogrammation auto
      UPDATE interactions
      SET status = 'scheduled', due_at = v_next_at
      WHERE id = v_cb.i_id;
      PERFORM log_interaction_event(v_cb.i_id, 'rescheduled', auth.uid(),
        jsonb_build_object('next_at', v_next_at, 'reason', p_result));
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION record_callback_attempt TO authenticated;

COMMIT;
