# CLAUDE.md — NOVA SHOP

Mémoire technique du projet pour Claude Code.
Toujours lire ce fichier en entier avant toute modification.

---

## 1. Project Overview

NOVA SHOP est une boutique e-commerce bilingue (Français / Arabe) ciblant le marché marocain.
Les clients commandent via WhatsApp ou via un formulaire en ligne. L'admin et les agents CRC gèrent les produits, catégories, commandes et le chat client depuis un dashboard protégé.

**URL de production :** `https://<USERNAME>.github.io/nova-shop/`

**État du projet : Lots 1–6 + Lots 7–11 livrés (Lot 7–11 = Workspace Agent multicanal, interactions unifiées, contacts enrichis, historique unifié, supervision par canal). Build propre. Déploiement en attente de push.**

---

## 2. Business Purpose

- Vendre des produits au Maroc via WhatsApp
- Interface entièrement bilingue FR / AR avec support RTL complet
- Administration sécurisée (produits, catégories, commandes)
- Déploiement statique sur GitHub Pages (aucun serveur backend)
- Prise de commande sans système de paiement en ligne (paiement à la livraison)
- Chat en temps réel client ↔ agent CRC avec file d'attente, présence agent, wrap-up, transfert
- Supervision temps réel des agents et KPIs (taux de prise, DMA, DMT, niveau de service)
- Historique paginé des interactions (chat + email + callback) avec filtres canal/statut et export Excel
- Base clients centralisée (déduplication par téléphone, archive/restauration/anonymisation, adresses, audit, notes internes, historique 360°)
- Commandes multi-canal (site / whatsapp / email / chat / phone), 12 statuts, saisie admin
- Canal email Gmail : boîte de réception, threads, réponse, archivage, connexion OAuth2 via Edge Functions
- **Workspace Agent multicanal** (`/admin/workspace`) : chat + email + rappel dans une interface unifiée, distribution par `route_interactions()`, file d'attente par canal, wrap-up unifié, transfert
- Table `interactions` pivotante (chat, email, callback) avec machine d'états (queued → offered → assigned → active → wrap_up → closed)
- Supervision temps réel avec répartition par canal (chat / email / callback), KPIs live
- Formulaire de rappel client (CallbackForm) sur la page Contact et la page d'accueil

---

## 3. Architecture Générale

```
Frontend (React SPA — HashRouter)
      │
      ├── Supabase JS Client
      │       ├── Supabase Auth (email/password staff + signInAnonymously client)
      │       ├── Supabase Database (PostgreSQL + RLS + SECURITY DEFINER functions)
      │       ├── Supabase Storage (product-images, product-videos, avatars)
      │       └── Supabase Realtime (chat_messages, chat_conversations, chat_agents)
      │
      ├── WhatsApp API (wa.me — lien externe)
      └── Supabase Edge Functions (Deno — gmail-oauth-callback, gmail-sync, gmail-send)
              └── Google Gmail API (OAuth2 PKCE, refresh token stocké dans Supabase Vault)

Build Vite → dist/ → GitHub Actions → GitHub Pages
```

**Pas de backend custom exposé.** Toute la logique serveur est gérée par Supabase (RLS, triggers, fonctions SQL `SECURITY DEFINER`, Realtime) + Edge Functions Deno pour le canal Gmail.

