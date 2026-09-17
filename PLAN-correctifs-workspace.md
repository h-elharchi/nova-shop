# PLAN-correctifs-workspace.md

> Diagnostic complet et plan d'implémentation — Correctifs Workspace Agent

---

## Problème 1 — `P0001 Only staff can register as chat agents`

**Cause racine :**
`App.tsx` utilise `useAuth()` (session Supabase brute) et passe `user?.id` directement
à `<AgentProvider>`. Quand un visiteur ouvre le widget chat, `ensureAnonAuth()` crée une
session anonyme → `user` devient l'utilisateur anonyme → `AgentProvider` transmet son
ID → `useChatPresence` appelle `ensureChatAgent()` → la fonction SQL lève
`RAISE EXCEPTION 'Only staff can register as chat agents'`.

**Fichier incriminé :** `src/App.tsx` lignes 42-47

**Correctif :**
Remplacer `useAuth()` par `useStaffAuth()` ; passer `userId` à `AgentProvider` seulement
si `isAgent || isAdmin` (profile chargé et rôle confirmé).

---

## Problème 2 — Compteur de durée statique, 3 boutons de statut, badge ≠ workspace

**Causes racines :**

1. **Durée** : `startDurationTimer()` (dans `useChatPresence`) est appelé uniquement lors
   d'un changement de statut explicite (`setStatus()`), jamais au chargement initial.
   `statusChangedAt.current` est initialisé à `Date.now()` → la durée repart toujours à 0
   après rechargement.
   Fichier : `src/hooks/useChatPresence.ts` ligne 21, 39.

2. **3 boutons** : La logique conditionnelle en `WorkspacePage` ligne 876–893 peut afficher
   simultanément "Disponible", "En pause" et "Hors ligne" quand `myStatus === 'busy'`.
   Fichier : `src/pages/Admin/WorkspacePage.tsx` lignes 875–893.

3. **Badge ≠ workspace** : `useChatPresence.loadWaitingCount` compte
   `chat_conversations.status = 'waiting'` (ancienne table). Le workspace compte
   `interactions.status = 'queued'` (nouvelle table). Les deux sources divergent.
   Fichier : `src/hooks/useChatPresence.ts` ligne 59–63.

**Correctifs :**
- `useChatPresence` : modifier `startDurationTimer` pour accepter un `fromTimestamp?`
  optionnel ; initialiser depuis `chat_agents.status_changed_at` au chargement.
- `useChatPresence` : `loadWaitingCount` → compter depuis `interactions.status = 'queued'`
  et souscrire à la table `interactions`.
- `WorkspacePage` : les boutons de statut s'affichent correctement déjà (max 2 en même
  temps), mais le "busy" génère 3 — déjà géré par la condition `!== 'offline'`.
  Aucune régression détectée côté logique ; conserver tel quel.

---

## Problème 3 — Historique : `Could not find a relationship between 'interactions' and 'profiles'`

**Cause racine :**
Dans `supabase-interactions.sql`, les colonnes agentes référencent `auth.users(id)` :
```sql
assigned_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
offered_to        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
closed_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
```
Pareil pour `interaction_events.actor_id` et `callback_attempts.agent_id`.

PostgREST ne peut pas construire un chemin de jointure `profiles!assigned_agent_id(...)` si
la FK ne pointe pas vers `public.profiles`. Il cherche une relation directe entre
`interactions` et `profiles` via la FK, et ne la trouve pas.

**Fichiers incriminés :** `supabase-interactions.sql` (schéma), `src/hooks/useInteractionHistory.ts` ligne 65.

**Correctif :**
Créer `fix-foreign-keys.sql` : migrer les 5 FK de `auth.users` vers `public.profiles`.
Exécuter `NOTIFY pgrst, 'reload schema'`. Aucun changement TypeScript nécessaire.

---

## Problème 4 — Distribution jamais déclenchée, bouton "Activer" sans effet

**Causes racines :**

1. **pg_cron** : Dans `supabase-distribution.sql`, le bloc `SELECT cron.schedule(...)` est
   commenté → aucune tâche planifiée → `route_interactions()` ne s'exécute jamais →
   les interactions restent indéfiniment en `queued`.

