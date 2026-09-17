-- supabase-distribution-cron.sql
-- Planifie l'exécution automatique de route_interactions() via pg_cron.
-- route_interactions() est une fonction SQL pure (pas d'HTTP, pas de secrets Vault requis).
--
-- Prérequis :
--   1. Extension pg_cron activée : Supabase Dashboard → Extensions → pg_cron
--   2. supabase-workspace.sql déjà exécuté (fonction route_interactions définie)
--
-- Exécuter UNE SEULE FOIS dans Supabase SQL Editor

-- ─── Supprimer l'ancienne tâche si elle existe ────────────────

SELECT cron.unschedule('route-interactions');

-- ─── Planifier route_interactions toutes les 30 secondes ─────
-- Note : pg_cron standard supporte la syntaxe d'intervalle 'N seconds' sur Supabase.
-- Si votre version ne supporte pas '30 seconds', utiliser '* * * * *' (toutes les minutes).

SELECT cron.schedule(
  'route-interactions',
  '30 seconds',
  $$SELECT public.route_interactions()$$
);

-- ─── Vérification : confirmer la tâche planifiée ─────────────

SELECT jobid, jobname, schedule, command, active
FROM cron.job
WHERE jobname = 'route-interactions';
