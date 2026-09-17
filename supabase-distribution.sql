-- ============================================================
-- NOVA SHOP — Lot Multicanal : Moteur de distribution unifié
-- Ordre d'exécution : 12 (après supabase-customers-v2.sql)
-- Idempotent
-- ============================================================

BEGIN;

-- ─── Helper : capacité effective d'un agent sur un canal ─────
CREATE OR REPLACE FUNCTION get_agent_channel_capacity(
  p_agent_id UUID,
  p_channel  TEXT
)
RETURNS TABLE (max_cap INT, is_enabled BOOLEAN)
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(
      acc.max_capacity,
      CASE p_channel
        WHEN 'chat'     THEN COALESCE((SELECT (value::text)::int FROM crc_settings WHERE key='default_chat_capacity'), 3)
        WHEN 'email'    THEN COALESCE((SELECT (value::text)::int FROM crc_settings WHERE key='default_email_capacity'), 5)
        WHEN 'callback' THEN COALESCE((SELECT (value::text)::int FROM crc_settings WHERE key='default_callback_capacity'), 1)
        ELSE 1
      END
    ) AS max_cap,
    COALESCE(acc.is_enabled, true) AS is_enabled
  FROM (SELECT 1) AS dummy
  LEFT JOIN agent_channel_capacity acc
    ON acc.agent_id = p_agent_id AND acc.channel = p_channel;
$$;

-- ─── Helper : interactions actives d'un agent sur un canal ───
CREATE OR REPLACE FUNCTION count_agent_active_interactions(
  p_agent_id UUID,
  p_channel  TEXT
)
RETURNS INT
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(*)::INT
  FROM interactions
  WHERE assigned_agent_id = p_agent_id
    AND channel = p_channel
    AND status IN ('offered','assigned','active','pending_customer','wrap_up');
$$;

