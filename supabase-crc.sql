-- ============================================================
-- supabase-crc.sql — NOVA SHOP Lot 2 : Poste de travail CRC
-- Idempotent : CREATE … IF NOT EXISTS, CREATE OR REPLACE
-- Exécuter APRÈS supabase-accounts.sql
-- ============================================================

-- ── 1. Extensions chat_agents ─────────────────────────────────────────────────

-- Ajouter le statut 'pause' (recréer la contrainte)
ALTER TABLE public.chat_agents
  DROP CONSTRAINT IF EXISTS chat_agents_status_check;
ALTER TABLE public.chat_agents
  ADD CONSTRAINT chat_agents_status_check
  CHECK (status IN ('offline', 'available', 'busy', 'pause'));

ALTER TABLE public.chat_agents
  ADD COLUMN IF NOT EXISTS capacity                  INTEGER     NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS active_conversations_count INTEGER    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pause_reason_id           UUID,
  ADD COLUMN IF NOT EXISTS status_changed_at         TIMESTAMPTZ DEFAULT now();

-- ── 2. Extensions chat_conversations ─────────────────────────────────────────

ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS assigned_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS disposition_code_id UUID,
  ADD COLUMN IF NOT EXISTS wrap_up_seconds    INTEGER,
  ADD COLUMN IF NOT EXISTS internal_notes     TEXT,
  ADD COLUMN IF NOT EXISTS transferred_from_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index pour KPIs et recherche
