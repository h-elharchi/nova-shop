-- ============================================================
-- NOVA SHOP — Migration : Interactions unifiées
-- Ordre d'exécution : 13 (après supabase-distribution.sql)
-- À exécuter UNE SEULE FOIS.
-- Idempotent : ON CONFLICT DO NOTHING sur les interactions déjà migrées.
-- ============================================================

BEGIN;

-- ─── 1. Migration : chat_conversations → interactions ─────────
-- Crée une interaction par conversation chat (tous statuts)
-- Porte le statut, l'agent, les dates de la conversation.

WITH inserted AS (
  INSERT INTO interactions (
    channel,
    origin_channel,
    customer_id,
    subject,
    status,
    queued_at,
    due_at,
    assigned_agent_id,
    assigned_at,
    first_response_at,
    closed_at,
    closed_by,
    outcome,
    disposition_code_id,
    wrap_up_notes,
    wrap_up_seconds,
    created_at,
    updated_at
  )
  SELECT
    'chat'                     AS channel,
    'website_chat'             AS origin_channel,
    -- Retrouver le customer via le téléphone de la conversation
    (SELECT c.id FROM customers c WHERE c.phone = cc.customer_phone LIMIT 1) AS customer_id,
    'Chat ' || cc.customer_first_name || ' ' || cc.customer_last_name        AS subject,
    -- Mapper les statuts chat_conversations → interactions
    CASE cc.status
      WHEN 'waiting'  THEN 'queued'
      WHEN 'active'   THEN 'active'
      WHEN 'closed'   THEN 'closed'
      WHEN 'timeout'  THEN 'timeout'
      ELSE                 'closed'
    END                        AS status,
    cc.created_at              AS queued_at,
    cc.created_at              AS due_at,
    cc.assigned_admin_id       AS assigned_agent_id,
    cc.assigned_at             AS assigned_at,
    -- Première réponse = date du premier message agent sur cette conv
    (SELECT MIN(cm.created_at) FROM chat_messages cm
     WHERE cm.conversation_id = cc.id AND cm.sender_type = 'agent') AS first_response_at,
    cc.closed_at               AS closed_at,
    cc.closed_by               AS closed_by,
    CASE WHEN cc.status IN ('closed') THEN 'treated' ELSE NULL END  AS outcome,
    cc.disposition_code_id     AS disposition_code_id,
    cc.internal_notes          AS wrap_up_notes,
    cc.wrap_up_seconds         AS wrap_up_seconds,
    cc.created_at              AS created_at,
    COALESCE(cc.updated_at, cc.created_at) AS updated_at
  FROM chat_conversations cc
  -- Ne pas re-migrer les conversations déjà liées à une interaction
  WHERE cc.interaction_id IS NULL
  RETURNING id, created_at
)
-- Retour silencieux ; les UPDATE ci-dessous font le lien
SELECT COUNT(*) AS chat_interactions_created FROM inserted;

-- Lier les conversations à leurs nouvelles interactions
UPDATE chat_conversations cc
SET interaction_id = i.id
FROM interactions i
WHERE cc.interaction_id IS NULL
  AND i.channel = 'chat'
  AND i.subject = 'Chat ' || cc.customer_first_name || ' ' || cc.customer_last_name
  AND i.queued_at = cc.created_at
  AND (
    i.assigned_agent_id = cc.assigned_admin_id
    OR (i.assigned_agent_id IS NULL AND cc.assigned_admin_id IS NULL)
  );

-- ─── 2. Migration : email_messages → email_threads + interactions ──
-- Regrouper par gmail_thread_id pour créer 1 thread + 1 interaction par fil.

-- 2a. Créer les email_threads manquants
INSERT INTO email_threads (gmail_thread_id, email_account_id, subject, from_address, last_message_at, created_at)
SELECT DISTINCT ON (em.gmail_thread_id)
  em.gmail_thread_id,
  em.email_account_id,
  em.subject,
  em.from_address,
  MAX(em.received_at) OVER (PARTITION BY em.gmail_thread_id) AS last_message_at,
  MIN(em.received_at) OVER (PARTITION BY em.gmail_thread_id) AS created_at
FROM email_messages em
WHERE em.thread_id IS NULL
  AND em.gmail_thread_id IS NOT NULL
ORDER BY em.gmail_thread_id, em.received_at
ON CONFLICT (gmail_thread_id) DO NOTHING;

-- 2b. Lier les messages à leurs threads
UPDATE email_messages em
SET thread_id = et.id
FROM email_threads et
WHERE em.thread_id IS NULL
  AND em.gmail_thread_id = et.gmail_thread_id;