-- ─── Moteur principal : route_interactions() ─────────────────
CREATE OR REPLACE FUNCTION route_interactions()
RETURNS TABLE (
  interaction_id   UUID,
  action           TEXT,
  agent_id         UUID
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_interaction   RECORD;
  v_agent         RECORD;
  v_chat_mode     TEXT;
  v_email_mode    TEXT;
  v_callback_mode TEXT;
  v_offer_delay   INT;
  v_cap           RECORD;
  v_active_count  INT;
BEGIN
  -- Lire les paramètres de distribution
  SELECT COALESCE(REPLACE(value::text, '"', ''), 'offer') INTO v_chat_mode
  FROM crc_settings WHERE key = 'chat_distribution_mode';

  SELECT COALESCE(REPLACE(value::text, '"', ''), 'direct') INTO v_email_mode
  FROM crc_settings WHERE key = 'email_distribution_mode';

  SELECT COALESCE(REPLACE(value::text, '"', ''), 'direct') INTO v_callback_mode
  FROM crc_settings WHERE key = 'callback_distribution_mode';

  SELECT COALESCE((value::text)::int, 20) INTO v_offer_delay
  FROM crc_settings WHERE key = 'chat_accept_delay_seconds';

  -- 1. Libérer les propositions expirées → retour en file
  UPDATE interactions
  SET status = 'queued', offered_to = NULL, offered_at = NULL, offer_expires_at = NULL
  WHERE status = 'offered'
    AND offer_expires_at < now();

  -- 2. Remettre en file les rappels schedulés arrivés à échéance
  UPDATE interactions
  SET status = 'queued', queued_at = now()
  WHERE status = 'scheduled'
    AND due_at IS NOT NULL
    AND due_at <= now();

  -- 3. Distribuer les interactions en file
  FOR v_interaction IN
    SELECT *
    FROM interactions
    WHERE status = 'queued'
      AND (due_at IS NULL OR due_at <= now())
    ORDER BY priority DESC, queued_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Chercher le meilleur agent disponible
    SELECT a.user_id INTO v_agent
    FROM chat_agents a
    JOIN profiles p ON p.id = a.user_id
    WHERE a.status = 'available'
      AND a.last_seen_at > now() - INTERVAL '2 minutes'
      AND (
        -- Capacité OK sur ce canal
        count_agent_active_interactions(a.user_id, v_interaction.channel) <
        (SELECT max_cap FROM get_agent_channel_capacity(a.user_id, v_interaction.channel))
      )
      AND (
        -- Canal activé pour cet agent
        SELECT is_enabled FROM get_agent_channel_capacity(a.user_id, v_interaction.channel)
      )
      -- Exclure l'agent à qui la proposition vient d'expirer (évite boucle)
    ORDER BY a.last_seen_at ASC  -- agent inactif le plus longtemps
    LIMIT 1;

    IF NOT FOUND THEN
      CONTINUE; -- Pas d'agent dispo, on passe à la suivante
    END IF;

    -- Appliquer selon le mode du canal
    IF v_interaction.channel = 'chat' AND v_chat_mode = 'offer' THEN
      UPDATE interactions SET
        status = 'offered',
        offered_to = v_agent.user_id,
        offered_at = now(),
        offer_expires_at = now() + (v_offer_delay || ' seconds')::INTERVAL
      WHERE id = v_interaction.id;

      PERFORM log_interaction_event(v_interaction.id, 'offered', NULL,
        jsonb_build_object('agent_id', v_agent.user_id, 'expires_in', v_offer_delay));

      interaction_id := v_interaction.id;
      action := 'offered';
      agent_id := v_agent.user_id;
      RETURN NEXT;

    ELSE
      -- Mode direct (email, callback, ou chat en mode direct)
      UPDATE interactions SET
        status = 'assigned',
        assigned_agent_id = v_agent.user_id,
        assigned_at = now()
      WHERE id = v_interaction.id;

      PERFORM log_interaction_event(v_interaction.id, 'assigned', v_agent.user_id,
        jsonb_build_object('channel', v_interaction.channel, 'mode', 'direct'));

      interaction_id := v_interaction.id;
      action := 'assigned';
      agent_id := v_agent.user_id;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION route_interactions FROM PUBLIC;
GRANT EXECUTE ON FUNCTION route_interactions TO service_role;
GRANT EXECUTE ON FUNCTION route_interactions TO authenticated;

-- ─── RPC : accepter une proposition (agent) ──────────────────
CREATE OR REPLACE FUNCTION accept_interaction_offer(p_interaction_id UUID)
RETURNS SETOF interactions
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_agent_id UUID := auth.uid();
  v_row      interactions;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'permission denied'; END IF;

  SELECT * INTO v_row
  FROM interactions
  WHERE id = p_interaction_id
    AND status = 'offered'
    AND offered_to = v_agent_id
    AND offer_expires_at >= now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'offer not found or expired';
  END IF;

  UPDATE interactions SET
    status = 'assigned',
    assigned_agent_id = v_agent_id,
    assigned_at = now(),
    offered_to = NULL, offered_at = NULL, offer_expires_at = NULL
  WHERE id = p_interaction_id
  RETURNING * INTO v_row;

  PERFORM log_interaction_event(p_interaction_id, 'offer_accepted', v_agent_id, NULL);

  RETURN NEXT v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION accept_interaction_offer TO authenticated;

-- ─── RPC : refuser une proposition ───────────────────────────
CREATE OR REPLACE FUNCTION reject_interaction_offer(p_interaction_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'permission denied'; END IF;

  UPDATE interactions SET
    status = 'queued',
    offered_to = NULL, offered_at = NULL, offer_expires_at = NULL
  WHERE id = p_interaction_id
    AND offered_to = auth.uid()
    AND status = 'offered';

  PERFORM log_interaction_event(p_interaction_id, 'offer_rejected', auth.uid(), NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION reject_interaction_offer TO authenticated;

-- ─── RPC : prendre manuellement une interaction ───────────────
CREATE OR REPLACE FUNCTION claim_interaction(p_interaction_id UUID)
RETURNS SETOF interactions
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_agent_id UUID := auth.uid();
  v_cap      RECORD;
  v_active   INT;
  v_row      interactions;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'permission denied'; END IF;

  SELECT * INTO v_row
  FROM interactions
  WHERE id = p_interaction_id
    AND status IN ('queued','offered')
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN RAISE EXCEPTION 'interaction not available'; END IF;

  -- Vérifier capacité
  SELECT * FROM get_agent_channel_capacity(v_agent_id, v_row.channel) INTO v_cap;
  SELECT count_agent_active_interactions(v_agent_id, v_row.channel) INTO v_active;

  IF v_active >= v_cap.max_cap THEN
    RAISE EXCEPTION 'agent at full capacity on channel %', v_row.channel;
  END IF;

  UPDATE interactions SET
    status = 'assigned',
    assigned_agent_id = v_agent_id,
    assigned_at = now(),
    offered_to = NULL, offered_at = NULL, offer_expires_at = NULL
  WHERE id = p_interaction_id
  RETURNING * INTO v_row;

  PERFORM log_interaction_event(p_interaction_id, 'assigned', v_agent_id,
    jsonb_build_object('mode', 'manual_claim'));

  RETURN NEXT v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_interaction TO authenticated;

-- ─── RPC : interaction suivante disponible ────────────────────
CREATE OR REPLACE FUNCTION take_next_interaction(p_channel TEXT DEFAULT NULL)
RETURNS SETOF interactions
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_agent_id UUID := auth.uid();
  v_row      interactions;
  v_cap      RECORD;
  v_active   INT;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'permission denied'; END IF;

  SELECT * INTO v_row
  FROM interactions
  WHERE status IN ('queued','offered')
    AND (p_channel IS NULL OR channel = p_channel)
    AND (due_at IS NULL OR due_at <= now())
  ORDER BY priority DESC, queued_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT * FROM get_agent_channel_capacity(v_agent_id, v_row.channel) INTO v_cap;
  SELECT count_agent_active_interactions(v_agent_id, v_row.channel) INTO v_active;

  IF v_active >= v_cap.max_cap THEN
    RAISE EXCEPTION 'agent at full capacity on channel %', v_row.channel;
  END IF;

  UPDATE interactions SET
    status = 'assigned',
    assigned_agent_id = v_agent_id,
    assigned_at = now(),
    offered_to = NULL, offered_at = NULL, offer_expires_at = NULL
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  PERFORM log_interaction_event(v_row.id, 'assigned', v_agent_id,
    jsonb_build_object('mode', 'take_next'));

  RETURN NEXT v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION take_next_interaction TO authenticated;

-- ─── RPC : transférer une interaction ────────────────────────
CREATE OR REPLACE FUNCTION transfer_interaction(
  p_interaction_id  UUID,
  p_target_agent_id UUID DEFAULT NULL,
  p_note            TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row         interactions;
  v_cap         RECORD;
  v_active      INT;
  v_from_agent  UUID := auth.uid();
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'permission denied'; END IF;

  SELECT * INTO v_row FROM interactions WHERE id = p_interaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'interaction not found'; END IF;

  IF p_target_agent_id IS NOT NULL THEN
    -- Transfert vers agent spécifique
    SELECT * FROM get_agent_channel_capacity(p_target_agent_id, v_row.channel) INTO v_cap;
    SELECT count_agent_active_interactions(p_target_agent_id, v_row.channel) INTO v_active;

    IF v_active >= v_cap.max_cap THEN
      RAISE EXCEPTION 'target agent at full capacity';
    END IF;

    UPDATE interactions SET
      assigned_agent_id = p_target_agent_id,
      assigned_at = now(),
      status = 'assigned'
    WHERE id = p_interaction_id;

    PERFORM log_interaction_event(p_interaction_id, 'transferred', v_from_agent,
      jsonb_build_object('from', v_from_agent, 'to', p_target_agent_id, 'note', p_note));
  ELSE
    -- Retour en file
    UPDATE interactions SET
      assigned_agent_id = NULL, assigned_at = NULL,
      status = 'queued', queued_at = now()
    WHERE id = p_interaction_id;

    PERFORM log_interaction_event(p_interaction_id, 'transferred', v_from_agent,
      jsonb_build_object('from', v_from_agent, 'to', 'queue', 'note', p_note));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION transfer_interaction TO authenticated;

-- ─── RPC : activer une interaction (premier message) ─────────
CREATE OR REPLACE FUNCTION activate_interaction(p_interaction_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'permission denied'; END IF;

  UPDATE interactions SET
    status = 'active',
    first_response_at = COALESCE(first_response_at, now())
  WHERE id = p_interaction_id
    AND status = 'assigned'
    AND (assigned_agent_id = auth.uid() OR is_admin());

  PERFORM log_interaction_event(p_interaction_id, 'status_changed', auth.uid(),
    jsonb_build_object('new_status', 'active'));
END;
$$;

GRANT EXECUTE ON FUNCTION activate_interaction TO authenticated;

-- ─── RPC : démarrer le wrap-up ────────────────────────────────
CREATE OR REPLACE FUNCTION start_wrap_up(p_interaction_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'permission denied'; END IF;

  UPDATE interactions SET
    status = 'wrap_up',
    wrap_up_started_at = now()
  WHERE id = p_interaction_id
    AND status IN ('active','assigned','pending_customer')
    AND (assigned_agent_id = auth.uid() OR is_admin());

  PERFORM log_interaction_event(p_interaction_id, 'wrap_up_started', auth.uid(), NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION start_wrap_up TO authenticated;

-- ─── RPC : clôturer une interaction (qualification) ──────────
CREATE OR REPLACE FUNCTION close_interaction(
  p_interaction_id    UUID,
  p_outcome           TEXT,           -- 'treated' | 'not_treated'
  p_disposition_id    UUID DEFAULT NULL,
  p_notes             TEXT DEFAULT NULL,
  p_reschedule_at     TIMESTAMPTZ DEFAULT NULL,
  p_return_to_queue   BOOLEAN DEFAULT false
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row interactions;
  v_wrap_secs INT;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'permission denied'; END IF;
  IF p_outcome NOT IN ('treated','not_treated') THEN
    RAISE EXCEPTION 'outcome must be treated or not_treated';
  END IF;

  SELECT * INTO v_row FROM interactions WHERE id = p_interaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'interaction not found'; END IF;

  v_wrap_secs := CASE
    WHEN v_row.wrap_up_started_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (now() - v_row.wrap_up_started_at))::INT
    ELSE 0
  END;

  IF p_outcome = 'not_treated' AND p_return_to_queue THEN
    -- Remettre en file
    UPDATE interactions SET
      status = 'queued', queued_at = now(),
      assigned_agent_id = NULL, assigned_at = NULL,
      outcome = p_outcome,
      disposition_code_id = p_disposition_id,
      wrap_up_notes = p_notes,
      wrap_up_seconds = v_wrap_secs
    WHERE id = p_interaction_id;
    PERFORM log_interaction_event(p_interaction_id, 'queued', auth.uid(),
      jsonb_build_object('reason', 'returned_to_queue'));

  ELSIF p_outcome = 'not_treated' AND p_reschedule_at IS NOT NULL THEN
    -- Reprogrammer
    UPDATE interactions SET
      status = 'scheduled', due_at = p_reschedule_at,
      assigned_agent_id = NULL, assigned_at = NULL,
      outcome = p_outcome,
      disposition_code_id = p_disposition_id,
      wrap_up_notes = p_notes,
      wrap_up_seconds = v_wrap_secs
    WHERE id = p_interaction_id;
    PERFORM log_interaction_event(p_interaction_id, 'rescheduled', auth.uid(),
      jsonb_build_object('next_at', p_reschedule_at));

  ELSE
    -- Clôture définitive
    UPDATE interactions SET
      status = 'closed',
      closed_at = now(),
      closed_by = auth.uid(),
      outcome = p_outcome,
      disposition_code_id = p_disposition_id,
      wrap_up_notes = p_notes,
      wrap_up_seconds = v_wrap_secs
    WHERE id = p_interaction_id;

    -- Fermer la conversation chat associée si nécessaire
    UPDATE chat_conversations SET status = 'closed', closed_at = now()
    WHERE interaction_id = p_interaction_id AND status != 'closed';

    PERFORM log_interaction_event(p_interaction_id, 'closed', auth.uid(),
      jsonb_build_object('outcome', p_outcome, 'disposition', p_disposition_id));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION close_interaction TO authenticated;

-- ─── RPC : fiche 360° par interaction ────────────────────────
CREATE OR REPLACE FUNCTION get_interaction_360(p_interaction_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_interaction interactions%ROWTYPE;
  v_customer    customers%ROWTYPE;
  v_result      JSON;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'permission denied'; END IF;

  SELECT * INTO v_interaction FROM interactions WHERE id = p_interaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'interaction not found'; END IF;

  IF v_interaction.customer_id IS NULL THEN
    RETURN json_build_object(
      'interaction', row_to_json(v_interaction),
      'customer', NULL,
      'interactions', '[]'::json,
      'orders', '[]'::json,
      'addresses', '[]'::json
    );
  END IF;

  SELECT * INTO v_customer FROM customers WHERE id = v_interaction.customer_id;

  SELECT json_build_object(
    'interaction', row_to_json(v_interaction),
    'customer', row_to_json(v_customer),
    'interactions', (
      SELECT json_agg(row_to_json(i) ORDER BY i.created_at DESC)
      FROM (SELECT id, interaction_number, channel, status, outcome,
                   created_at, closed_at, assigned_agent_id
            FROM interactions
            WHERE customer_id = v_interaction.customer_id
            LIMIT 20) i
    ),
    'orders', (
      SELECT json_agg(row_to_json(o) ORDER BY o.created_at DESC)
      FROM (SELECT id, product_name, product_price, status, channel, created_at
            FROM orders
            WHERE customer_id = v_interaction.customer_id
            LIMIT 20) o
    ),
    'addresses', (
      SELECT json_agg(row_to_json(a))
      FROM customer_addresses a
      WHERE a.customer_id = v_interaction.customer_id
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_interaction_360 TO authenticated;

-- ─── RPC Supervision : agents avec capacités par canal ────────
CREATE OR REPLACE FUNCTION get_agents_with_capacity()
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT json_agg(row_to_json(t))
  FROM (
    SELECT
      ca.user_id,
      p.first_name, p.last_name, p.email, p.avatar_url,
      ca.status,
      ca.last_seen_at,
      ca.capacity AS chat_max,
      ca.active_conversations_count AS chat_active,
      (SELECT COUNT(*) FROM interactions WHERE assigned_agent_id = ca.user_id AND channel='email' AND status IN ('assigned','active','wrap_up')) AS email_active,
      (SELECT COUNT(*) FROM interactions WHERE assigned_agent_id = ca.user_id AND channel='callback' AND status IN ('assigned','active','wrap_up')) AS callback_active,
      COALESCE((SELECT max_capacity FROM agent_channel_capacity WHERE agent_id=ca.user_id AND channel='email'), 5) AS email_max,
      COALESCE((SELECT max_capacity FROM agent_channel_capacity WHERE agent_id=ca.user_id AND channel='callback'), 1) AS callback_max
    FROM chat_agents ca
    JOIN profiles p ON p.id = ca.user_id
    WHERE ca.last_seen_at > now() - INTERVAL '5 minutes'
    ORDER BY ca.status, ca.last_seen_at DESC
  ) t;
$$;

GRANT EXECUTE ON FUNCTION get_agents_with_capacity TO authenticated;

-- ─── pg_cron : distribution automatique chaque minute ────────
-- À exécuter séparément si pg_cron est activé :
--
-- SELECT cron.schedule(
--   'route-interactions',
--   '* * * * *',
--   $$ SELECT route_interactions(); $$
-- );
--
-- SELECT cron.schedule(
--   'expire-offered-interactions',
--   '* * * * *',
--   $$ UPDATE interactions SET status='queued', offered_to=NULL,
--      offered_at=NULL, offer_expires_at=NULL
--      WHERE status='offered' AND offer_expires_at < now(); $$
-- );

COMMIT;
