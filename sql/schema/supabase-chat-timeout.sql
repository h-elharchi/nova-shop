-- supabase-chat-timeout.sql
-- Ferme automatiquement les interactions chat non prises en charge après 1 minute.
--
-- Ce script effectue deux actions liées :
--   1. Passe l'interaction (table interactions) en status = 'timeout'
--   2. Passe la conversation chat liée (table chat_conversations) en status = 'timeout'
--      → le widget client reçoit l'événement Realtime et ferme la session automatiquement
--
-- Prérequis :
--   - supabase-interactions.sql déjà exécuté (tables interactions + chat_conversations.interaction_id)
--   - Extension pg_cron activée : Supabase Dashboard → Extensions → pg_cron
--
-- Exécuter UNE SEULE FOIS dans Supabase SQL Editor (idempotent)

-- ─── Fonction de timeout ──────────────────────────────────────

CREATE OR REPLACE FUNCTION close_timed_out_chat_interactions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  rec     RECORD;
BEGIN
  FOR rec IN
    SELECT
      i.id          AS interaction_id,
      cc.id         AS conv_id
    FROM   interactions i
    LEFT   JOIN chat_conversations cc ON cc.interaction_id = i.id
    WHERE  i.channel   = 'chat'
      AND  i.status    = 'queued'
      AND  i.queued_at < now() - interval '1 minute'
  LOOP
    -- Fermer l'interaction
    UPDATE interactions
    SET    status     = 'timeout',
           closed_at  = now(),
           updated_at = now()
    WHERE  id = rec.interaction_id;

    -- Passer la conversation chat en timeout (déclenche Realtime → widget client)
    IF rec.conv_id IS NOT NULL THEN
      UPDATE chat_conversations
      SET    status     = 'timeout',
             updated_at = now()
      WHERE  id         = rec.conv_id
        AND  status     IN ('waiting', 'searching');
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION close_timed_out_chat_interactions() TO authenticated;
GRANT EXECUTE ON FUNCTION close_timed_out_chat_interactions() TO service_role;

-- ─── Planification pg_cron (toutes les minutes) ───────────────

-- Supprimer l'ancienne tâche si elle existe (idempotent)
SELECT cron.unschedule(jobid)
FROM   cron.job
WHERE  jobname = 'close-timed-out-chats';

-- Planifier l'exécution toutes les minutes
SELECT cron.schedule(
  'close-timed-out-chats',
  '* * * * *',
  $$SELECT public.close_timed_out_chat_interactions()$$
);

-- ─── Vérification ─────────────────────────────────────────────

SELECT jobid, jobname, schedule, command, active
FROM   cron.job
WHERE  jobname = 'close-timed-out-chats';
