-- diagnostic-workspace-counts.sql
-- Requêtes READ-ONLY pour diagnostiquer la divergence entre le badge de la sidebar
-- (ancienne table chat_conversations) et les compteurs du workspace
-- (nouvelle table interactions).

-- 1. Conversations en attente (ancienne table — source du badge AVANT correctif)
SELECT status, COUNT(*) AS nb
FROM public.chat_conversations
GROUP BY status
ORDER BY nb DESC;

-- 2. Interactions en file (nouvelle table — source du workspace)
SELECT status, channel, COUNT(*) AS nb
FROM public.interactions
GROUP BY status, channel
ORDER BY status, channel;

-- 3. Comparaison directe : badge vs workspace
SELECT
  (SELECT COUNT(*) FROM public.chat_conversations WHERE status = 'waiting') AS badge_count_old,
  (SELECT COUNT(*) FROM public.interactions WHERE status = 'queued')         AS queue_count_new;

-- 4. Interactions assignées à chaque agent
SELECT
  p.email,
  p.first_name,
  i.channel,
  i.status,
  COUNT(*) AS nb
FROM public.interactions i
JOIN public.profiles p ON p.id = i.assigned_agent_id
WHERE i.status IN ('assigned', 'active', 'wrap_up')
GROUP BY p.email, p.first_name, i.channel, i.status
ORDER BY p.email, i.channel, i.status;

-- 5. Interactions offertes en cours (offres non expirées)
SELECT
  i.id,
  i.channel,
  i.status,
  i.offered_to,
  p.email AS offered_to_email,
  i.offer_expires_at,
  EXTRACT(EPOCH FROM (i.offer_expires_at - NOW())) AS secs_remaining
FROM public.interactions i
LEFT JOIN public.profiles p ON p.id = i.offered_to
WHERE i.status = 'offered'
  AND i.offer_expires_at > NOW()
ORDER BY i.offer_expires_at ASC;