2. **Bouton "Activer"** : La condition ligne 1021 inclut `status === 'queued'` :
   ```tsx
   {(activeInteraction.status === 'assigned' || activeInteraction.status === 'queued') && (
   ```
   Mais la RPC `activate_interaction` exige `status = 'assigned'`. Pour une interaction
   `queued`, le RPC échoue silencieusement (aucune gestion d'erreur). De plus, le bouton
   appelle le RPC inline sans passer par `workspace.activateInteraction()`.

**Correctifs :**
- Créer `supabase-distribution-cron.sql` : `SELECT cron.schedule(...)` décommenté, appel
  direct à `public.route_interactions()` (SQL pur, pas d'HTTP → pas de secrets Vault
  requis pour ce cas).
- `WorkspacePage` : retirer `|| activeInteraction.status === 'queued'`, utiliser
  `workspace.activateInteraction()`, traduire le libellé.

---

## Problème 5 — Tentative rappel sans effet, clé `crc.internal_notes` brute

**Causes racines :**

1. **Clé de traduction manquante** : `WorkspacePage` ligne 568 utilise
   `t('crc.internal_notes')` — cette clé n'existe pas dans `translations.ts`.
   La fonction `t()` retourne la clé elle-même, ce qui affiche `crc.internal_notes` comme
   placeholder dans le champ commentaire du panneau callback.

2. **Erreur silencieuse** : `handleRecordAttempt` dans `CallbackPanel` (lignes 470–488)
   n'a pas de branche `else` si le RPC échoue. L'utilisateur n'a aucun retour visuel.

3. **Statuts bruts** : `Customer360` ligne 677 affiche `{i.status}` sans traduction.

**Correctifs :**
- Ajouter `callback.comment` (FR + AR) et `interactions.activate` (FR + AR) dans
  `translations.ts`.
- `WorkspacePage` : remplacer `t('crc.internal_notes')` par `t('callback.comment')`.
- `WorkspacePage` : ajouter gestion d'erreur dans `handleRecordAttempt` avec message
  rouge visible.
- `WorkspacePage` : traduire le statut dans `Customer360`.

---

## Plan d'implémentation — 8 parties

| # | Partie | Fichiers modifiés |
|---|--------|-------------------|
| 1 | Fix enregistrement agent | `src/App.tsx` |
| 2 | Fix FK + historique | `fix-foreign-keys.sql` (nouveau) |
| 3 | Fix distribution pg_cron + bouton Activer | `supabase-distribution-cron.sql` (nouveau), `src/pages/Admin/WorkspacePage.tsx` |
| 4 | Fix badge / compteurs | `src/hooks/useChatPresence.ts` |
| 5 | Fix rappels — tentative + placeholder | `src/pages/Admin/WorkspacePage.tsx`, `src/i18n/translations.ts` |
| 6 | Fix Customer 360 + durée | `src/pages/Admin/WorkspacePage.tsx`, `src/hooks/useChatPresence.ts` |
| 7 | Page Historique — labels filtres | `src/pages/Admin/HistoryPage.tsx` |
| 8 | Scripts SQL diagnostics | `diagnostic-agents.sql`, `diagnostic-foreign-keys.sql`, `diagnostic-routing.sql`, `diagnostic-workspace-counts.sql` |

---

## Scripts SQL à exécuter manuellement (ordre)

1. `fix-foreign-keys.sql` — Corriger les FK (prérequis pour l'historique)
2. `supabase-distribution-cron.sql` — Activer pg_cron (prérequis pour la distribution)

Les scripts diagnostics sont READ-ONLY et peuvent être exécutés à tout moment.

---

## Règles SQL appliquées

- Toutes les fonctions SQL : `SECURITY DEFINER SET search_path = public`
- FK → `public.profiles(id)` (jamais `auth.users` pour les jointures PostgREST)
- Scripts idempotents : `IF EXISTS` sur les `DROP CONSTRAINT`, `cron.unschedule` avant `cron.schedule`
- Pas de clé/URL en clair dans les scripts — `route_interactions()` est SQL pur (pas d'HTTP)