**Secrets Edge Functions (jamais dans le frontend) :** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SITE_URL`

**Arbre des Providers (App.tsx) :**
```
HashRouter
  └── ThemeContext.Provider
        └── LanguageContext.Provider
              └── AgentProvider  ← useChatPresence singleton (partagé tout l'admin)
                    └── Routes
```

---

## 4. Technology Stack — Versions EXACTES

| Technologie | Version | Rôle |
|---|---|---|
| React | ^18.3.1 | UI framework |
| TypeScript | ^5.5.3 | Typage statique strict |
| Vite | ^5.4.1 | Build tool, dev server |
| Tailwind CSS | ^3.4.11 | Styles utilitaires |
| @supabase/supabase-js | ^2.45.0 | Client Supabase (BaaS) |
| react-router-dom | ^6.26.2 | Routing SPA (HashRouter) |
| lucide-react | ^0.441.0 | Icônes |
| xlsx | ^0.18.5 | Export Excel (commandes + conversations) |
| react-helmet-async | ^2.0.5 | En dépendance — NON UTILISÉ |
| postcss | ^8.4.45 | Compilation CSS |
| autoprefixer | ^10.4.20 | Préfixes CSS |

---

## 5. Fichiers SQL — Organisation et ordre d'exécution STRICT

**Tous les fichiers SQL sont dans `sql/` (organisés par sous-dossier). Exécuter dans cet ordre dans Supabase SQL Editor :**

```
sql/
├── schema/        ← Schémas principaux (exécuter dans l'ordre du tableau ci-dessous)
├── migrations/    ← Scripts one-shot (exécuter une seule fois après les schémas)
├── fixes/         ← Correctifs ponctuels et patches
├── diagnostics/   ← Requêtes de diagnostic (lecture seule)
└── maintenance/   ← Scripts de maintenance (purge, etc.)
```

### Schémas — `sql/schema/` (ordre strict)

| Ordre | Fichier | Contenu |
|---|---|---|
| 1 | `supabase-setup.sql` | Tables : categories, products, product_images, profiles. RLS. Triggers updated_at. Trigger handle_new_user. Fonction is_admin(). |
| 2 | `supabase-orders.sql` | Table orders + index + RLS |
| 3 | `supabase-chat.sql` | Tables : chat_conversations, chat_messages, chat_agents. RLS. Fonctions : ensure_chat_agent, claim_conversation, close_conversation, assign_to_available_admin, timeout_conversation, check_agents_online. |
| 4 | `supabase-accounts.sql` | **Lot 1.** Étend profiles (first_name, last_name, avatar_url, role→ agent/admin). Fonction is_staff(). Bucket avatars. Invitations par email. RLS mis à jour pour is_staff(). |
| 5 | `supabase-crc.sql` | **Lot 2.** Étend chat_agents (capacity, active_conversations_count, pause_reason_id, status_changed_at, statut pause). Étend chat_conversations (assigned_at, closed_at, disposition_code_id, wrap_up_seconds, internal_notes, transferred_from_id). Tables CRC : crc_settings, crc_pause_reasons, crc_disposition_codes, crc_quick_replies. RPCs : update_agent_heartbeat(TEXT,UUID), claim_conversation (avec capacité), close_conversation_with_wrapup, transfer_conversation, get_client_360. |
| 6 | `supabase-supervision.sql` | **Lot 3.** Fonctions : get_agents_dashboard(), get_supervision_kpis(period,date_from,date_to,agent_id), get_conversation_history(status,agent_id,…,page,page_size). |
| 7 | `supabase-customers.sql` | **Lot 5.** Table customers (phone UNIQUE, source). Trigger updated_at. RLS is_staff(). Realtime. |
| 8 | `supabase-orders-v2.sql` | **Lot 5.** Ajoute customer_id, channel (5 valeurs), assigned_agent_id, notes, callback_at à orders. Migration statuts (completed→delivered, 12 statuts). RPC create_order_admin (SECURITY DEFINER). |
| 9 | `supabase-email.sql` | **Lot 6.** Vault helpers (store/read/update_vault_secret, GRANT service_role uniquement). Tables : email_accounts, email_messages, email_sync_log. RLS. Realtime. Vue email_messages_view. Fonction match_customer_by_email_address. |
| 10 | `supabase-interactions.sql` | **Lots 7–11.** Tables : interactions, email_threads, callback_requests, callback_attempts, customer_addresses, customer_audit_log. Étend customers (status, version, customer_number, city, notes_internal). RPCs : route_interactions, accept/reject_interaction_offer, take_next_interaction, activate_interaction, start_wrap_up, close_interaction, transfer_interaction, create_callback_request, record_callback_attempt, archive_customer, restore_customer, delete_customer, get_customer_audit. |
| 11 | `supabase-customers-v2.sql` | Vue customers_view (order_count, delivered_count, interaction_count, default_city). |
| 12 | `supabase-distribution.sql` | Fonction route_interactions() + distribution automatique. |
| 13 | `supabase-distribution-cron.sql` | pg_cron job pour route_interactions() (toutes les 10s). |
| 14 | `supabase-orders-address.sql` | Champs adresse de livraison sur orders. |
| 15 | `supabase-chat-timeout.sql` | Timeout automatique des conversations chat. |
| 16 | `add-order-quantity.sql` | Colonne quantity sur orders. |

### Migrations one-shot — `sql/migrations/`

| Fichier | Moment d'exécution |
|---|---|
| `migrate-customers.sql` | Après étape 8 — peuple customers depuis orders existantes |
| `migrate-interactions.sql` | Après étape 10 — migre chat_conversations → interactions |

### Patches — `sql/fixes/`

| Fichier | Description |
|---|---|
| `patch-customers-view-delivered.sql` | Ajoute delivered_count à customers_view (DROP + recreate) |
| `fix-foreign-keys.sql` | Correctif clés étrangères |
| `fix-callback-attempt.sql` | Correctif table callback_attempts |
| `fix-chat-interaction-bridge.sql` | Liaison chat ↔ interactions |
| `fix-delete-customer.sql` | Correctif suppression client |
| `fix-email-interaction-bridge.sql` | Liaison email ↔ interactions |
| `fix-order-callback-trigger.sql` | Trigger commande → rappel |
| `fix-order-site-flow.sql` | Correctif flux commande site |
| `fix-category-subcategories.sql` | Sous-catégories multi-parents à profondeur libre : table `category_parents` (anti-cycle par trigger), `categories.show_at_root`. Migre l'ancienne colonne `parent_id` si elle existe. |

### Diagnostics — `sql/diagnostics/` (lecture seule)

`diagnostic-agents.sql`, `diagnostic-customers.sql`, `diagnostic-foreign-keys.sql`, `diagnostic-routing.sql`, `diagnostic-workspace-counts.sql`

### Maintenance — `sql/maintenance/`

`purge-transactional-data.sql` — purge données transactionnelles (conserve produits/utilisateurs/paramètres)

**⚠ Après modification d'une fonction SQL (signature ou type de retour), faire `DROP FUNCTION IF EXISTS ...` avant `CREATE OR REPLACE`.**
**⚠ Pour recréer une vue avec des colonnes réordonnées : `DROP VIEW IF EXISTS nom_vue;` puis `CREATE VIEW ...`.**

---

## 6. Structure du Projet

```
nova-shop/
├── .env                              # Variables d'env (NE PAS COMMITTER)
├── .env.example                      # ⚠ Préfixes NEXT_PUBLIC_ incorrects
├── .github/workflows/deploy.yml      # CI/CD GitHub Actions → GitHub Pages
├── supabase/
│   └── functions/
│       ├── gmail-oauth-callback/index.ts  # Lot 6 : échange code OAuth2, stocke refresh token en Vault
│       ├── gmail-sync/index.ts            # Lot 6 : fetch nouveaux emails Gmail → email_messages
│       └── gmail-send/index.ts            # Lot 6 : envoi email via Gmail API, stocke en email_messages
├── index.html                        # HTML entry + anti-flash dark mode script
├── vite.config.ts                    # base: '/nova-shop/' — CRITIQUE
├── tailwind.config.js                # darkMode: 'class', couleurs custom dark
├── tsconfig.app.json                 # strict: true, noUnusedLocals/Parameters
├── sql/
│   ├── schema/                       # Schémas principaux (ordre d'exécution section 5)
│   ├── migrations/                   # Scripts one-shot (migrate-customers, migrate-interactions)
│   ├── fixes/                        # Correctifs et patches ponctuels
│   ├── diagnostics/                  # Requêtes de diagnostic (lecture seule)
│   └── maintenance/                  # Scripts de maintenance (purge-transactional-data)
│
└── src/
    ├── main.tsx
    ├── App.tsx                       # HashRouter + providers + toutes les routes
    ├── index.css                     # Tailwind + RTL font + dark mode
    │
    ├── types/
    │   ├── index.ts                  # Types e-commerce (Product, Category, Order, Profile…) + re-exports CustomerV2
    │   ├── chat.ts                   # Types chat + CRC + supervision (voir section 9)
    │   └── interactions.ts           # Lots 7–11 : Interaction, InteractionWithDetails, EmailThread, CallbackRequest, CustomerV2, CustomerView, CustomerAddress, WorkspaceInteraction, UnifiedWrapUpData…
    │
    ├── i18n/translations.ts          # Traductions FR + AR — toutes les sections
    │
    ├── context/
    │   ├── LanguageContext.ts        # Context langue + hook useI18n()
    │   ├── ThemeContext.ts           # Context thème + hook useThemeCtx()
    │   └── AgentContext.tsx          # Provider singleton useChatPresence + useAgentCtx()
    │
    ├── hooks/
    │   ├── useLanguage.ts            # Langue, RTL, localStorage 'nova-shop-lang'
    │   ├── useTheme.ts               # Dark/light, localStorage 'nova-theme'
    │   ├── useAuth.ts                # Supabase Auth basique (session, signIn, signOut)
    │   ├── useStaffAuth.ts           # Auth étendue : profil complet (first_name, last_name, avatar_url, role)
    │   ├── useCategories.ts          # SELECT categories WHERE is_active=true
    │   ├── useProducts.ts            # SELECT products + category + images, avec filtres
    │   ├── useProduct.ts             # SELECT produit unique par slug + images + vidéos
    │   ├── useOrders.ts              # useCreateOrder, useCreateOrderAdmin, useOrders (admin), useOrderStats
    │   ├── useChat.ts                # Machine d'état widget chat client
    │   ├── useChatMessages.ts        # Chargement + Realtime messages d'une conversation
    │   ├── useChatPresence.ts        # Présence agent + liste conversations (Realtime)
    │   ├── useNotifications.ts       # Son (Web Audio API) + Notification API navigateur
    │   ├── useQuickReplies.ts        # Chargement réponses rapides CRC
    │   ├── useSupervision.ts         # Agents dashboard + KPIs + Realtime agents/interactions
    │   ├── useConversationHistory.ts # Historique paginé (ancien, conservé pour compatibilité)
    │   ├── useInteractionHistory.ts  # Lots 7–11 : historique unifié interactions (chat+email+callback) avec filtres canal/statut
    │   ├── useInteractions.ts        # Lots 7–11 : liste interactions avec filtres, pagination, Realtime
    │   ├── useCallbacks.ts           # Lots 7–11 : callback_requests + attempts, recordAttempt
    │   ├── useWorkspace.ts           # Lots 7–11 : état workspace (activeInteraction, offeredInteraction, queueCounts, actions)
    │   ├── useCustomers.ts           # Lots 5+7–11 : CustomerView, archive/restore/delete, addresses, audit, findByPhone
    │   ├── useEmailAccounts.ts       # Lot 6 : comptes Gmail, connectGmail (OAuth redirect), syncNow
    │   └── useEmailMessages.ts       # Lot 6 : messages + Realtime INSERT/UPDATE, mark statuts
    │
    ├── lib/
    │   ├── supabase.ts               # createClient singleton
    │   ├── whatsapp.ts               # WHATSAPP_NUMBER hardcodé + utilitaires
    │   ├── exportExcel.ts            # exportOrdersToExcel + exportConversationsToExcel
    │   ├── chat.ts                   # ensureAnonAuth, createConversation, sendMessage, RPCs CRC
    │   ├── contact.ts                # CONTACT_EMAIL = 'hel.nova.shop@gmail.com'
    │   ├── supervision.ts            # loadAgentsDashboard, loadSupervisionKpis, loadConversationHistory
    │   └── email.ts                  # Lot 6 : loadEmailAccounts, loadEmailMessages, getGmailAuthUrl, triggerEmailSync, sendEmail
    │
    ├── components/
    │   ├── layout/
    │   │   ├── Header.tsx            # Navbar + menu mobile + langue + dark mode
    │   │   ├── Footer.tsx
    │   │   └── Layout.tsx            # Header + main + Footer + WhatsAppFloat + ChatButton
    │   ├── products/
    │   │   ├── ProductCard.tsx
    │   │   └── ProductFiltersBar.tsx
    │   ├── orders/
    │   │   ├── OrderModal.tsx
    │   │   └── OrderStatusBadge.tsx
    │   ├── whatsapp/
    │   │   ├── WhatsAppButton.tsx
    │   │   └── WhatsAppFloat.tsx     # md:hidden
    │   └── chat/
    │       ├── ChatButton.tsx        # Bouton flottant bleu + conteneur widget
    │       ├── ChatWidget.tsx
    │       ├── ChatHeader.tsx
    │       ├── ChatCustomerForm.tsx
    │       ├── ChatQueueStatus.tsx
    │       ├── ChatClosedMessage.tsx
    │       ├── ChatMessage.tsx       # Gère aussi conversation_transferred
    │       ├── ChatInput.tsx
    │       ├── ChatWindow.tsx
    │       └── admin/
    │           ├── PauseModal.tsx        # Sélection motif de pause
    │           ├── WrapUpModal.tsx       # Disposition + notes à la clôture
    │           ├── QuickReplyPicker.tsx  # Overlay réponses rapides (déclenché par /)
    │           ├── TransferModal.tsx     # Transfert vers un autre agent disponible
    │           ├── ClientCard360.tsx     # Fiche client : historique conv + commandes par téléphone
    │           └── AdminChatInput.tsx    # Input admin avec déclencheur réponses rapides
    │
    └── pages/
        ├── Home/index.tsx
        ├── Products/index.tsx
        ├── ProductDetails/index.tsx
        ├── Categories/index.tsx
        ├── Categories/CategoryPage.tsx
        ├── Contact/index.tsx
        ├── SetPasswordPage.tsx           # Flux invitation (token sessionStorage → set-password)
        └── Admin/
            ├── LoginPage.tsx
            ├── ProtectedRoute.tsx        # requiredRole: 'agent' | 'admin'
            ├── AdminLayout.tsx           # Sidebar avec statut agent en temps réel
            ├── DashboardPage.tsx
            ├── ProductsPage.tsx
            ├── ProductFormPage.tsx
            ├── CategoriesPage.tsx
            ├── OrdersPage.tsx
            ├── ChatPage.tsx              # Interface agent CRC (ancienne, conservée)
            ├── CRCSettingsPage.tsx       # Paramètres CRC (admin)
            ├── SupervisionPage.tsx       # KPIs temps réel + répartition par canal (admin)
            ├── HistoryPage.tsx           # Historique unifié chat+email+callback (agent + admin)
            ├── AccountPage.tsx           # Mon compte (profil, avatar, mot de passe)
            ├── UsersPage.tsx             # Gestion utilisateurs (admin)
            ├── CustomersPage.tsx         # Lots 5+7–11 : liste clients + archive/restore/delete + adresses + audit
            ├── EmailPage.tsx             # Lot 6 : inbox Gmail (conservée, accessible depuis workspace)
            ├── EmailSettingsPage.tsx     # Lot 6 : connexion OAuth Gmail + liste comptes + sync
            └── WorkspacePage.tsx         # Lots 7–11 : workspace agent multicanal (chat+email+callback)
```

---

## 7. Routing

**IMPORTANT : HashRouter, pas BrowserRouter.**

| Path | Composant | Rôle requis |
|---|---|---|
| `/` | HomePage | Public |
| `/products` | ProductsPage | Public |
| `/products/:slug` | ProductDetailsPage | Public |
| `/categories` | CategoriesPage | Public |
| `/categories/:slug` | CategoryPage | Public |
| `/contact` | ContactPage | Public |
| `/set-password` | SetPasswordPage | Public (flux invitation) |
| `/admin/login` | AdminLoginPage | Public |
| `/admin` | AdminDashboard | agent |
| `/admin/chat` | Redirect `/admin/workspace` | — |
| `/admin/workspace` | WorkspacePage | agent |
| `/admin/orders` | AdminOrdersPage | agent |
| `/admin/history` | HistoryPage | agent |
| `/admin/account` | AdminAccountPage | agent |
| `/admin/products` | AdminProductsPage | admin |
| `/admin/products/new` | ProductFormPage | admin |
| `/admin/products/:id/edit` | ProductFormPage | admin |
| `/admin/categories` | AdminCategoriesPage | admin |
| `/admin/users` | AdminUsersPage | admin |
| `/admin/supervision` | SupervisionPage | admin |
| `/admin/crc-settings` | CRCSettingsPage | admin |
| `/admin/customers` | CustomersPage | agent |
| `/admin/email` | Redirect `/admin/workspace` | — |
| `/admin/email-settings` | EmailSettingsPage | admin |
| `*` | Redirect `/` | — |

**`ProtectedRoute`** accepte `requiredRole: 'agent' | 'admin'`. Vérifie la session ET le rôle via `useStaffAuth`. Si rôle insuffisant → redirect `/admin/login`.

---

## 8. Variables d'Environnement

```
VITE_SUPABASE_URL=<valeur_secrète>
VITE_SUPABASE_PUBLISHABLE_KEY=<valeur_secrète>
```

**⚠ Règles absolues :**
- Préfixe `VITE_` uniquement (jamais `NEXT_PUBLIC_`, `REACT_APP_`)
- Ne jamais committer `.env`
- Ne jamais utiliser la clé `service_role` côté frontend
- Le fichier `.env.example` a des préfixes NEXT_PUBLIC_ incorrects — ne pas s'y fier

---

## 9. Database Schema

### Schémas des tables modifiées par les Lots 1–3

#### `profiles` (étendue par `supabase-accounts.sql`)
```sql
id           UUID PK FK → auth.users ON DELETE CASCADE
email        TEXT
role         TEXT DEFAULT 'user' CHECK (role IN ('admin', 'agent', 'user'))
first_name   TEXT
last_name    TEXT
avatar_url   TEXT
created_at   TIMESTAMPTZ DEFAULT now()
```
**Rôles :** `admin` = accès complet | `agent` = chat + commandes + historique | `user` = ancien rôle inactif

#### `chat_agents` (étendue par `supabase-crc.sql`)
```sql
id                        UUID PK
user_id                   UUID UNIQUE FK → auth.users
status                    TEXT CHECK (status IN ('offline','available','busy','pause'))  -- 'pause' ajouté Lot 2
last_seen_at              TIMESTAMPTZ
capacity                  INTEGER NOT NULL DEFAULT 3   -- Lot 2
active_conversations_count INTEGER NOT NULL DEFAULT 0  -- Lot 2
pause_reason_id           UUID FK → crc_pause_reasons  -- Lot 2
status_changed_at         TIMESTAMPTZ                  -- Lot 2
created_at / updated_at   TIMESTAMPTZ
```

#### `chat_conversations` (étendue par `supabase-crc.sql`)
```sql
id                   UUID PK
customer_user_id     UUID FK → auth.users (session anonyme)
customer_first_name  TEXT NOT NULL
customer_last_name   TEXT NOT NULL
customer_phone       TEXT NOT NULL
status               TEXT CHECK (status IN ('waiting','active','closed','timeout'))
assigned_admin_id    UUID FK → auth.users
queue_position       INTEGER
last_message_at      TIMESTAMPTZ
assigned_at          TIMESTAMPTZ   -- Lot 2
closed_at            TIMESTAMPTZ   -- Lot 2
closed_by            UUID FK → auth.users  -- Lot 2
disposition_code_id  UUID FK → crc_disposition_codes  -- Lot 2
wrap_up_seconds      INTEGER       -- Lot 2
internal_notes       TEXT          -- Lot 2
transferred_from_id  UUID FK → auth.users  -- Lot 2
created_at / updated_at  TIMESTAMPTZ
```

#### Tables CRC (créées par `supabase-crc.sql`)

**`crc_settings`**
```sql
id          UUID PK
key         TEXT UNIQUE NOT NULL
value       JSONB NOT NULL
description TEXT
updated_at  TIMESTAMPTZ
updated_by  UUID FK → auth.users
```
Clés par défaut : `max_conversations_per_agent`, `service_level_threshold_seconds` (30), `wrap_up_timeout_seconds`, `sound_notifications_enabled`, `browser_notifications_enabled`, etc.

**`crc_pause_reasons`**
```sql
id, name_fr, name_ar, is_active, display_order, created_at
```
Données par défaut : Déjeuner, Formation, Administratif, Pause courte, Réunion d'équipe

**`crc_disposition_codes`**
```sql
id, code, name_fr, name_ar, is_active, display_order, created_at
```
Données par défaut : RESOLVED, CALLBACK, ORDER, INFO, TRANSFERRED, SPAM, NO_RESPONSE

**`crc_quick_replies`**
```sql
id, title_fr, title_ar, message_fr, message_ar, shortcut, is_active, display_order, created_at, created_by
```

#### `customers` (créée par `supabase-customers.sql` — Lot 5)
```sql
id          UUID PK DEFAULT gen_random_uuid()
phone       TEXT UNIQUE NOT NULL
first_name  TEXT NOT NULL
last_name   TEXT NOT NULL
email       TEXT
notes       TEXT
source      TEXT NOT NULL DEFAULT 'site' CHECK (source IN ('site','whatsapp','email','chat','phone'))
created_at  TIMESTAMPTZ DEFAULT now()
updated_at  TIMESTAMPTZ DEFAULT now()
```

#### `orders` (étendue par `supabase-orders-v2.sql` — Lot 5)
Colonnes ajoutées :
```sql
customer_id       UUID FK → customers ON DELETE SET NULL   -- Lot 5
channel           TEXT CHECK (channel IN ('site','whatsapp','email','chat','phone'))  -- Lot 5
assigned_agent_id UUID FK → auth.users ON DELETE SET NULL  -- Lot 5
notes             TEXT                                      -- Lot 5
callback_at       TIMESTAMPTZ                               -- Lot 5
```
**Statuts (12) :** `new`, `assigned`, `contacted`, `unreachable`, `callback`, `confirmed`, `processing`, `shipped`, `delivered`, `returned`, `cancelled`, `on_hold`
**Migration :** `completed` → `delivered` (run une seule fois dans `supabase-orders-v2.sql`)

#### `email_accounts` (créée par `supabase-email.sql` — Lot 6)
```sql
id                  UUID PK
label               TEXT NOT NULL
gmail_address       TEXT UNIQUE NOT NULL
vault_refresh_token UUID       -- référence vault.secrets.id (jamais exposé au frontend)
token_expires_at    TIMESTAMPTZ
is_active           BOOLEAN NOT NULL DEFAULT true
last_sync_at        TIMESTAMPTZ
created_at          TIMESTAMPTZ DEFAULT now()
```

#### `email_messages` (créée par `supabase-email.sql` — Lot 6)
```sql
id               UUID PK
email_account_id UUID NOT NULL FK → email_accounts ON DELETE CASCADE
gmail_message_id TEXT UNIQUE NOT NULL
gmail_thread_id  TEXT NOT NULL
subject          TEXT
from_address     TEXT NOT NULL
to_address       TEXT NOT NULL
body_text        TEXT
body_html        TEXT
direction        TEXT NOT NULL CHECK (direction IN ('in','out'))
status           TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','read','replied','archived'))
customer_id      UUID FK → customers ON DELETE SET NULL
order_id         UUID FK → orders ON DELETE SET NULL
received_at      TIMESTAMPTZ NOT NULL
created_at       TIMESTAMPTZ DEFAULT now()
```

#### `email_sync_log` (créée par `supabase-email.sql` — Lot 6)
```sql
id, email_account_id, synced_at, messages_fetched, error
```

### Tables inchangées

`categories`, `products`, `product_images`, `product_videos`, `chat_messages` — schémas identiques au départ.
`orders` : colonnes de base inchangées, colonnes Lot 5 ajoutées par migration.

---

## 10. Fonctions SQL — Référence Complète

### Fonctions helper (SECURITY DEFINER)

```sql
is_admin()   → profiles.role = 'admin'
is_staff()   → profiles.role IN ('admin', 'agent')   -- défini dans supabase-accounts.sql
```

### Fonctions chat (supabase-chat.sql, mises à jour dans supabase-crc.sql)

| Fonction | Signature actuelle | Description |
|---|---|---|
| `ensure_chat_agent()` | () → void | Crée l'entrée chat_agents si absente |
| `update_agent_heartbeat` | (TEXT, UUID) → void | Met à jour last_seen_at, status, pause_reason_id, status_changed_at |
| `claim_conversation` | (UUID) → SETOF chat_conversations | FOR UPDATE SKIP LOCKED — vérifie capacité — incrémente active_conversations_count |
| `close_conversation` | (UUID) → void | Passe en 'closed' — décrémente active_conversations_count |
| `close_conversation_with_wrapup` | (UUID, UUID, TEXT, INT) → void | Clôture + disposition_code_id + internal_notes + wrap_up_seconds |
| `transfer_conversation` | (UUID, UUID, TEXT) → void | Vérifie capacité cible — transfère — insère message système conversation_transferred |
| `assign_to_available_admin` | (UUID) → BOOLEAN | Trouve l'agent le moins chargé avec capacité — assigne |
| `timeout_conversation` | (UUID) → void | Passe en 'timeout' |
| `check_agents_online` | () → TABLE(available_count, busy_count, has_capacity) | Agents actifs dans les 2 dernières minutes |
| `get_client_360` | (TEXT) → JSON | Conv + commandes par numéro de téléphone |

### Fonctions supervision (supabase-supervision.sql)

| Fonction | Description |
|---|---|
| `get_agents_dashboard()` | JSON array de tous les agents avec profil, pause_reason, seconds_in_status |
| `get_supervision_kpis(p_period, p_date_from, p_date_to, p_agent_id)` | KPIs agrégés : total, taux de prise, DMA, DMT, niveau de service, dispositions |
| `get_conversation_history(p_status, p_agent_id, p_disposition_id, p_date_from, p_date_to, p_phone, p_page, p_page_size)` | Historique paginé JSON avec jointures profiles + disposition |

**Toutes les fonctions :** `SECURITY DEFINER SET search_path = public` + `GRANT EXECUTE TO authenticated`

### Fonctions Lot 5 (supabase-orders-v2.sql, supabase-customers.sql)

| Fonction | Signature | Description |
|---|---|---|
| `create_order_admin` | (p_product_id UUID, p_channel TEXT, p_first_name TEXT, p_last_name TEXT, p_phone TEXT, p_notes TEXT, p_callback_at TIMESTAMPTZ) → SETOF orders | SECURITY DEFINER — upsert customer (ON CONFLICT phone), insert order, retourne la commande créée. GRANT EXECUTE TO authenticated. |

### Fonctions Lot 6 (supabase-email.sql)

| Fonction | Signature | Description |
|---|---|---|
| `store_vault_secret` | (p_value TEXT, p_name TEXT) → UUID | SECURITY DEFINER — écrit dans vault.secrets. GRANT EXECUTE TO **service_role** uniquement. |
| `read_vault_secret` | (p_id UUID) → TEXT | SECURITY DEFINER — lit vault.decrypted_secrets. GRANT EXECUTE TO **service_role** uniquement. |
| `update_vault_secret` | (p_id UUID, p_new_value TEXT) → VOID | SECURITY DEFINER — met à jour vault.secrets. GRANT EXECUTE TO **service_role** uniquement. |
| `match_customer_by_email_address` | (p_from_address TEXT) → UUID | Retourne l'ID customer si email connu. GRANT EXECUTE TO authenticated. |

**Vue :** `email_messages_view` — jointure email_messages + email_accounts + customers. `GRANT SELECT TO authenticated`.

---

## 11. RLS (Row Level Security)

### Règle générale

| Table | Visiteur anonyme | Agent (`is_staff()`) | Admin (`is_admin()`) |
|---|---|---|---|
| `categories` | SELECT (actives) | FULL | FULL |
| `products` | SELECT (actifs) | FULL | FULL |
| `product_images` | SELECT | FULL | FULL |
| `orders` | INSERT | SELECT + UPDATE | FULL |
| `profiles` | SELECT own | SELECT + UPDATE own | FULL |
| `chat_conversations` | SELECT/INSERT WHERE customer_user_id = auth.uid() | FULL | FULL |
| `chat_messages` | SELECT/INSERT sur ses conv | FULL | FULL |
| `chat_agents` | — | SELECT + UPDATE own | FULL |
| `crc_settings` | — | SELECT | FULL |
| `crc_pause_reasons` | — | SELECT | FULL |
| `crc_disposition_codes` | — | SELECT | FULL |
| `crc_quick_replies` | — | SELECT | FULL |
| `customers` | — | FULL | FULL |
| `email_accounts` | — | SELECT | FULL |
| `email_messages` | — | FULL | FULL |
| `email_sync_log` | — | SELECT | SELECT |
| `interactions` | — | SELECT assigned_agent_id=uid() + FULL | FULL |
| `email_threads` | — | FULL | FULL |
| `callback_requests` | INSERT (anon) | FULL | FULL |
| `callback_attempts` | — | FULL | FULL |
| `customer_addresses` | — | FULL | FULL |
| `customer_audit_log` | — | SELECT | SELECT |

### Règles immuables (ne jamais violer)

1. `chat_conversations` INSERT client : `WITH CHECK (customer_user_id = auth.uid())`
2. `chat_conversations` SELECT client : `USING (customer_user_id = auth.uid())`
3. `chat_messages` client : sous-requête vérifiant que la conversation appartient à `auth.uid()`
4. Jamais de policy `WITH CHECK (true)` sur les tables chat pour le rôle anon

---

## 12. Supabase Storage

| Bucket | Contenu | Accès |
|---|---|---|
| `product-images` | Images produits | Public |
| `product-videos` | Vidéos produits | Public |
| `avatars` | Photos de profil staff | Lecture publique, upload/delete is_staff() + own path |

**Path avatars :** `{userId}/{timestamp}.{ext}`

---

## 13. Authentification & Autorisation

### Flux staff (admin + agent)
```
/admin/login → signInWithPassword() → session JWT
→ useStaffAuth() → charge profil (first_name, last_name, avatar_url, role)
→ ProtectedRoute(requiredRole) → vérifie role >= requiredRole
```

**`useStaffAuth`** (`src/hooks/useStaffAuth.ts`) :
- Expose : `user`, `profile`, `isAdmin`, `loading`, `signIn()`, `signOut()`
- `isAdmin` = `profile?.role === 'admin'`

**Promouvoir un agent en admin :**
```sql
UPDATE profiles SET role = 'admin' WHERE email = 'agent@example.com';
```

**Inviter un agent :**
Via `/admin/users` → appelle la Supabase Edge Function `invite-user` → email avec lien `/set-password`.

### Flux client (chat)
```
ensureAnonAuth() → signInAnonymously() → session stockée dans sessionStorage 'nova-chat-session'
→ createConversation() → RLS filtre sur customer_user_id = auth.uid()
```
Session perdue à la fermeture de l'onglet — comportement voulu.

---

## 14. Flux de Données Principaux

### Flux chat admin CRC (ChatPage)
```
Agent → /admin/chat → useAgentCtx() [via AgentProvider singleton]
      → setStatus('available') → update_agent_heartbeat + heartbeat 20s
      → 3 onglets : File d'attente | Mes actives | (historique retiré → HistoryPage)
      → [prendre] → claimConversation() → RPC claim_conversation (FOR UPDATE SKIP LOCKED)
      → [pause] → PauseModal → setStatus('pause', reasonId)
      → [réponse rapide] → taper '/' → QuickReplyPicker → sélection → texte inséré
      → [transférer] → TransferModal → transfer_conversation() → message système
      → [terminer] → WrapUpModal → close_conversation_with_wrapup()
      → [fiche 360°] → ClientCard360 → get_client_360(phone)
```

### Flux supervision
```
Admin → /admin/supervision → useSupervision()
      → get_agents_dashboard() + get_supervision_kpis(period, filters)
      → Realtime : re-fetch sur tout changement chat_agents ou chat_conversations
      → Filtres période + agent → bouton Appliquer → nouvelles requêtes
```

### Flux historique
```
Agent/Admin → /admin/history → useConversationHistory()
           → get_conversation_history(filters, page)
           → Bouton Voir messages → MessagesModal → useChatMessages(conv.id)
           → Export → exportConversationsToExcel()
```

---

## 15. Module Chat — Référence Rapide

### États widget client (`ChatWidgetState`)
```
idle → form → connecting → active
                         → searching → active (agent trouvé dans 30s)
                                     → timeout (30s dépassé)
                         → waiting   → active (agent prend la conv)
active → closed | timeout
```

### États agent (`ChatAgentStatus`)
`offline` | `available` | `busy` | `pause`

### Messages système reconnus (ChatMessage.tsx)
- `conversation_started` → t('chat.system_started')
- `conversation_closed` → t('chat.system_closed')
- `conversation_transferred` → t('chat.system_transferred')
- `conversation_transferred:NOTE` → t('chat.system_transferred') + note

### Pattern Realtime obligatoire (à reproduire dans tout nouveau hook)
```typescript
const instanceId = useRef(`${Date.now()}-${Math.random().toString(36).slice(2,7)}`)

useEffect(() => {
  const channel = supabase
    .channel(`nom-${instanceId.current}`)   // NOM UNIQUE PAR INSTANCE — règle absolue
    .on('postgres_changes', { ... }, handler)
    .subscribe()
  channelRef.current = channel
  return () => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
  }
}, [dep])
```

### AgentProvider — pattern singleton
`useChatPresence` est instancié **une seule fois** dans `AgentProvider` (App.tsx). Tous les composants admin utilisent `useAgentCtx()`. Ne jamais appeler `useChatPresence` directement dans un composant de page.

---

## 16. Module CRC — Référence Rapide

### Composants admin (`src/components/chat/admin/`)

| Composant | Déclencheur | Description |
|---|---|---|
| `PauseModal` | Clic "En pause" | Liste les crc_pause_reasons actives, confirme avec motif |
| `WrapUpModal` | Après fermeture conv | Sélectionne disposition + notes + affiche durée |
| `QuickReplyPicker` | Touche `/` dans input | Overlay filtrable, navigation clavier ↑↓ Enter Esc |
| `TransferModal` | Bouton Transférer | Filtre agents avec capacité, note de transfert |
| `ClientCard360` | Panneau droit (conv active) | Appelle get_client_360(phone), affiche conv + commandes |
| `AdminChatInput` | Zone saisie admin | Bouton Zap + détection token / → ouvre QuickReplyPicker |

### Paramètres CRC (`/admin/crc-settings`)
4 onglets : Motifs de pause | Codes de disposition | Réponses rapides | Général
- Général lit/écrit dans `crc_settings` (clés connues : max_conversations_per_agent, wrap_up_timeout_seconds, sound_notifications_enabled, browser_notifications_enabled, service_level_threshold_seconds)

---

## 17. Module Supervision — Référence Rapide

### KPIs calculés par `get_supervision_kpis`
- `total_received` — toutes les conversations créées dans la période
- `total_taken` — conversations avec assigned_admin_id non null
- `total_closed` / `total_timeout` / `total_waiting`
- `take_rate_pct` — total_taken / total_received × 100
- `avg_wait_seconds` — DMA : moyenne(assigned_at - created_at)
- `avg_handle_seconds` — DMT : moyenne(closed_at - assigned_at)
- `service_level_pct` — % conversations prises en < service_level_threshold_seconds
- `service_level_threshold` — lu depuis crc_settings (défaut : 30s)
- `dispositions` — répartition par code de qualification, triée par volume DESC

### Hook `useSupervision`
- Appelle `loadAgentsDashboard()` + `loadSupervisionKpis()` en parallèle
- Souscrit Realtime sur `chat_agents` (ANY) et `chat_conversations` (INSERT+UPDATE)
- Re-fetch complet à chaque événement Realtime

---

## 18. Internationalisation (i18n)

**Fichier :** `src/i18n/translations.ts` — objet `const translations` avec clés FR et AR.

**Sections existantes :**
```
nav.*           → Navigation
hero.*          → Section héro
sections.*      → Sections accueil
product.*       → Labels produit
filters.*       → Filtres produits
admin.*         → Labels interface admin (inclut supervision, history, crc_settings, customers, emails, email_settings)
account.*       → Mon compte
users.*         → Gestion utilisateurs
set_password.*  → Définition mot de passe (invitation)
forms.*         → Formulaires produits/catégories
contact.*       → Page contact
footer.*        → Pied de page
common.*        → Messages génériques (loading, error…)
chat.*          → Widget client + interface agent CRC (≈ 70 clés)
crc.*           → Paramètres CRC (≈ 20 clés)
supervision.*   → Page supervision (≈ 30 clés)
history.*       → Historique conversations (≈ 25 clés)
order.*         → Commandes + saisie admin + 12 statuts + 5 canaux (≈ 55 clés)
customers.*     → Page clients (≈ 20 clés)
email.*         → Inbox Gmail + email settings OAuth (≈ 35 clés)
```

**⚠ Clé `admin.email` existe déjà** (libellé champ email du formulaire login). La clé pour la nav email inbox est `admin.emails` (avec 's'). Ne pas créer de doublon.

**Règle :** toujours ajouter les clés FR ET AR simultanément. Jamais de string hardcodée dans l'UI.

---

## 19. RTL (Right-to-Left)

Activation automatique quand `lang === 'ar'` :
```typescript
document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
```
Police arabe : **Cairo** (Google Fonts), appliquée via `[dir="rtl"]` dans `index.css`.

---

## 20. Dark Mode

Classe `dark` sur `<html>`. Script anti-flash dans `index.html` (s'exécute avant React).
Stockage : `localStorage['nova-theme']` = `'dark'` | `'light'`

Couleurs custom :
```js
dark: { bg: '#0F1115', surface: '#171A21', card: '#1E222B', border: '#252B38' }
```

**Règle :** chaque nouveau composant doit avoir ses variantes `dark:`.

---

## 21. GitHub Actions / Pages

**Déclenchement :** Push sur `main` ou `workflow_dispatch`

**Pipeline :** checkout → Node 24 + cache npm → `npm ci` → `npm run build` (avec secrets) → upload artifact → deploy Pages

**Secrets GitHub requis :** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`

**Workflow deploy :** `Ctrl+K` commit dans WebStorm → `Ctrl+Shift+K` push → GitHub Actions se déclenche → 2–3 min → production mise à jour.

---

## 22. Commandes

```bash
npm run dev       # Dev server → http://localhost:5173/nova-shop/
npm run build     # TypeScript + Vite → dist/   (vérifier après toute modif importante)
npm run preview   # Preview build local
npm run lint      # ESLint flat config v9
```

---

## 23. Conventions de Code

- **Composants** : fonctions nommées exportées (pas de default export sauf `App`)
- **Hooks** : préfixe `use`, retournent un objet
- **Types** : `src/types/index.ts` (e-commerce) et `src/types/chat.ts` (chat + CRC + supervision)
- **Imports** : chemins relatifs, pas d'alias `@/`
- **Traductions** : toujours `t('section.clé')` — jamais de string hardcodée
- **Tailwind** : classes dans JSX, pas de CSS custom (sauf `index.css`)
- **Supabase queries** : dans les hooks ou lib/, jamais directement dans les composants
- **Gestion d'erreurs** : `setError(err.message)` + affichage dans l'UI
- **Cleanup hooks Realtime** : pattern `instanceId` + `removeChannel` dans le return du useEffect

---

## 24. Contraintes Critiques — RÈGLES ABSOLUES

1. **HashRouter obligatoire** — jamais BrowserRouter (casse GitHub Pages)
2. **`base: '/nova-shop/'`** dans `vite.config.ts` — ne jamais modifier
3. **Préfixe `VITE_`** pour les variables d'env — jamais `NEXT_PUBLIC_` ou autre
4. **Supabase anon key uniquement** côté frontend — jamais `service_role`
5. **RTL préservé** — chaque changement UI doit fonctionner en FR et AR
6. **Dark mode préservé** — variantes `dark:` obligatoires sur tout nouveau composant
7. **Build propre** — vérifier `npm run build` après toute modification importante
8. **Noms de canaux Realtime uniques** — suffixe `instanceId` obligatoire — jamais de nom statique partagé
9. **Isolation RLS chat** — jamais de SELECT global anon sur `chat_conversations` ou `chat_messages`
10. **DROP avant CREATE OR REPLACE** si la signature ou le type de retour d'une fonction SQL change
11. **AgentProvider singleton** — ne jamais instancier `useChatPresence` directement dans une page admin
12. **SECURITY DEFINER + SET search_path = public** sur toute nouvelle fonction SQL
13. **Ne pas introduire de nouveau framework** sans demande explicite

---

## 25. Points d'Attention / Problèmes Connus

1. **`.env.example` incorrect** : préfixes `NEXT_PUBLIC_` au lieu de `VITE_`. Ne pas s'y fier.

2. **`product_videos` absent de `supabase-setup.sql`** : la table existe en base (créée manuellement) mais n'est pas dans le script de setup.

3. **`react-helmet-async` non utilisé** : présent dans `package.json`, aucun import dans le code.

4. **Numéro WhatsApp hardcodé** : `212606732531` dans `src/lib/whatsapp.ts`.

5. **Copyright statique** : `© 2024 NOVA SHOP` dans les traductions footer.

6. **Heartbeat admin** : si l'onglet est fermé sans clic "Hors ligne", le statut reste actif 2 min en base (fenêtre heartbeat de `check_agents_online`).

7. **GRANTs fonctions CRC** : `supabase-crc.sql` drop/recrée des fonctions sans re-déclarer les GRANTs explicitement. Si erreur "permission denied" sur les RPCs CRC, exécuter les GRANTs manuellement (voir section 5, note après le tableau).

8. **Bundle size** : ~1 170 kB minifié (après Lots 7–11). Pas de code-splitting configuré. Warning Vite normal, ne pas s'en préoccuper sauf si besoin de perf.

9. **Historique dans ChatPage supprimé** : l'onglet "Historique" qui était dans ChatPage a été remplacé par la page `/admin/history`. Ne pas tenter de le réintroduire dans ChatPage.

14. **Table `interactions` requise** : `supabase-workspace.sql` doit être exécuté avant que le Workspace (`/admin/workspace`) et `HistoryPage` ne fonctionnent. Sans cette table, les pages afficheront des erreurs Supabase silencieuses (tableau vide).

15. **`route_interactions()` + pg_cron** : la distribution automatique nécessite l'extension `pg_cron` activée dans Supabase (Dashboard → Extensions → pg_cron) et l'exécution du cron job défini dans `supabase-workspace.sql`. Sans cela, les interactions restent en statut `queued` indéfiniment.

16. **`useConversationHistory` conservé** mais non utilisé dans les pages après Lot 11 (HistoryPage utilise maintenant `useInteractionHistory`). Il peut être supprimé si le code legacy `get_conversation_history` n'est plus nécessaire.

17. **InlineTransferModal dans WorkspacePage** : le composant de transfert est inline dans `WorkspacePage.tsx` (pas un fichier séparé) et affiche les agents par `user_id` tronqué. En production, relier les agents à `profiles` pour afficher les noms.

10. **Canal email — activation OAuth nécessaire** : la page `/admin/email-settings` ne peut fonctionner qu'après déploiement des Edge Functions gmail-* et configuration des secrets (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SITE_URL`) dans Supabase Dashboard.

11. **Vault obligatoire** : l'extension `supabase_vault` doit être activée avant d'exécuter `supabase-email.sql`. Vérifier dans **Database → Extensions**.

12. **migrate-customers.sql** : à exécuter une seule fois après `supabase-orders-v2.sql`. Si ré-exécuté, les INSERT sont idempotents (ON CONFLICT DO NOTHING) mais les UPDATE orders.customer_id sont répétés sans danger.

13. **Clé `admin.email` dupliquée** : la clé `admin.email` existait déjà (champ email du formulaire de connexion). La clé pour la nav inbox email est `admin.emails` (avec 's'). Ne pas confondre.

---

## 26. Améliorations Futures Possibles

- Corriger `.env.example` (VITE_ au lieu de NEXT_PUBLIC_)
- Ajouter `product_videos` dans `supabase-setup.sql`
- Mettre le numéro WhatsApp en variable d'environnement (`VITE_WHATSAPP_NUMBER`)
- Supprimer ou utiliser `react-helmet-async` (meta OG dynamiques par produit)
- Pagination côté serveur pour les produits
- Gestion de stock quantitatif
- Évaluation client (CSAT) à la fermeture de conversation
- Pièces jointes dans le chat (images depuis le catalogue)
- Graphiques historiques sur la page Supervision (courbe volume/jour)
- Code-splitting (dynamic import) pour réduire le bundle
- Filtres agents dans HistoryPage (recherche par nom)
- Synchronisation email automatique via pg_cron (toutes les 5 min)
- Attachements email dans la vue thread
- Liaison automatique email → commande (détection numéro commande dans le sujet)
- Notifications push navigateur pour les nouveaux emails entrants

---

## 27. Règles pour Claude Code

**Avant toute modification :**
1. Lire ce fichier CLAUDE.md en entier
2. Lire le fichier cible avec Read avant de l'éditer
3. Vérifier les imports existants avant d'en ajouter
4. Vérifier qu'une fonction SQL n'a pas changé de signature avant de la DROP

**Règles absolues :**
- Voir section 24 — toutes les contraintes critiques s'appliquent
- Ne pas remplacer HashRouter par BrowserRouter
- Ne pas changer `base` dans `vite.config.ts`
- Ne pas exposer les valeurs des secrets
- Ne pas introduire de nouveau framework ou librairie sans demande explicite
- Ne pas supprimer les classes `dark:` Tailwind existantes

**Lors d'ajouts :**
- Respecter les conventions PascalCase composants, camelCase hooks
- Ajouter les traductions FR ET AR simultanément dans `translations.ts`
- Ajouter les variantes `dark:` pour tout nouveau composant UI
- Vérifier `npm run build` après modifications importantes
- Pour tout nouveau hook Realtime : appliquer le pattern instanceId obligatoire

**En cas de doute :**
- Demander confirmation avant de modifier l'architecture
- Préférer une modification minimale à une réécriture complète

---

## 28. Environment de Développement

**IDE :** JetBrains WebStorm (`.idea/` exclu du git)

| Outil | Version | Notes |
|---|---|---|
| Node.js | 24 (LTS) | `.nvmrc` + GitHub Actions |
| npm | 10.x+ | Inclus avec Node 24 |
| TypeScript | ^5.5.3 | strict, noUnusedLocals, noUnusedParameters |
| ESLint | ^9.9.0 | Flat config `eslint.config.js` |

**Workflow déploiement :**
```
WebStorm → Ctrl+K (commit) → Ctrl+Shift+K (push) → GitHub main
→ GitHub Actions (2-3 min) → GitHub Pages production
```

**Fichiers à ne jamais committer :**
`.env`, `node_modules/`, `dist/`, `.idea/`, `*.iml`
