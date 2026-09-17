-- diagnostic-routing.sql
-- Requêtes READ-ONLY pour diagnostiquer la distribution automatique des interactions.
-- N'exécuter que pour inspecter — aucune modification.

-- 1. Vérifier que pg_cron est activé et la tâche route-interactions planifiée
SELECT jobid, jobname, schedule, command, active, username
FROM cron.job
ORDER BY jobname;

-- 2. Vérifier les dernières exécutions de la tâche route-interactions
SELECT
  runid,
  jobid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'route-interactions')
ORDER BY start_time DESC
LIMIT 20;

-- 3. Vérifier que la fonction route_interactions existe
SELECT routine_name, routine_type, security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'route_interactions';

-- 4. Interactions par statut (vue d'ensemble)
SELECT status, channel, COUNT(*) AS nb
FROM public.interactions
GROUP BY status, channel
ORDER BY status, channel;

-- 5. Interactions en attente depuis plus de 5 minutes
SELECT id, interaction_number, channel, status, queued_at,
       EXTRACT(EPOCH FROM (NOW() - queued_at)) / 60 AS minutes_waiting
FROM public.interactions
WHERE status = 'queued'
ORDER BY queued_at ASC;

-- 6. Agents disponibles avec capacité restante
SELECT
  ca.user_id,
  p.email,
  p.first_name,
  ca.status,
  ca.capacity,
  ca.active_conversations_count,
  (ca.capacity - ca.active_conversations_count) AS remaining_capacity
FROM public.chat_agents ca
JOIN public.profiles p ON p.id = ca.user_id
WHERE ca.status = 'available'
ORDER BY remaining_capacity DESC;
