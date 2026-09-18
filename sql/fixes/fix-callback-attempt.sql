-- fix-callback-attempt.sql
-- Correctif : record_callback_attempt ne traitait pas les résultats
-- 'reached' et 'wrong_number', laissant l'interaction en statut 'queued'.
--
-- Comportement ajouté :
--   reached      → passe l'interaction en 'active' (l'agent est en communication,
--                   il peut ensuite qualifier via wrap_up)
--   wrong_number → clôture immédiate avec outcome 'not_treated'
--
-- Idempotent : CREATE OR REPLACE, signature inchangée.
-- Exécuter dans Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.record_callback_attempt(
  p_callback_request_id UUID,
  p_result              TEXT,
  p_comment             TEXT        DEFAULT NULL,
  p_next_attempt_at     TIMESTAMPTZ DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cb               RECORD;
  v_max_attempts     INT;
  v_reschedule_delay INT;
  v_next_at          TIMESTAMPTZ;
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

  -- Lire paramètres CRC
  SELECT COALESCE((value::text)::int, 3)  INTO v_max_attempts
  FROM crc_settings WHERE key = 'callback_max_attempts';

  SELECT COALESCE((value::text)::int, 30) INTO v_reschedule_delay
  FROM crc_settings WHERE key = 'callback_reschedule_delay_minutes';

  -- Calculer next_attempt_at
  v_next_at := COALESCE(
    p_next_attempt_at,
    CASE WHEN p_result IN ('no_answer','busy','voicemail')
      THEN now() + (v_reschedule_delay || ' minutes')::INTERVAL
      ELSE NULL
    END
  );

  -- Insérer la tentative
  INSERT INTO callback_attempts (callback_request_id, agent_id, result, next_attempt_at, comment)
  VALUES (p_callback_request_id, auth.uid(), p_result, v_next_at, p_comment);

  -- Mettre à jour le compteur
  UPDATE callback_requests
  SET attempts_count = attempts_count + 1
  WHERE id = p_callback_request_id;

  -- Logger l'événement
  PERFORM log_interaction_event(
    v_cb.i_id, 'call_attempt', auth.uid(),
    jsonb_build_object('result', p_result, 'attempt_number', v_cb.attempts_count + 1)
  );

  -- ─── Transitions de statut selon le résultat ─────────────────

  IF p_result = 'reached' THEN
    -- L'agent est en communication : activer l'interaction pour permettre le wrap_up
    UPDATE interactions
    SET status            = 'active',
        assigned_agent_id = COALESCE(assigned_agent_id, auth.uid()),
        assigned_at       = COALESCE(assigned_at, now())
    WHERE id = v_cb.i_id
      AND status NOT IN ('active', 'wrap_up', 'closed');
    PERFORM log_interaction_event(v_cb.i_id, 'status_changed', auth.uid(),
      jsonb_build_object('from', v_cb.i_status, 'to', 'active', 'reason', 'reached'));

  ELSIF p_result = 'wrong_number' THEN
    -- Mauvais numéro : clôture immédiate
    UPDATE interactions
    SET status      = 'closed',
        outcome     = 'not_treated',
        closed_at   = now(),
        closed_by   = auth.uid()
    WHERE id = v_cb.i_id
      AND status NOT IN ('closed');
    PERFORM log_interaction_event(v_cb.i_id, 'closed', auth.uid(),
      jsonb_build_object('reason', 'wrong_number'));

  ELSIF p_result = 'callback_later' AND v_next_at IS NOT NULL THEN
    UPDATE interactions
    SET status = 'scheduled', due_at = v_next_at
    WHERE id = v_cb.i_id;
    PERFORM log_interaction_event(v_cb.i_id, 'rescheduled', auth.uid(),
      jsonb_build_object('next_at', v_next_at));

  ELSIF p_result IN ('no_answer','busy','voicemail') THEN
    IF (v_cb.attempts_count + 1) >= v_max_attempts THEN
      -- Max tentatives atteint : clôture automatique
      UPDATE interactions
      SET status              = 'closed',
          outcome             = 'not_treated',
          closed_at           = now(),
          closed_by           = auth.uid(),
          disposition_code_id = (
            SELECT id FROM crc_disposition_codes WHERE code = 'NO_RESPONSE' LIMIT 1
          )
      WHERE id = v_cb.i_id;
      PERFORM log_interaction_event(v_cb.i_id, 'closed', auth.uid(),
        jsonb_build_object('reason', 'max_attempts_reached'));
    ELSE
      -- Reprogrammation automatique
      UPDATE interactions
      SET status = 'scheduled', due_at = v_next_at
      WHERE id = v_cb.i_id;
      PERFORM log_interaction_event(v_cb.i_id, 'rescheduled', auth.uid(),
        jsonb_build_object('next_at', v_next_at, 'reason', p_result));
    END IF;
  END IF;

END;
$$;

GRANT EXECUTE ON FUNCTION public.record_callback_attempt TO authenticated;