-- 2c. Créer une interaction par email_thread (sans interaction existante)
WITH email_ints AS (
  INSERT INTO interactions (
    channel,
    origin_channel,
    customer_id,
    subject,
    status,
    queued_at,
    due_at,
    assigned_agent_id,
    assigned_at,
    first_response_at,
    closed_at,
    outcome,
    created_at,
    updated_at
  )
  SELECT
    'email'                                                   AS channel,
    'email'                                                   AS origin_channel,
    -- Chercher customer par email d'expéditeur
    (SELECT c.id FROM customers c
     WHERE LOWER(c.email) = LOWER(first_msg.from_address)
        OR LOWER(c.email2) = LOWER(first_msg.from_address)
     LIMIT 1)                                                 AS customer_id,
    et.subject                                                AS subject,
    -- Si le thread contient une réponse sortante → closed, sinon → queued
    CASE WHEN outbound.gmail_thread_id IS NOT NULL THEN 'closed' ELSE 'queued' END AS status,
    et.created_at                                             AS queued_at,
    et.created_at                                             AS due_at,
    outbound.agent_like                                       AS assigned_agent_id,
    outbound.first_out_at                                     AS assigned_at,
    outbound.first_out_at                                     AS first_response_at,
    CASE WHEN outbound.gmail_thread_id IS NOT NULL THEN et.last_message_at ELSE NULL END AS closed_at,
    CASE WHEN outbound.gmail_thread_id IS NOT NULL THEN 'treated' ELSE NULL END          AS outcome,
    et.created_at                                             AS created_at,
    et.last_message_at                                        AS updated_at
  FROM email_threads et
  -- Premier message entrant pour les infos sujet/from
  JOIN LATERAL (
    SELECT em.from_address
    FROM email_messages em
    WHERE em.gmail_thread_id = et.gmail_thread_id
      AND em.direction = 'in'
    ORDER BY em.received_at
    LIMIT 1
  ) first_msg ON true
  -- Vérifier réponse sortante
  LEFT JOIN LATERAL (
    SELECT em.gmail_thread_id, MIN(em.received_at) AS first_out_at,
           NULL::UUID AS agent_like
    FROM email_messages em
    WHERE em.gmail_thread_id = et.gmail_thread_id
      AND em.direction = 'out'
    GROUP BY em.gmail_thread_id
  ) outbound ON true
  -- Pas encore d'interaction liée à ce thread
  WHERE NOT EXISTS (
    SELECT 1 FROM interactions i
    WHERE i.channel = 'email'
      AND i.created_at = et.created_at
      AND i.subject = et.subject
  )
  RETURNING id, created_at, subject
)
SELECT COUNT(*) AS email_interactions_created FROM email_ints;

-- ─── 3. Rapport de migration ──────────────────────────────────
DO $$
DECLARE
  v_chat_total        INT;
  v_chat_migrated     INT;
  v_chat_unlinked     INT;
  v_email_threads     INT;
  v_email_interactions INT;
  v_email_unlinked    INT;
  v_customers_v2      INT;
BEGIN
  SELECT COUNT(*) INTO v_chat_total       FROM chat_conversations;
  SELECT COUNT(*) INTO v_chat_migrated    FROM chat_conversations WHERE interaction_id IS NOT NULL;
  SELECT COUNT(*) INTO v_chat_unlinked    FROM chat_conversations WHERE interaction_id IS NULL;

  SELECT COUNT(*) INTO v_email_threads    FROM email_threads;
  SELECT COUNT(*) INTO v_email_interactions FROM interactions WHERE channel = 'email';
  SELECT COUNT(*) INTO v_email_unlinked   FROM email_messages WHERE thread_id IS NULL;

  SELECT COUNT(*) INTO v_customers_v2     FROM customers WHERE customer_number IS NOT NULL;

  RAISE NOTICE '=== RAPPORT DE MIGRATION INTERACTIONS ===';
  RAISE NOTICE '';
  RAISE NOTICE '  Chat :';
  RAISE NOTICE '    Total conversations     : %', v_chat_total;
  RAISE NOTICE '    Interactions créées     : %', v_chat_migrated;
  RAISE NOTICE '    Non liées (skipped)     : %', v_chat_unlinked;
  RAISE NOTICE '';
  RAISE NOTICE '  Email :';
  RAISE NOTICE '    Threads Gmail créés     : %', v_email_threads;
  RAISE NOTICE '    Interactions créées     : %', v_email_interactions;
  RAISE NOTICE '    Messages sans thread    : %', v_email_unlinked;
  RAISE NOTICE '';
  RAISE NOTICE '  Clients :';
  RAISE NOTICE '    Clients avec numéro CL  : %', v_customers_v2;
  RAISE NOTICE '';
  RAISE NOTICE '  TOTAL interactions        : %',
    (SELECT COUNT(*) FROM interactions);
  RAISE NOTICE '=========================================';
END $$;

COMMIT;
