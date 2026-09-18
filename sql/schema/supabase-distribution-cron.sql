-- supabase-distribution-cron.sql
-- Planifie l'exécution automatique de route_interactions() via pg_cron.
-- route_interactions() est une fonction SQL pure (pas d'HTTP, pas de secrets Vault requis).
--
-- Prérequis :
--   1. Extension pg_cron activée : Supabase Dashboard → Extensions → pg_cron
--   2. supabase-workspace.sql déjà exécuté (fonction route_interactions définie)
--
-- Exécuter UNE SEULE FOIS dans Supabase SQL Editor

-- ─── Supprimer l'ancienne tâche si elle existe (idempotent) ──

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'route-interactions';

-- ─── Planifier route_interactions toutes les 2 secondes ──────
-- Note : pg_cron supporte la syntaxe d'intervalle '[1-59] seconds' depuis 1.4+
-- (Supabase fournit 1.6.4). Si votre version ne le supporte pas, repasser à
-- '30 seconds' ou '* * * * *' (toutes les minutes).

SELECT cron.schedule(
  'route-interactions',
  '2 seconds',
  $$SELECT public.route_interactions()$$
);

-- ─── Vérification : confirmer la tâche planifiée ─────────────

SELECT jobid, jobname, schedule, command, active
FROM cron.job
WHERE jobname = 'route-interactions';
