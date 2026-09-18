-- fix-distribution-all-channels.sql
-- Généralise le principe "offre + sonnerie + accepter/rejeter" (jusque-là réservé
-- au chat) aux canaux email et rappel. route_interactions() reste inchangé pour
-- la logique de file d'attente elle-même : un email ou un rappel peut arriver
-- alors qu'aucun agent n'est connecté, il reste "queued" indéfiniment jusqu'à ce
-- qu'un agent disponible se connecte — c'est déjà le comportement existant.
--
-- Exécuter dans Supabase SQL Editor.

-- ─── 1. Nouveaux réglages : délai d'acceptation par canal ─────
INSERT INTO crc_settings (key, value, description) VALUES
  ('email_accept_delay_seconds',    '45', 'Délai d''acceptation d''une proposition email (secondes)'),
  ('callback_accept_delay_seconds', '45', 'Délai d''acceptation d''une proposition rappel (secondes)')
ON CONFLICT (key) DO NOTHING;

-- ─── 2. Basculer email/rappel en mode "offer" (au lieu de "direct") ───
UPDATE crc_settings SET value = '"offer"'::jsonb WHERE key = 'email_distribution_mode';
UPDATE crc_settings SET value = '"offer"'::jsonb WHERE key = 'callback_distribution_mode';

-- ─── 3. route_interactions() — généralise la branche "offre" aux 3 canaux ───
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
  -- Lire les paramètres de distribution (offre + sonnerie, ou assignation directe)
  SELECT COALESCE(REPLACE(value::text, '"', ''), 'offer') INTO v_chat_mode
  FROM crc_settings WHERE key = 'chat_distribution_mode';

  SELECT COALESCE(REPLACE(value::text, '"', ''), 'offer') INTO v_email_mode
  FROM crc_settings WHERE key = 'email_distribution_mode';

  SELECT COALESCE(REPLACE(value::text, '"', ''), 'offer') INTO v_callback_mode
  FROM crc_settings WHERE key = 'callback_distribution_mode';

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

  -- 3. Distribuer les interactions en file (tous canaux, quelle que soit leur ancienneté :
  --    un email/rappel déposé alors qu'aucun agent n'était connecté reste éligible)
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
    ORDER BY a.last_seen_at ASC  -- agent inactif le plus longtemps
    LIMIT 1;

    IF NOT FOUND THEN
      CONTINUE; -- Pas d'agent dispo, on passe à la suivante
    END IF;

    -- Appliquer selon le mode du canal (offre + sonnerie, généralisé aux 3 canaux)
    IF (v_interaction.channel = 'chat'     AND v_chat_mode     = 'offer')
    OR (v_interaction.channel = 'email'    AND v_email_mode    = 'offer')
    OR (v_interaction.channel = 'callback' AND v_callback_mode = 'offer')
    THEN
      SELECT COALESCE((value::text)::int, 20) INTO v_offer_delay
      FROM crc_settings WHERE key = (
        CASE v_interaction.channel
          WHEN 'chat'     THEN 'chat_accept_delay_seconds'
          WHEN 'email'    THEN 'email_accept_delay_seconds'
          WHEN 'callback' THEN 'callback_accept_delay_seconds'
        END
      );
      v_offer_delay := COALESCE(v_offer_delay, 20);

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
      -- Mode direct (canal configuré en "direct")
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