CREATE INDEX IF NOT EXISTS idx_chat_conv_assigned_at  ON public.chat_conversations (assigned_at);
CREATE INDEX IF NOT EXISTS idx_chat_conv_closed_at    ON public.chat_conversations (closed_at);
CREATE INDEX IF NOT EXISTS idx_chat_conv_status_date  ON public.chat_conversations (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conv_phone        ON public.chat_conversations (customer_phone);
CREATE INDEX IF NOT EXISTS idx_chat_conv_admin        ON public.chat_conversations (assigned_admin_id);

-- ── 3. Table crc_settings ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.crc_settings (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT        UNIQUE NOT NULL,
  value       JSONB       NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  updated_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.crc_settings (key, value, description) VALUES
  ('max_conversations_per_agent',     '3',    'Conversations simultanées max par agent'),
  ('waiting_alert_seconds',           '120',  'Alerte si attente > N secondes'),
  ('long_wait_alert_seconds',         '300',  'Alerte critique si attente > N secondes'),
  ('service_level_threshold_seconds', '30',   'Seuil de temps de réponse (secondes)'),
  ('service_level_target_percent',    '80',   'Objectif niveau de service (%)'),
  ('wrap_up_timeout_seconds',         '300',  'Délai de wrap-up max avant libération'),
  ('sound_notifications_enabled',     'true', 'Notifications sonores'),
  ('browser_notifications_enabled',   'true', 'Notifications navigateur')
ON CONFLICT (key) DO NOTHING;

-- ── 4. Table crc_pause_reasons ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.crc_pause_reasons (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name_fr       TEXT    NOT NULL,
  name_ar       TEXT    NOT NULL,
  is_active     BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.crc_pause_reasons (name_fr, name_ar, display_order) VALUES
  ('Déjeuner',          'استراحة الغداء',  1),
  ('Formation',         'تدريب',           2),
  ('Administratif',     'مهام إدارية',     3),
  ('Pause courte',      'استراحة قصيرة',   4),
  ('Réunion d''équipe', 'اجتماع الفريق',   5)
ON CONFLICT DO NOTHING;

ALTER TABLE public.chat_agents
  DROP CONSTRAINT IF EXISTS chat_agents_pause_reason_fk;
ALTER TABLE public.chat_agents
  ADD CONSTRAINT chat_agents_pause_reason_fk
  FOREIGN KEY (pause_reason_id) REFERENCES public.crc_pause_reasons(id) ON DELETE SET NULL;

-- ── 5. Table crc_disposition_codes ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.crc_disposition_codes (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT    NOT NULL,
  name_fr       TEXT    NOT NULL,
  name_ar       TEXT    NOT NULL,
  is_active     BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.crc_disposition_codes (code, name_fr, name_ar, display_order) VALUES
  ('RESOLVED',    'Résolu',               'تم الحل',                1),
  ('CALLBACK',    'Rappel nécessaire',    'يحتاج متابعة',           2),
  ('ORDER',       'Commande effectuée',   'تم الطلب',               3),
  ('INFO',        'Information fournie',  'تم تقديم المعلومات',     4),
  ('TRANSFERRED', 'Transféré',            'تم التحويل',             5),
  ('SPAM',        'Spam / Test',          'إساءة / اختبار',         6),
  ('NO_RESPONSE', 'Sans réponse client',  'عدم رد العميل',          7)
ON CONFLICT DO NOTHING;

ALTER TABLE public.chat_conversations
  DROP CONSTRAINT IF EXISTS chat_conv_disposition_fk;
ALTER TABLE public.chat_conversations
  ADD CONSTRAINT chat_conv_disposition_fk
  FOREIGN KEY (disposition_code_id) REFERENCES public.crc_disposition_codes(id) ON DELETE SET NULL;

-- ── 6. Table crc_quick_replies ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.crc_quick_replies (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  title_fr      TEXT    NOT NULL,
  title_ar      TEXT    NOT NULL,
  message_fr    TEXT    NOT NULL,
  message_ar    TEXT    NOT NULL,
  shortcut      TEXT,
  is_active     BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  created_by    UUID    REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.crc_quick_replies (title_fr, title_ar, message_fr, message_ar, shortcut, display_order) VALUES
  ('Bonjour', 'مرحباً',
   'Bonjour ! Bienvenue chez NOVA SHOP. Comment puis-je vous aider ?',
   'مرحباً ! أهلاً وسهلاً بكم في NOVA SHOP. كيف أستطيع مساعدتكم؟',
   'bonjour', 1),
  ('Au revoir', 'مع السلامة',
   'Merci de nous avoir contactés. N''hésitez pas à revenir si vous avez d''autres questions. Bonne journée !',
   'شكراً لتواصلكم معنا. لا تترددوا في العودة إذا كان لديكم استفسارات أخرى. وداعاً!',
   'aurevoir', 2),
  ('Délai de livraison', 'مدة التوصيل',
   'Les délais de livraison sont de 2 à 5 jours ouvrables selon votre région au Maroc.',
   'مدة التوصيل من 2 إلى 5 أيام عمل حسب منطقتكم في المغرب.',
   'livraison', 3),
  ('En cours de traitement', 'جارٍ المعالجة',
   'Votre demande est bien reçue, je la traite et reviens vers vous dans quelques instants.',
   'تم استلام طلبكم، أعمل على معالجته وسأعود إليكم خلال لحظات.',
   'traitement', 4),
  ('Paiement à la livraison', 'الدفع عند التوصيل',
   'Nous proposons uniquement le paiement à la livraison (cash). Le paiement se fait directement au livreur.',
   'نقدم فقط الدفع عند الاستلام (نقداً). يتم الدفع مباشرة للمندوب.',
   'paiement', 5)
ON CONFLICT DO NOTHING;

-- ── 7. Fonctions SQL — mises à jour ──────────────────────────────────────────

-- Suppression préalable des fonctions dont la signature ou le type de retour change.
-- PostgreSQL interdit CREATE OR REPLACE si le type de retour est modifié.
DROP FUNCTION IF EXISTS public.update_agent_heartbeat(TEXT);
DROP FUNCTION IF EXISTS public.claim_conversation(UUID);
DROP FUNCTION IF EXISTS public.check_agents_online();

-- update_agent_heartbeat étendu (pause_reason + status_changed_at)
CREATE OR REPLACE FUNCTION public.update_agent_heartbeat(
  p_status          TEXT DEFAULT NULL,
  p_pause_reason_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE chat_agents SET
    last_seen_at      = now(),
    updated_at        = now(),
    status            = COALESCE(p_status, status),
    pause_reason_id   = CASE
                          WHEN p_status = 'pause' THEN p_pause_reason_id
                          WHEN p_status IS NOT NULL AND p_status != 'pause' THEN NULL
                          ELSE pause_reason_id
                        END,
    status_changed_at = CASE
                          WHEN p_status IS NOT NULL AND p_status IS DISTINCT FROM status THEN now()
                          ELSE status_changed_at
                        END
  WHERE user_id = auth.uid();
END;
$$;

-- claim_conversation avec vérification de capacité
CREATE OR REPLACE FUNCTION public.claim_conversation(p_conversation_id UUID)
RETURNS SETOF public.chat_conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity   INTEGER;
  v_active_cnt INTEGER;
BEGIN
  SELECT capacity, active_conversations_count
  INTO   v_capacity, v_active_cnt
  FROM   chat_agents
  WHERE  user_id = auth.uid()
  FOR    UPDATE;

  IF v_capacity IS NULL THEN
    RAISE EXCEPTION 'Agent not found';
  END IF;

  IF v_active_cnt >= v_capacity THEN
    RAISE EXCEPTION 'capacity_reached';
  END IF;

  RETURN QUERY
  UPDATE chat_conversations SET
    status            = 'active',
    assigned_admin_id = auth.uid(),
    assigned_at       = now(),
    queue_position    = NULL,
    updated_at        = now()
  WHERE id = p_conversation_id
    AND status = 'waiting'
  RETURNING *;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'already_taken';
  END IF;

  UPDATE chat_agents
  SET active_conversations_count = active_conversations_count + 1
  WHERE user_id = auth.uid();

  INSERT INTO chat_messages (conversation_id, sender_type, sender_id, message)
  VALUES (p_conversation_id, 'system', NULL, 'conversation_started');
END;
$$;

-- close_conversation avec décrémentation du compteur
CREATE OR REPLACE FUNCTION public.close_conversation(p_conversation_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  SELECT assigned_admin_id INTO v_admin_id
  FROM   chat_conversations
  WHERE  id = p_conversation_id;

  UPDATE chat_conversations SET
    status     = 'closed',
    closed_at  = now(),
    closed_by  = auth.uid(),
    updated_at = now()
  WHERE id = p_conversation_id
    AND status IN ('active', 'waiting');

  IF v_admin_id IS NOT NULL THEN
    UPDATE chat_agents
    SET active_conversations_count = GREATEST(0, active_conversations_count - 1)
    WHERE user_id = v_admin_id;
  END IF;
END;
$$;

-- Fermeture avec qualification (wrap-up)
CREATE OR REPLACE FUNCTION public.close_conversation_with_wrapup(
  p_conversation_id UUID,
  p_disposition_id  UUID    DEFAULT NULL,
  p_internal_notes  TEXT    DEFAULT NULL,
  p_wrap_up_seconds INTEGER DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  SELECT assigned_admin_id INTO v_admin_id
  FROM   chat_conversations
  WHERE  id = p_conversation_id;

  UPDATE chat_conversations SET
    status              = 'closed',
    closed_at           = now(),
    closed_by           = auth.uid(),
    disposition_code_id = p_disposition_id,
    internal_notes      = p_internal_notes,
    wrap_up_seconds     = p_wrap_up_seconds,
    updated_at          = now()
  WHERE id = p_conversation_id;

  IF v_admin_id IS NOT NULL THEN
    UPDATE chat_agents
    SET active_conversations_count = GREATEST(0, active_conversations_count - 1)
    WHERE user_id = v_admin_id;
  END IF;
END;
$$;

-- Transfert de conversation
CREATE OR REPLACE FUNCTION public.transfer_conversation(
  p_conversation_id UUID,
  p_target_admin_id UUID,
  p_transfer_note   TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_admin_id UUID;
  v_target_capacity INTEGER;
  v_target_active   INTEGER;
BEGIN
  SELECT assigned_admin_id INTO v_source_admin_id
  FROM   chat_conversations
  WHERE  id = p_conversation_id AND status = 'active';

  IF v_source_admin_id IS NULL THEN
    RAISE EXCEPTION 'Conversation not active';
  END IF;

  SELECT capacity, active_conversations_count
  INTO   v_target_capacity, v_target_active
  FROM   chat_agents
  WHERE  user_id = p_target_admin_id
  FOR    UPDATE;

  IF v_target_active >= v_target_capacity THEN
    RAISE EXCEPTION 'target_capacity_reached';
  END IF;

  UPDATE chat_conversations SET
    assigned_admin_id    = p_target_admin_id,
    transferred_from_id  = v_source_admin_id,
    updated_at           = now()
  WHERE id = p_conversation_id;

  UPDATE chat_agents
  SET active_conversations_count = GREATEST(0, active_conversations_count - 1)
  WHERE user_id = v_source_admin_id;

  UPDATE chat_agents
  SET active_conversations_count = active_conversations_count + 1
  WHERE user_id = p_target_admin_id;

  INSERT INTO chat_messages (conversation_id, sender_type, sender_id, message)
  VALUES (
    p_conversation_id, 'system', NULL,
    CASE WHEN p_transfer_note IS NOT NULL AND length(p_transfer_note) > 0
      THEN 'conversation_transferred:' || p_transfer_note
      ELSE 'conversation_transferred'
    END
  );
END;
$$;

-- assign_to_available_admin avec capacité
CREATE OR REPLACE FUNCTION public.assign_to_available_admin(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  SELECT user_id INTO v_admin_id
  FROM   chat_agents
  WHERE  status = 'available'
    AND  last_seen_at >= now() - INTERVAL '2 minutes'
    AND  active_conversations_count < capacity
  ORDER BY active_conversations_count ASC, last_seen_at DESC
  LIMIT 1
  FOR   UPDATE SKIP LOCKED;

  IF v_admin_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE chat_conversations SET
    status            = 'active',
    assigned_admin_id = v_admin_id,
    assigned_at       = now(),
    queue_position    = NULL,
    updated_at        = now()
  WHERE id = p_conversation_id;

  UPDATE chat_agents
  SET active_conversations_count = active_conversations_count + 1
  WHERE user_id = v_admin_id;

  INSERT INTO chat_messages (conversation_id, sender_type, sender_id, message)
  VALUES (p_conversation_id, 'system', NULL, 'conversation_started');

  RETURN TRUE;
END;
$$;

-- check_agents_online étendu avec has_capacity
CREATE OR REPLACE FUNCTION public.check_agents_online()
RETURNS TABLE(available_count INT, busy_count INT, has_capacity BOOLEAN)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*) FILTER (
      WHERE status = 'available' AND last_seen_at >= now() - INTERVAL '2 minutes'
    )::INT AS available_count,
    COUNT(*) FILTER (
      WHERE status IN ('busy', 'pause') AND last_seen_at >= now() - INTERVAL '2 minutes'
    )::INT AS busy_count,
    EXISTS (
      SELECT 1 FROM chat_agents
      WHERE  status = 'available'
        AND  last_seen_at >= now() - INTERVAL '2 minutes'
        AND  active_conversations_count < capacity
    ) AS has_capacity
  FROM chat_agents
  WHERE last_seen_at >= now() - INTERVAL '2 minutes';
$$;

-- Fiche client 360° (conversations + commandes par téléphone)
CREATE OR REPLACE FUNCTION public.get_client_360(p_phone TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT json_build_object(
    'conversations', (
      SELECT COALESCE(json_agg(c ORDER BY c.created_at DESC), '[]'::json)
      FROM (
        SELECT id, customer_first_name, customer_last_name, status,
               assigned_admin_id, created_at, assigned_at, closed_at,
               disposition_code_id, internal_notes
        FROM chat_conversations
        WHERE customer_phone = p_phone
        ORDER BY created_at DESC
        LIMIT 20
      ) c
    ),
    'orders', (
      SELECT COALESCE(json_agg(o ORDER BY o.created_at DESC), '[]'::json)
      FROM (
        SELECT id, product_name, product_price, status, created_at, updated_at
        FROM orders
        WHERE customer_phone = p_phone
        ORDER BY created_at DESC
        LIMIT 20
      ) o
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ── 8. RLS nouvelles tables ───────────────────────────────────────────────────

ALTER TABLE public.crc_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crc_settings_read  ON public.crc_settings;
DROP POLICY IF EXISTS crc_settings_write ON public.crc_settings;
CREATE POLICY crc_settings_read  ON public.crc_settings FOR SELECT USING (is_staff());
CREATE POLICY crc_settings_write ON public.crc_settings FOR ALL    USING (is_admin()) WITH CHECK (is_admin());

ALTER TABLE public.crc_pause_reasons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crc_pause_read  ON public.crc_pause_reasons;
DROP POLICY IF EXISTS crc_pause_write ON public.crc_pause_reasons;
CREATE POLICY crc_pause_read  ON public.crc_pause_reasons FOR SELECT USING (is_staff());
CREATE POLICY crc_pause_write ON public.crc_pause_reasons FOR ALL    USING (is_admin()) WITH CHECK (is_admin());

ALTER TABLE public.crc_disposition_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crc_disp_read  ON public.crc_disposition_codes;
DROP POLICY IF EXISTS crc_disp_write ON public.crc_disposition_codes;
CREATE POLICY crc_disp_read  ON public.crc_disposition_codes FOR SELECT USING (is_staff());
CREATE POLICY crc_disp_write ON public.crc_disposition_codes FOR ALL    USING (is_admin()) WITH CHECK (is_admin());

ALTER TABLE public.crc_quick_replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crc_qr_read  ON public.crc_quick_replies;
DROP POLICY IF EXISTS crc_qr_write ON public.crc_quick_replies;
CREATE POLICY crc_qr_read  ON public.crc_quick_replies FOR SELECT USING (is_staff());
CREATE POLICY crc_qr_write ON public.crc_quick_replies FOR ALL    USING (is_admin()) WITH CHECK (is_admin());

-- ── 9. Publier dans Supabase Realtime ────────────────────────────────────────

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crc_quick_replies;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crc_pause_reasons;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END;
$$;
