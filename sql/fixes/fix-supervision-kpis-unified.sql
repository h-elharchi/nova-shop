-- fix-supervision-kpis-unified.sql
-- get_supervision_kpis() interrogeait encore exclusivement chat_conversations
-- (table historique Lot 3), donc tous les KPI de la page Supervision (Reçues,
-- Prises en charge, Clôturées, Timeout, En attente, DMA, DMT, Niveau de service,
-- Dispositions) ne mesuraient que le canal chat — les emails et rappels
-- distribués via route_interactions() (table `interactions`, Lot 7-11) étaient
-- invisibles. C'est ce qui causait l'incohérence "En attente : 0" en haut de
-- page alors que les cartes par canal montraient des emails/rappels en attente.
--
-- Signature et type de retour inchangés → CREATE OR REPLACE suffit, pas de DROP.
--
-- Exécuter dans Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.get_supervision_kpis(
  p_period    TEXT        DEFAULT 'today',
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to   TIMESTAMPTZ DEFAULT NULL,
  p_agent_id  UUID        DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from      TIMESTAMPTZ;
  v_to        TIMESTAMPTZ;
  v_threshold INT;
  v_result    JSON;
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Seuil niveau de service depuis la configuration
  SELECT (value #>> '{}')::INT INTO v_threshold
  FROM   crc_settings
  WHERE  key = 'service_level_threshold_seconds';
  v_threshold := COALESCE(v_threshold, 30);

  -- Fenêtre temporelle
  v_to := COALESCE(p_date_to, now());
  CASE p_period
    WHEN 'today'  THEN v_from := date_trunc('day', now());
    WHEN '7days'  THEN v_from := now() - INTERVAL '7 days';
    WHEN '30days' THEN v_from := now() - INTERVAL '30 days';
    WHEN 'custom' THEN v_from := COALESCE(p_date_from, date_trunc('day', now()));
    ELSE               v_from := date_trunc('day', now());
  END CASE;

  -- Agrégé sur `interactions` (chat + email + rappel), pas seulement chat_conversations,
  -- pour que la supervision reflète tous les canaux distribués via route_interactions().
  SELECT json_build_object(
    'total_received',      COUNT(*),
    'total_taken',         COUNT(*) FILTER (WHERE assigned_at IS NOT NULL),
    'total_closed',        COUNT(*) FILTER (WHERE status = 'closed'),
    'total_timeout',       COUNT(*) FILTER (WHERE status = 'timeout'),
    'total_waiting',       COUNT(*) FILTER (WHERE status IN ('queued','offered')),
    'take_rate_pct',       CASE WHEN COUNT(*) > 0
                                THEN ROUND(100.0
                                  * COUNT(*) FILTER (WHERE assigned_at IS NOT NULL)
                                  / COUNT(*))::INT
                                ELSE NULL END,
    -- DMA / ASA (secondes)
    'avg_wait_seconds',    ROUND(
                             AVG(EXTRACT(EPOCH FROM (assigned_at - created_at)))
                             FILTER (WHERE assigned_at IS NOT NULL)
                           )::INT,
    -- DMT / AHT (secondes)
    'avg_handle_seconds',  ROUND(
                             AVG(EXTRACT(EPOCH FROM (closed_at - assigned_at)))
                             FILTER (WHERE closed_at IS NOT NULL AND assigned_at IS NOT NULL)
                           )::INT,
    -- Niveau de service
    'service_level_pct',   CASE
                             WHEN COUNT(*) FILTER (WHERE assigned_at IS NOT NULL) > 0
                             THEN ROUND(
                               100.0
                               * COUNT(*) FILTER (
                                   WHERE assigned_at IS NOT NULL
                                     AND EXTRACT(EPOCH FROM (assigned_at - created_at)) <= v_threshold
                                 )
                               / COUNT(*) FILTER (WHERE assigned_at IS NOT NULL)
                             )::INT
                             ELSE NULL
                           END,
    'service_level_threshold', v_threshold,
    -- Répartition par code de qualification
    'dispositions', (
      SELECT COALESCE(json_agg(d ORDER BY d.cnt DESC), '[]'::json)
      FROM (
        SELECT
          dc.code,
          dc.name_fr,
          dc.name_ar,
          COUNT(*) AS cnt
        FROM  interactions          i
        JOIN  crc_disposition_codes dc ON dc.id = i.disposition_code_id
        WHERE i.created_at >= v_from
          AND i.created_at <  v_to
          AND (p_agent_id IS NULL OR i.assigned_agent_id = p_agent_id)
        GROUP BY dc.id, dc.code, dc.name_fr, dc.name_ar
      ) d
    )
  ) INTO v_result
  FROM interactions
  WHERE created_at >= v_from
    AND created_at <  v_to
    AND (p_agent_id IS NULL OR assigned_agent_id = p_agent_id);

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_supervision_kpis(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated;
