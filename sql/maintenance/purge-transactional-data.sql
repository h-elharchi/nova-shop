-- ============================================================
-- NOVA SHOP — Purge des données transactionnelles
-- ============================================================
-- Supprime : interactions, clients, commandes, messages chat,
--            emails, rappels, historique, audit
-- Conserve  : utilisateurs (auth.users + profiles), produits,
--             catégories, paramètres CRC, comptes email (config)
-- ============================================================
-- ⚠ IRRÉVERSIBLE — Faire un backup Supabase avant d'exécuter
-- ⚠ Exécuter dans Supabase SQL Editor (pas en production live)
-- ============================================================

BEGIN;

-- ----------------------------------------------------------
-- 1. Tables enfants avec ON DELETE CASCADE
--    (on les vide explicitement pour plus de clarté)
-- ----------------------------------------------------------

-- Tentatives de rappel (→ callback_requests CASCADE)
DELETE FROM public.callback_attempts;

-- Événements d'interaction (→ interactions CASCADE)
DELETE FROM public.interaction_events;

-- Adresses clients (→ customers CASCADE)
DELETE FROM public.customer_addresses;

-- Messages chat (→ chat_conversations CASCADE)
DELETE FROM public.chat_messages;

-- ----------------------------------------------------------
-- 2. Journal d'audit admin
-- ----------------------------------------------------------
DELETE FROM public.admin_audit_log;

-- ----------------------------------------------------------
-- 3. Interactions (pivot chat + email + callback)
--    → met à NULL : email_threads.interaction_id
--                   callback_requests.interaction_id
-- ----------------------------------------------------------
DELETE FROM public.interactions;

-- ----------------------------------------------------------
-- 4. Threads email
--    → met à NULL : email_messages.thread_id
-- ----------------------------------------------------------
DELETE FROM public.email_threads;

-- ----------------------------------------------------------
-- 5. Messages email et logs de synchronisation
-- ----------------------------------------------------------
DELETE FROM public.email_messages;
DELETE FROM public.email_sync_log;

-- ----------------------------------------------------------
-- 6. Demandes de rappel
-- ----------------------------------------------------------
DELETE FROM public.callback_requests;

-- ----------------------------------------------------------
-- 7. Conversations et agents chat
-- ----------------------------------------------------------
DELETE FROM public.chat_conversations;

-- Réinitialiser le statut des agents (sans les supprimer —
-- ils sont liés aux profils staff)
UPDATE public.chat_agents
SET
  status                    = 'offline',
  active_conversations_count = 0,
  pause_reason_id           = NULL,
  status_changed_at         = now(),
  last_seen_at              = now();

-- ----------------------------------------------------------
-- 8. Commandes
-- ----------------------------------------------------------
DELETE FROM public.orders;

-- ----------------------------------------------------------
-- 9. Clients (en dernier — tout ce qui les référençait
--    a été supprimé ou mis à NULL ci-dessus)
-- ----------------------------------------------------------
DELETE FROM public.customers;

-- ----------------------------------------------------------
-- Vérification (résultats attendus : 0 sur toutes les lignes)
-- ----------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM public.interactions)       AS interactions,
  (SELECT COUNT(*) FROM public.interaction_events) AS interaction_events,
  (SELECT COUNT(*) FROM public.email_threads)      AS email_threads,
  (SELECT COUNT(*) FROM public.email_messages)     AS email_messages,
  (SELECT COUNT(*) FROM public.email_sync_log)     AS email_sync_log,
  (SELECT COUNT(*) FROM public.callback_requests)  AS callback_requests,
  (SELECT COUNT(*) FROM public.callback_attempts)  AS callback_attempts,
  (SELECT COUNT(*) FROM public.chat_conversations)  AS chat_conversations,
  (SELECT COUNT(*) FROM public.chat_messages)       AS chat_messages,
  (SELECT COUNT(*) FROM public.orders)             AS orders,
  (SELECT COUNT(*) FROM public.customers)          AS customers,
  (SELECT COUNT(*) FROM public.customer_addresses) AS customer_addresses,
  (SELECT COUNT(*) FROM public.admin_audit_log)    AS admin_audit_log;

-- ----------------------------------------------------------
-- Vérification conservation (ces chiffres doivent être > 0)
-- ----------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM public.profiles)               AS staff_profiles,
  (SELECT COUNT(*) FROM public.products)               AS products,
  (SELECT COUNT(*) FROM public.categories)             AS categories,
  (SELECT COUNT(*) FROM public.crc_settings)           AS crc_settings,
  (SELECT COUNT(*) FROM public.crc_pause_reasons)      AS crc_pause_reasons,
  (SELECT COUNT(*) FROM public.crc_disposition_codes)  AS crc_disposition_codes,
  (SELECT COUNT(*) FROM public.crc_quick_replies)      AS crc_quick_replies,
  (SELECT COUNT(*) FROM public.email_accounts)         AS email_accounts,
  (SELECT COUNT(*) FROM public.chat_agents)            AS chat_agents;

COMMIT;
