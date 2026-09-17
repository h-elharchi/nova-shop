-- diagnostic-agents.sql
-- Requêtes READ-ONLY pour diagnostiquer l'état des agents et de l'enregistrement chat.
-- N'exécuter que pour inspecter — aucune modification.

-- 1. Agents enregistrés dans chat_agents et leur statut
SELECT
  ca.id,
  ca.user_id,
  p.email,
  p.first_name,
  p.last_name,
  p.role,
  ca.status,
  ca.active_conversations_count,
  ca.capacity,
  ca.status_changed_at,
  ca.last_seen_at
FROM public.chat_agents ca
JOIN public.profiles p ON p.id = ca.user_id
ORDER BY ca.last_seen_at DESC NULLS LAST;

-- 2. Profils staff sans entrée dans chat_agents (agents non enregistrés)
SELECT p.id, p.email, p.first_name, p.last_name, p.role
FROM public.profiles p
WHERE p.role IN ('agent', 'admin')
  AND NOT EXISTS (SELECT 1 FROM public.chat_agents ca WHERE ca.user_id = p.id)
ORDER BY p.email;

-- 3. Entrées dans chat_agents sans profil correspondant (orphelins)
SELECT ca.id, ca.user_id, ca.status, ca.last_seen_at
FROM public.chat_agents ca
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = ca.user_id)
ORDER BY ca.last_seen_at DESC NULLS LAST;

-- 4. Agents actifs dans les 5 dernières minutes
SELECT ca.user_id, p.email, ca.status, ca.last_seen_at
FROM public.chat_agents ca
JOIN public.profiles p ON p.id = ca.user_id
WHERE ca.last_seen_at >= NOW() - INTERVAL '5 minutes'
ORDER BY ca.last_seen_at DESC;

-- 5. Vérifier la fonction ensure_chat_agent
SELECT routine_name, routine_type, security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'ensure_chat_agent';
