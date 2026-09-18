-- ============================================================
-- supabase-supervision.sql — NOVA SHOP Lot 3 : Supervision & KPI
-- Idempotent : CREATE OR REPLACE uniquement
-- Exécuter APRÈS supabase-crc.sql
-- ============================================================

-- ── 1. Tableau de bord agents (temps réel) ────────────────────────────────────
-- Retourne tous les agents avec leur statut, durée dans le statut,
-- raison de pause, et charge actuelle.

CREATE OR REPLACE FUNCTION public.get_agents_dashboard()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN (
    SELECT COALESCE(json_agg(a ORDER BY
      CASE a.status
        WHEN 'available' THEN 1
        WHEN 'busy'      THEN 2
        WHEN 'pause'     THEN 3
        ELSE 4
      END,
      a.status_changed_at
    ), '[]'::json)
    FROM (
      SELECT
        ca.id,
        ca.user_id,
        p.first_name,
        p.last_name,
        p.email,
        p.avatar_url,
        ca.status,
        ca.active_conversations_count,
        ca.capacity,
        ca.last_seen_at,
        ca.status_changed_at,
        pr.name_fr                                                       AS pause_reason_fr,
        pr.name_ar                                                       AS pause_reason_ar,
        EXTRACT(EPOCH FROM (now() - ca.status_changed_at))::INT          AS seconds_in_status
      FROM  chat_agents           ca
      LEFT JOIN profiles          p  ON p.id  = ca.user_id
      LEFT JOIN crc_pause_reasons pr ON pr.id = ca.pause_reason_id
    ) a
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_agents_dashboard() TO authenticated;

-- ── 2. KPI supervision ────────────────────────────────────────────────────────
-- Agrège les métriques clés pour une période et un agent optionnel.
-- Calculs : volume, taux de prise, DMA (ASA), DMT (AHT), niveau de service,
--           répartition par code de qualification.

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

  SELECT json_build_object(
    'total_received',      COUNT(*),
    'total_taken',         COUNT(*) FILTER (WHERE assigned_admin_id IS NOT NULL),
    'total_closed',        COUNT(*) FILTER (WHERE status = 'closed'),
    'total_timeout',       COUNT(*) FILTER (WHERE status = 'timeout'),
    'total_waiting',       COUNT(*) FILTER (WHERE status = 'waiting'),
    'take_rate_pct',       CASE WHEN COUNT(*) > 0
                                THEN ROUND(100.0
                                  * COUNT(*) FILTER (WHERE assigned_admin_id IS NOT NULL)
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
        FROM  chat_conversations   cc
        JOIN  crc_disposition_codes dc ON dc.id = cc.disposition_code_id
        WHERE cc.created_at >= v_from
          AND cc.created_at <  v_to
          AND (p_agent_id IS NULL OR cc.assigned_admin_id = p_agent_id)
        GROUP BY dc.id, dc.code, dc.name_fr, dc.name_ar
      ) d
    )
  ) INTO v_result
  FROM chat_conversations
  WHERE created_at >= v_from
    AND created_at <  v_to
    AND (p_agent_id IS NULL OR assigned_admin_id = p_agent_id);

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_supervision_kpis(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated;

-- ── 3. Historique paginé des conversations ───────────────────────────────────
-- Retourne les conversations filtrées avec jointure profiles + disposition.
-- Pagination côté base pour ne jamais charger tout l'historique en mémoire.

CREATE OR REPLACE FUNCTION public.get_conversation_history(
  p_status         TEXT        DEFAULT NULL,
  p_agent_id       UUID        DEFAULT NULL,
  p_disposition_id UUID        DEFAULT NULL,
  p_date_from      TIMESTAMPTZ DEFAULT NULL,
  p_date_to        TIMESTAMPTZ DEFAULT NULL,
  p_phone          TEXT        DEFAULT NULL,
  p_page           INT         DEFAULT 1,
  p_page_size      INT         DEFAULT 20
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset INT;
  v_total  BIGINT;
  v_rows   JSON;
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_offset := (COALESCE(p_page, 1) - 1) * COALESCE(p_page_size, 20);

  -- Compte total pour pagination
  SELECT COUNT(*) INTO v_total
  FROM   chat_conversations
  WHERE  (p_status         IS NULL OR status              = p_status)
    AND  (p_agent_id       IS NULL OR assigned_admin_id   = p_agent_id)
    AND  (p_disposition_id IS NULL OR disposition_code_id = p_disposition_id)
    AND  (p_date_from      IS NULL OR created_at         >= p_date_from)
    AND  (p_date_to        IS NULL OR created_at         <  p_date_to)
    AND  (p_phone          IS NULL OR customer_phone ILIKE '%' || p_phone || '%');

  -- Lignes de la page
  SELECT COALESCE(json_agg(c ORDER BY c.created_at DESC), '[]'::json) INTO v_rows
  FROM (
    SELECT
      cc.id,
      cc.customer_first_name,
      cc.customer_last_name,
      cc.customer_phone,
      cc.status,
      cc.assigned_admin_id,
      cc.created_at,
      cc.assigned_at,
      cc.closed_at,
      cc.wrap_up_seconds,
      cc.internal_notes,
      cc.disposition_code_id,
      cc.transferred_from_id,
      p.first_name        AS agent_first_name,
      p.last_name         AS agent_last_name,
      dc.code             AS disposition_code,
      dc.name_fr          AS disposition_name_fr,
      dc.name_ar          AS disposition_name_ar
    FROM  chat_conversations    cc
    LEFT JOIN profiles           p  ON p.id  = cc.assigned_admin_id
    LEFT JOIN crc_disposition_codes dc ON dc.id = cc.disposition_code_id
    WHERE (p_status         IS NULL OR cc.status              = p_status)
      AND (p_agent_id       IS NULL OR cc.assigned_admin_id   = p_agent_id)
      AND (p_disposition_id IS NULL OR cc.disposition_code_id = p_disposition_id)
      AND (p_date_from      IS NULL OR cc.created_at         >= p_date_from)
      AND (p_date_to        IS NULL OR cc.created_at         <  p_date_to)
      AND (p_phone          IS NULL OR cc.customer_phone ILIKE '%' || p_phone || '%')
    ORDER BY cc.created_at DESC
    LIMIT  COALESCE(p_page_size, 20)
    OFFSET v_offset
  ) c;

  RETURN json_build_object(
    'total',     v_total,
    'page',      COALESCE(p_page, 1),
    'page_size', COALESCE(p_page_size, 20),
    'rows',      COALESCE(v_rows, '[]'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_conversation_history(TEXT, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, INT, INT) TO authenticated;
