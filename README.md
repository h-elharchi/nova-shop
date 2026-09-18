# NOVA SHOP

Boutique e-commerce bilingue (Français / Arabe) ciblant le marché marocain, avec un back-office CRC complet pour gérer les commandes, les clients et les interactions multicanal (chat, email, rappel téléphonique).

---

## Table des matières

1. [Aperçu](#1-aperçu)
2. [Fonctionnalités](#2-fonctionnalités)
3. [Architecture](#3-architecture)
4. [Stack technique](#4-stack-technique)
5. [APIs & intégrations](#5-apis--intégrations)
6. [Structure du projet](#6-structure-du-projet)
7. [Schéma de base de données](#7-schéma-de-base-de-données)
8. [Guide développeur](#8-guide-développeur)
9. [Guide administrateur](#9-guide-administrateur)
10. [Guide agent CRC](#10-guide-agent-crc)
11. [Déploiement](#11-déploiement)
12. [Fichiers SQL — référence](#12-fichiers-sql--référence)
13. [Conventions de code](#13-conventions-de-code)
14. [Points d'attention connus](#14-points-dattention-connus)

---

## 1. Aperçu

NOVA SHOP est une **Single Page Application (SPA)** React déployée statiquement sur **GitHub Pages**. Elle n'a pas de serveur applicatif propre : toute la logique backend est déléguée à **Supabase** (base de données PostgreSQL, authentification, stockage, temps réel) et à des **Edge Functions Deno** pour l'intégration Gmail.

| Aspect | Détail |
|---|---|
| URL de production | `https://<USERNAME>.github.io/nova-shop/` |
| Déploiement | GitHub Actions → GitHub Pages |
| Backend | Supabase (BaaS) + Edge Functions Deno |
| Langue UI | Français / Arabe (RTL automatique) |
| Paiement | Aucun — paiement à la livraison |

---

## 2. Fonctionnalités

### Vitrine publique

- Catalogue produits avec images, vidéos, prix, filtres et recherche
- Navigation par catégories
- Fiche produit détaillée avec galerie
- Formulaire de commande (livraison à domicile, paiement à la livraison)
- Bouton WhatsApp flottant + lien direct commande WA
- Widget chat en temps réel avec file d'attente et indicateur de présence agent
- Formulaire de rappel téléphonique (page Contact + page d'accueil)
- Support complet RTL pour l'arabe (police Cairo)
- Mode sombre / clair persistant

### Back-office admin & agent

| Module | Accès | Description |
|---|---|---|
| Dashboard | agent + admin | Statistiques produits, commandes par statut avec filtres date/catégorie/produit |
| Commandes | agent + admin | Liste paginée, 12 statuts, filtres multi-critères, export Excel, saisie manuelle multi-canal |
| Workspace | agent + admin | Interface unifiée chat + email + callback, distribution automatique, wrap-up, transfert |
| Clients | agent + admin | Base clients centralisée, filtre "vrais clients" (≥1 livraison), archive/restauration, adresses, audit 360° |
| Historique | agent + admin | Historique unifié interactions (chat + email + callback), filtres canal/statut, export Excel |
| Supervision | admin | KPIs temps réel (taux de prise, DMA, DMT, niveau de service), tableau de bord agents |
| Produits | admin | CRUD complet, images, vidéos, catégories, slug URL |
| Catégories | admin | CRUD avec statut actif/inactif |
| Utilisateurs | admin | Invitation par email, gestion des rôles (agent / admin) |
| Paramètres CRC | admin | Motifs de pause, codes de disposition, réponses rapides, paramètres généraux |
| Email settings | admin | Connexion Gmail OAuth2, synchronisation, gestion comptes |
| Mon compte | agent + admin | Profil, avatar, changement de mot de passe |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT (Navigateur)                     │
│                                                             │
│   React SPA (HashRouter)                                    │
│   ├── ThemeContext  (dark/light)                            │
│   ├── LanguageContext  (fr/ar + RTL)                        │
│   └── AgentProvider  (useChatPresence singleton)            │
│           └── Pages & Composants                            │
└──────────────────────────┬──────────────────────────────────┘
                           │  HTTPS
          ┌────────────────┴─────────────────┐
          │         SUPABASE (BaaS)           │
          │                                  │
          │  ┌─────────────────────────────┐ │
          │  │  Auth                       │ │
          │  │  • email/password (staff)   │ │
          │  │  • signInAnonymously (chat) │ │
          │  └─────────────────────────────┘ │
          │  ┌─────────────────────────────┐ │
          │  │  Database (PostgreSQL)       │ │
          │  │  • RLS par rôle             │ │
          │  │  • Fonctions SECURITY DEF.  │ │
          │  │  • Triggers updated_at      │ │
          │  │  • pg_cron (distribution)   │ │
          │  └─────────────────────────────┘ │
          │  ┌─────────────────────────────┐ │
          │  │  Realtime (WebSocket)        │ │
          │  │  • chat_messages            │ │
          │  │  • chat_conversations       │ │
          │  │  • chat_agents              │ │
          │  │  • interactions             │ │
          │  └─────────────────────────────┘ │
          │  ┌─────────────────────────────┐ │
          │  │  Storage                    │ │
          │  │  • product-images (public)  │ │
          │  │  • product-videos (public)  │ │
          │  │  • avatars (auth)           │ │
          │  └─────────────────────────────┘ │
          │  ┌─────────────────────────────┐ │
          │  │  Edge Functions (Deno)       │ │
          │  │  • gmail-oauth-callback     │ │
          │  │  • gmail-sync               │ │
          │  │  • gmail-send               │ │
          │  └──────────────┬──────────────┘ │
          └─────────────────┼────────────────┘
                            │
                   ┌────────┴────────┐
                   │  Google Gmail   │
                   │  API (OAuth2)   │
                   └─────────────────┘
```

### Principes clés

- **Pas de serveur custom** : toute la logique métier vit dans Supabase (RLS, triggers, fonctions SECURITY DEFINER) et dans les Edge Functions Deno pour Gmail.
- **RLS (Row Level Security)** : chaque table a des politiques strictes. Les clients anonymes ne peuvent accéder qu'à leurs propres données de chat. Les agents voient les données opérationnelles. Les admins ont accès total.
- **Realtime** : les mises à jour (nouvelles conversations, messages, statuts agents) arrivent en push via des canaux WebSocket Supabase. Chaque canal a un identifiant unique par instance pour éviter les doublons.
- **HashRouter** : obligatoire pour GitHub Pages (absence de serveur pour gérer les routes côté serveur).
- **AgentProvider singleton** : le hook `useChatPresence` est instancié une seule fois au niveau `App.tsx`. Tous les composants admin y accèdent via `useAgentCtx()`.

---

## 4. Stack technique

### Frontend

| Technologie | Version | Rôle |
|---|---|---|
| **React** | ^18.3.1 | Framework UI, composants, hooks |
| **TypeScript** | ^5.5.3 | Typage statique strict (`strict: true`, `noUnusedLocals`) |
| **Vite** | ^5.4.1 | Build tool, dev server avec HMR |
| **Tailwind CSS** | ^3.4.11 | Styles utilitaires, dark mode (`class`), RTL |
| **react-router-dom** | ^6.26.2 | Routing SPA — **HashRouter obligatoire** |
| **lucide-react** | ^0.441.0 | Icônes SVG |
| **xlsx** | ^0.18.5 | Export Excel (commandes, conversations, clients) |
| **@supabase/supabase-js** | ^2.45.0 | Client Supabase (Auth, DB, Realtime, Storage) |
| **postcss** | ^8.4.45 | Pipeline CSS (requis par Tailwind) |
| **autoprefixer** | ^10.4.20 | Préfixes CSS navigateurs |

### Outils de développement

| Outil | Version | Usage |
|---|---|---|
| Node.js | 24 LTS | Environnement local + CI/CD |
| npm | 10.x+ | Gestionnaire de paquets |
| ESLint | ^9.9.0 | Linting (flat config v9) |
| Deno | runtime Supabase | Edge Functions Gmail |

---

## 5. APIs & intégrations

### Supabase

Plateforme BaaS centrale. Tous les appels passent par le client initialisé dans `src/lib/supabase.ts`.

| Service | Usage dans le projet |
|---|---|
| **Auth** | Connexion staff (email/password), session anonyme client chat (`signInAnonymously`), JWT dans toutes les requêtes |
| **Database (PostgreSQL)** | Toutes les données métier : produits, commandes, clients, interactions, chat, emails |
| **Realtime** | Push WebSocket des messages chat, changements de statut agents, nouvelles interactions — canaux nommés avec ID unique par instance |
| **Storage** | Images produits (`product-images`), vidéos (`product-videos`), avatars staff (`avatars`) — buckets publics ou protégés |
| **Edge Functions** | Intégration Gmail (OAuth2, synchronisation inbox, envoi) |
| **Vault** | Stockage chiffré du refresh token Gmail — jamais exposé au frontend |
| **pg_cron** | Distribution automatique des interactions (`route_interactions()` toutes les 10 s) |

Variables d'environnement requises (préfixe `VITE_` obligatoire) :

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
```

### Google Gmail API (OAuth2 PKCE)

Intégration du canal email via trois Edge Functions Deno :

| Edge Function | Déclencheur | Rôle |
|---|---|---|
| `gmail-oauth-callback` | Redirect OAuth2 | Échange le code d'autorisation → refresh token → stockage Vault |
| `gmail-sync` | Manuel ou pg_cron | Récupère les nouveaux emails Gmail → insère dans `email_messages` |
| `gmail-send` | Action agent | Envoie un email via Gmail API → enregistre le message sortant |

Secrets requis dans Supabase Dashboard → Edge Functions → Secrets :

```
GOOGLE_CLIENT_ID      = votre client ID Google Cloud
GOOGLE_CLIENT_SECRET  = votre client secret Google Cloud
SITE_URL              = https://<USERNAME>.github.io/nova-shop
```

Prérequis : extension `supabase_vault` activée (Dashboard → Database → Extensions).

### WhatsApp (wa.me)

Intégration légère via liens `https://wa.me/{numéro}?text={message_encodé}`. Pas d'API WhatsApp Business. Le numéro est configuré dans `src/lib/whatsapp.ts`.

---

## 6. Structure du projet

```
nova-shop/
├── .env                          # Variables d'environnement locales (NE PAS COMMITTER)
├── .env.example                  # Exemple — préfixes NEXT_PUBLIC_ incorrects, ne pas s'y fier
├── .github/
│   └── workflows/deploy.yml      # CI/CD : checkout → npm ci → build → GitHub Pages
├── supabase/
│   └── functions/
│       ├── gmail-oauth-callback/ # Edge Function : échange code OAuth2, stocke dans Vault
│       ├── gmail-sync/           # Edge Function : synchronisation inbox Gmail
│       └── gmail-send/           # Edge Function : envoi email via Gmail API
├── sql/
│   ├── schema/                   # 16 scripts — schémas principaux (ordre strict)
│   ├── migrations/               # 2 scripts — migrations one-shot
│   ├── fixes/                    # 8 scripts — correctifs et patches
│   ├── diagnostics/              # 5 scripts — requêtes de diagnostic (lecture seule)
│   └── maintenance/              # 1 script  — purge des données transactionnelles
├── index.html                    # Point d'entrée HTML + script anti-flash dark mode
├── vite.config.ts                # base: '/nova-shop/' — NE PAS MODIFIER
├── tailwind.config.js            # darkMode: 'class', couleurs dark personnalisées
├── tsconfig.app.json             # strict, noUnusedLocals, noUnusedParameters
└── src/
    ├── main.tsx                  # Point d'entrée React
    ├── App.tsx                   # HashRouter + Providers + Routes
    ├── index.css                 # Tailwind base + police Cairo (RTL) + variables dark
    │
    ├── types/
    │   ├── index.ts              # Product, Category, Order, Profile, OrderStatus, OrderChannel
    │   ├── chat.ts               # ChatAgent, ChatConversation, CRC, Supervision
    │   └── interactions.ts       # Interaction, CustomerV2, CustomerView, EmailThread, CallbackRequest
    │
    ├── i18n/
    │   └── translations.ts       # Toutes les traductions FR + AR (objet unique, ~1 500 clés)
    │
    ├── context/
    │   ├── LanguageContext.ts    # Expose : lang, setLang, t(), isRTL, dir
    │   ├── ThemeContext.ts       # Expose : theme, toggleTheme
    │   └── AgentContext.tsx      # AgentProvider (singleton) + useAgentCtx()
    │
    ├── hooks/                    # Un fichier par domaine métier
    │   ├── useAuth.ts            # Session Supabase basique (signIn, signOut, user)
    │   ├── useStaffAuth.ts       # Auth + profil complet + rôle admin/agent
    │   ├── useCategories.ts      # Liste des catégories actives
    │   ├── useProducts.ts        # Catalogue avec filtres (catégorie, recherche, tri)
    │   ├── useProduct.ts         # Produit unique par slug + images + vidéos
    │   ├── useOrders.ts          # CRUD commandes + stats dashboard filtrables
    │   ├── useCustomers.ts       # Base clients : CRUD, archive, audit, adresses, delivered_count
    │   ├── useChat.ts            # Machine d'état widget chat client (idle→form→active→closed)
    │   ├── useChatMessages.ts    # Messages d'une conversation + Realtime
    │   ├── useChatPresence.ts    # Présence agent + liste conversations + Realtime
    │   ├── useWorkspace.ts       # Workspace multicanal : état + actions (accept/reject/close)
    │   ├── useInteractions.ts    # Liste interactions avec filtres + Realtime
    │   ├── useInteractionHistory.ts  # Historique unifié paginé (chat + email + callback)
    │   ├── useCallbacks.ts       # Demandes de rappel + tentatives
    │   ├── useSupervision.ts     # KPIs + dashboard agents + Realtime
    │   ├── useEmailAccounts.ts   # Comptes Gmail (connexion OAuth, sync)
    │   ├── useEmailMessages.ts   # Messages email + Realtime INSERT/UPDATE
    │   ├── useNotifications.ts   # Son (Web Audio API) + Notification navigateur
    │   ├── useQuickReplies.ts    # Réponses rapides CRC
    │   ├── useLanguage.ts        # Langue active + RTL + persistence localStorage
    │   └── useTheme.ts           # Thème dark/light + persistence localStorage
    │
    ├── lib/
    │   ├── supabase.ts           # Singleton createClient (URL + anon key)
    │   ├── chat.ts               # ensureAnonAuth, createConversation, sendMessage, RPCs CRC
    │   ├── email.ts              # loadEmailAccounts, getGmailAuthUrl, triggerSync, sendEmail
    │   ├── supervision.ts        # loadAgentsDashboard, loadSupervisionKpis, loadConversationHistory
    │   ├── exportExcel.ts        # exportOrdersToExcel, exportConversationsToExcel, exportCustomersToExcel
    │   ├── whatsapp.ts           # WHATSAPP_NUMBER + buildWhatsAppUrl()
    │   └── contact.ts            # CONTACT_EMAIL
    │
    ├── components/
    │   ├── layout/
    │   │   ├── Header.tsx         # Navbar responsive + sélecteur langue + toggle dark mode
    │   │   ├── Footer.tsx         # Liens + copyright
    │   │   └── Layout.tsx         # Wrapper : Header + main + Footer + boutons flottants
    │   ├── products/
    │   │   ├── ProductCard.tsx    # Carte produit (image, nom bilingue, prix, bouton)
    │   │   └── ProductFiltersBar.tsx  # Filtres catégorie + tri + recherche
    │   ├── orders/
    │   │   ├── OrderModal.tsx         # Formulaire commande public
    │   │   ├── OrderCreateModal.tsx   # Saisie commande admin (multi-canal, recherche client)
    │   │   ├── OrderStatusBadge.tsx   # Badge coloré selon le statut
    │   │   └── CustomerOrdersPanel.tsx  # Onglet commandes dans la fiche client
    │   ├── whatsapp/
    │   │   ├── WhatsAppButton.tsx  # Bouton WhatsApp inline
    │   │   └── WhatsAppFloat.tsx   # Bouton flottant (masqué sur desktop)
    │   └── chat/
    │       ├── ChatButton.tsx          # Bouton flottant bleu + conteneur widget
    │       ├── ChatWidget.tsx          # Orchestrateur états du widget
    │       ├── ChatHeader.tsx          # En-tête : titre + indicateur présence
    │       ├── ChatCustomerForm.tsx    # Formulaire nom + téléphone avant connexion
    │       ├── ChatQueueStatus.tsx     # Position dans la file d'attente
    │       ├── ChatClosedMessage.tsx   # Message affiché quand la conversation est fermée
    │       ├── ChatMessage.tsx         # Bulle de message (gère les messages système)
    │       ├── ChatInput.tsx           # Zone de saisie client
    │       ├── ChatWindow.tsx          # Fenêtre de messages scrollable
    │       └── admin/
    │           ├── PauseModal.tsx         # Sélection du motif de pause
    │           ├── WrapUpModal.tsx        # Code disposition + notes + durée
    │           ├── QuickReplyPicker.tsx   # Overlay réponses rapides (touche /)
    │           ├── TransferModal.tsx      # Transfert vers agent disponible + note
    │           ├── ClientCard360.tsx      # Vue 360° client par téléphone
    │           └── AdminChatInput.tsx     # Input agent + déclencheur réponses rapides
    │
    └── pages/
        ├── Home/                  # Héro, produits vedette, formulaire rappel
        ├── Products/              # Catalogue avec filtres et pagination
        ├── ProductDetails/        # Fiche produit + galerie + commande + WA
        ├── Categories/            # Liste catégories + page par slug
        ├── Contact/               # Formulaire contact + rappel téléphonique
        ├── SetPasswordPage.tsx    # Flux invitation : token → définir mot de passe
        └── Admin/
            ├── LoginPage.tsx           # Connexion staff
            ├── ProtectedRoute.tsx      # Garde par rôle (agent | admin)
            ├── AdminLayout.tsx         # Sidebar + statut agent temps réel
            ├── DashboardPage.tsx       # Stats produits + commandes filtrables
            ├── WorkspacePage.tsx       # Workspace multicanal agent
            ├── OrdersPage.tsx          # Gestion commandes
            ├── CustomersPage.tsx       # Base clients (vrais clients, archive, audit)
            ├── HistoryPage.tsx         # Historique unifié interactions
            ├── SupervisionPage.tsx     # KPIs et tableau agents (admin)
            ├── ProductsPage.tsx        # Liste produits admin
            ├── ProductFormPage.tsx     # Formulaire création/édition produit
            ├── CategoriesPage.tsx      # Gestion catégories
            ├── UsersPage.tsx           # Gestion staff (invitations, rôles)
            ├── CRCSettingsPage.tsx     # Paramètres CRC (4 onglets)
            ├── EmailSettingsPage.tsx   # Configuration Gmail OAuth
            ├── AccountPage.tsx         # Mon compte (profil, avatar, mot de passe)
            └── ChatPage.tsx            # Interface CRC legacy (conservée)
```

---

## 7. Schéma de base de données

### Vue d'ensemble des relations

```
auth.users  (géré par Supabase Auth)
    │
    ├── profiles              ─── rôle admin | agent, nom, avatar
    └── chat_agents           ─── statut temps réel, capacité, motif pause

categories
    └── products ─────────── product_images
                          └── product_videos

customers ──────────────────── customer_addresses
    │                       └── customer_audit_log
    │
    ├── orders ─────────────── assigned_agent_id → auth.users
    │
    └── interactions  (pivot multicanal)
            ├── email_threads ──── email_messages ─── email_accounts
            ├── callback_requests ─── callback_attempts
            └── chat_conversations ─── chat_messages

crc_settings | crc_pause_reasons | crc_disposition_codes | crc_quick_replies
```

### Rôles & accès RLS

| Rôle | Profil | Accès |
|---|---|---|
| `anon` | Visiteur | SELECT produits/catégories, INSERT commandes/callbacks, chat sur ses propres conversations uniquement |
| `authenticated` + rôle `agent` | Agent CRC connecté | Lecture/écriture opérationnelle : commandes, clients, chat, interactions, email |
| `authenticated` + rôle `admin` | Administrateur | Accès complet à toutes les tables + paramètres |

Les fonctions `is_admin()` et `is_staff()` (`SECURITY DEFINER`) sont appelées dans chaque politique RLS.

### Statuts de commandes (12)

```
new → assigned → contacted → unreachable → callback
                                         ↓
confirmed → processing → shipped → delivered
                                         ↓
                             returned | cancelled | on_hold
```

### Machine d'états des interactions

```
queued ──→ offered ──→ assigned ──→ active ──→ wrap_up ──→ closed
               │
               └──→ rejected  (retour en queued pour redistribution)
```

### Vue `customers_view`

Agrège `customers` avec :
- `order_count` — nombre total de commandes
- `delivered_count` — nombre de commandes livrées (**vrais clients** : ≥ 1)
- `interaction_count` — nombre d'interactions
- `last_order_at` — date de la dernière commande
- `default_city` — ville de l'adresse par défaut

---

## 8. Guide développeur

### Prérequis

- Node.js 24 LTS + npm 10+
- Compte Supabase (projet créé + extensions `pg_cron` et `supabase_vault` activées)
- Compte GitHub avec GitHub Pages activé sur le dépôt

### Installation locale

```bash
# 1. Cloner le dépôt
git clone https://github.com/<USERNAME>/nova-shop.git
cd nova-shop

# 2. Installer les dépendances
npm install

# 3. Configurer les variables d'environnement
cp .env.example .env
# Éditer .env — utiliser le préfixe VITE_ (pas NEXT_PUBLIC_) :
#   VITE_SUPABASE_URL=https://xxxx.supabase.co
#   VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...
```

### Initialisation Supabase

Exécuter les scripts dans l'ordre depuis **Supabase Dashboard → SQL Editor** :

```
sql/schema/supabase-setup.sql             # 1
sql/schema/supabase-orders.sql            # 2
sql/schema/supabase-chat.sql              # 3
sql/schema/supabase-accounts.sql          # 4
sql/schema/supabase-crc.sql               # 5
sql/schema/supabase-supervision.sql       # 6
sql/schema/supabase-customers.sql         # 7
sql/schema/supabase-orders-v2.sql         # 8
sql/migrations/migrate-customers.sql      # 8b — si données existantes
sql/schema/supabase-email.sql             # 9
sql/schema/supabase-interactions.sql      # 10
sql/schema/supabase-customers-v2.sql      # 11
sql/schema/supabase-distribution.sql      # 12
sql/schema/supabase-distribution-cron.sql # 13 — pg_cron requis
sql/schema/supabase-orders-address.sql    # 14
sql/schema/supabase-chat-timeout.sql      # 15
sql/schema/add-order-quantity.sql         # 16
sql/migrations/migrate-interactions.sql   # Migration one-shot finale
```

### Commandes

```bash
npm run dev       # Serveur de développement → http://localhost:5173/nova-shop/
npm run build     # TypeScript strict + Vite → dist/
npm run preview   # Preview build production local
npm run lint      # ESLint flat config v9
```

> Toujours exécuter `npm run build` après une modification importante pour vérifier les erreurs TypeScript.

### Ajouter une traduction

Toutes les traductions sont dans `src/i18n/translations.ts`. Ajouter **simultanément** en FR et AR :

```typescript
// Dans l'objet fr.{section}
mon_module: {
  ma_cle: 'Texte français',
}

// Dans l'objet ar.{section}
mon_module: {
  ma_cle: 'النص العربي',
}
```

Utilisation :

```typescript
const { t, lang, isRTL } = useI18n()
t('mon_module.ma_cle')  // retourne la traduction dans la langue active
```

### Pattern obligatoire pour un nouveau hook Realtime

```typescript
const instanceId = useRef(`${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
const channelRef = useRef<RealtimeChannel | null>(null)

useEffect(() => {
  const channel = supabase
    .channel(`mon-canal-${instanceId.current}`)   // nom unique par instance — OBLIGATOIRE
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ma_table' }, handler)
    .subscribe()

  channelRef.current = channel

  return () => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
  }
}, [/* dépendances */])
```

### Règles pour les modifications SQL

**Fonction** — si la signature ou le type de retour change :
```sql
DROP FUNCTION IF EXISTS ma_fonction(anciens_types);
CREATE OR REPLACE FUNCTION ma_fonction(...) ...
```

**Vue** — si l'ordre des colonnes change :
```sql
DROP VIEW IF EXISTS ma_vue;
CREATE VIEW ma_vue AS ...;
GRANT SELECT ON ma_vue TO authenticated;
```

### Règles absolues — variables d'environnement

| Règle | Raison |
|---|---|
| Préfixe `VITE_` uniquement | Vite n'expose que les variables `VITE_*` au bundle |
| Jamais la clé `service_role` côté frontend | Donnerait un accès admin total à n'importe qui |
| Ne jamais committer `.env` | Contient des secrets — vérifié dans `.gitignore` |
| Secrets Edge Functions dans Supabase Dashboard | Jamais dans le code source |

---

## 9. Guide administrateur

### Connexion

URL : `https://<USERNAME>.github.io/nova-shop/#/admin/login`

Saisir l'email et le mot de passe du compte admin. Si vous n'avez pas encore de compte, un admin existant peut vous inviter depuis **Utilisateurs → Inviter**.

### Tableau de bord

La page d'accueil affiche :
- Les statistiques produits (total, actifs, inactifs, vedettes, nouveaux, catégories)
- Les compteurs de commandes par statut — **filtrables par date, catégorie et produit** via le bouton "Filtrer"
- Les 5 dernières commandes avec accès rapide (téléphone cliquable)

### Gestion des produits

**Créer un produit** : Menu Produits → Ajouter un produit
- Nom FR + AR, description FR + AR (bilingue obligatoire)
- Prix + prix barré optionnel (en MAD)
- Catégorie parente, slug URL (auto-généré depuis le nom)
- Cases : Actif / Populaire / Nouveau
- Images et vidéos uploadables

**Désactiver un produit** : décocher "Produit actif" — il disparaît de la vitrine sans être supprimé.

### Gestion des commandes

- Filtres disponibles : statut, canal (site/WhatsApp/email/chat/téléphone), agent assigné, ville, recherche texte, période
- Changer un statut : dans la liste, cliquer le sélecteur de statut sur la ligne
- Saisir une commande : bouton "Saisir commande" → choisir le canal → chercher le client par téléphone → sélectionner le produit
- Export Excel : respecte tous les filtres actifs

**Les 12 statuts :**

| Statut | Signification |
|---|---|
| Nouvelle | Commande reçue, non traitée |
| Assignée | Attribuée à un agent |
| Contactée | Client contacté |
| Injoignable | Impossible de joindre le client |
| Rappel | Rappel programmé (date planifiée) |
| Confirmée | Client a confirmé la commande |
| En préparation | En cours de préparation logistique |
| Expédiée | Colis remis au transporteur |
| Livrée | Livraison confirmée |
| Retournée | Colis retourné |
| Annulée | Commande annulée |
| En attente | Blocage temporaire |

### Gestion des clients

**Filtre "Vrais clients"** : dans le sélecteur de commandes, choisir _"Vrais clients (≥1 livrée)"_ pour n'afficher que les clients ayant au moins une commande livrée. Un badge vert (✓ + nombre de livraisons) identifie ces clients dans la liste et dans leur fiche.

**Actions sur un client :**
- **Archiver** : conservation des données, client masqué par défaut (avec motif)
- **Restaurer** : remet le client en statut actif
- **Supprimer** : anonymise si des commandes sont liées, suppression définitive sinon
- **Notes internes** : modifiables depuis la fiche — non visibles du client
- **Onglet Adresses** : gestion des adresses de livraison avec adresse par défaut
- **Onglet Audit** : journal des actions (archivages, modifications, suppressions) avec dates et acteurs

### Gestion des utilisateurs staff

Menu Utilisateurs (admin uniquement)

**Inviter un agent** : saisir l'email → invitation envoyée → l'agent clique le lien et définit son mot de passe via `/set-password`.

**Promouvoir un agent en admin** (via Supabase SQL Editor) :
```sql
UPDATE profiles SET role = 'admin' WHERE email = 'agent@example.com';
```

### Paramètres CRC (Centre de Relation Client)

4 onglets accessibles via le menu Paramètres CRC :

| Onglet | Contenu |
|---|---|
| Motifs de pause | Raisons disponibles quand un agent se met en pause |
| Codes de disposition | Qualification à la clôture : RESOLVED, CALLBACK, ORDER, INFO, TRANSFERRED, SPAM, NO_RESPONSE |
| Réponses rapides | Messages prédéfinis accessibles via `/` dans l'interface agent (FR + AR, raccourci clavier) |
| Général | Capacité max par agent, seuil niveau de service (défaut 30 s), durée wrap-up, notifications sonores/browser |

### Supervision temps réel

Accessible aux admins uniquement. Affiche en temps réel (mise à jour automatique Realtime) :
- Statut de chaque agent (disponible / occupé / pause / hors ligne) avec durée dans l'état
- KPIs sur la période : taux de prise, DMA (Durée Moyenne d'Attente), DMT (Durée Moyenne de Traitement), niveau de service
- Répartition par canal (chat / email / callback)

### Configuration Gmail

Menu Email Settings (admin uniquement) :
1. Cliquer "Connecter Gmail"
2. Se connecter au compte Google et autoriser l'accès
3. Le refresh token est stocké de façon sécurisée dans Supabase Vault
4. Synchronisation manuelle ou automatique (pg_cron)

Prérequis : Edge Functions déployées + secrets Google Cloud configurés.

---

## 10. Guide agent CRC

### Se rendre disponible

1. Se connecter sur `/admin/login`
2. Dans la barre latérale, cliquer sur son statut → sélectionner **"Disponible"**
3. Le statut apparaît en vert dans la sidebar — les nouvelles interactions commencent à arriver

### Workspace multicanal (`/admin/workspace`)

Interface unifiée recevant automatiquement les interactions selon la disponibilité et la capacité configurée.

**Cycle d'une interaction :**

```
Nouvelle interaction → Notification (son + badge)
    ↓
Bandeau "Offerte" → [Accepter] ou [Rejeter]
    ↓ (si acceptée)
Traitement : répondre au chat / email / appeler pour le rappel
    ↓
Bouton [Terminer] → Fenêtre wrap-up
    ├── Sélectionner le code de disposition (RESOLVED, ORDER, etc.)
    └── Ajouter des notes internes (optionnel)
    ↓
Interaction fermée → retour en disponible
```

**Réponses rapides :** Taper `/` dans la zone de saisie pour ouvrir le sélecteur. Navigation : ↑↓ pour naviguer, Enter pour insérer, Esc pour fermer.

**Transférer :** Bouton "Transférer" → choisir un agent avec capacité disponible → ajouter une note de contexte optionnelle → confirmer.

**Fiche 360°** : Visible dans le panneau droit en conversation chat active. Affiche toutes les conversations et commandes passées du client identifié par son numéro de téléphone.

### Se mettre en pause

Cliquer sur son statut → Pause → sélectionner le motif → confirmer. Les nouvelles interactions ne sont plus distribuées pendant la pause.

### Historique (`/admin/history`)

Consultez l'historique complet de toutes vos interactions (ou de tous les agents pour les admins). Filtres disponibles : canal, statut, période. Export Excel.

---

## 11. Déploiement

### Pipeline GitHub Actions

Déclenchement automatique à chaque push sur `main` :

```
Push sur main
    ↓
GitHub Actions (.github/workflows/deploy.yml)
    ├── Checkout du code
    ├── Node.js 24 + cache npm
    ├── npm ci
    ├── npm run build
    │   └── Injecte VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY (secrets GitHub)
    └── Deploy artifact → GitHub Pages
```

Durée : ~2–3 minutes.

### Secrets GitHub requis

Settings → Secrets and variables → Actions :

| Secret | Valeur |
|---|---|
| `VITE_SUPABASE_URL` | URL du projet Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Clé anon du projet Supabase |

### Déployer les Edge Functions Gmail

```bash
# Installer la CLI Supabase
npm install -g supabase

# Lier au projet Supabase
supabase link --project-ref <ref-projet>

# Déployer les fonctions
supabase functions deploy gmail-oauth-callback
supabase functions deploy gmail-sync
supabase functions deploy gmail-send

# Configurer les secrets
supabase secrets set GOOGLE_CLIENT_ID=<id>
supabase secrets set GOOGLE_CLIENT_SECRET=<secret>
supabase secrets set SITE_URL=https://<USERNAME>.github.io/nova-shop
```

### Activer les extensions Supabase requises

Dans Supabase Dashboard → Database → Extensions :
- `pg_cron` — distribution automatique des interactions
- `supabase_vault` — stockage sécurisé des tokens Gmail

---

## 12. Fichiers SQL — référence

```
sql/
├── schema/                               ← Exécuter dans l'ordre (1 à 16)
│   ├── supabase-setup.sql                # 1. Tables de base e-commerce
│   ├── supabase-orders.sql               # 2. Table orders
│   ├── supabase-chat.sql                 # 3. Chat temps réel
│   ├── supabase-accounts.sql             # 4. Comptes staff + rôles
│   ├── supabase-crc.sql                  # 5. CRC (pause, wrap-up, transfert)
│   ├── supabase-supervision.sql          # 6. Fonctions KPI
│   ├── supabase-customers.sql            # 7. Table clients
│   ├── supabase-orders-v2.sql            # 8. Multi-canal + 12 statuts
│   ├── supabase-email.sql                # 9. Canal Gmail + Vault
│   ├── supabase-interactions.sql         # 10. Interactions multicanal
│   ├── supabase-customers-v2.sql         # 11. Vue customers_view
│   ├── supabase-distribution.sql         # 12. Fonction route_interactions()
│   ├── supabase-distribution-cron.sql    # 13. pg_cron job (10 s)
│   ├── supabase-orders-address.sql       # 14. Adresses de livraison
│   ├── supabase-chat-timeout.sql         # 15. Timeout conversations chat
│   └── add-order-quantity.sql            # 16. Colonne quantité
│
├── migrations/                           ← One-shot (une seule fois)
│   ├── migrate-customers.sql             # Après étape 8
│   └── migrate-interactions.sql          # Après étape 10
│
├── fixes/                                ← Patches ponctuels
│   ├── patch-customers-view-delivered.sql  # delivered_count (DROP + recreate)
│   ├── fix-foreign-keys.sql
│   ├── fix-callback-attempt.sql
│   ├── fix-chat-interaction-bridge.sql
│   ├── fix-delete-customer.sql
│   ├── fix-email-interaction-bridge.sql
│   ├── fix-order-callback-trigger.sql
│   └── fix-order-site-flow.sql
│
├── diagnostics/                          ← Lecture seule
│   ├── diagnostic-agents.sql
│   ├── diagnostic-customers.sql
│   ├── diagnostic-foreign-keys.sql
│   ├── diagnostic-routing.sql
│   └── diagnostic-workspace-counts.sql
│
└── maintenance/
    └── purge-transactional-data.sql      # Purge (conserve produits/users/params)
```

---

## 13. Conventions de code

### Nommage

| Élément | Convention | Exemple |
|---|---|---|
| Composants React | PascalCase | `ProductCard`, `AdminLayout` |
| Fichiers composants | PascalCase.tsx | `OrderStatusBadge.tsx` |
| Hooks | camelCase + préfixe `use` | `useOrders`, `useChatPresence` |
| Fichiers hooks | camelCase.ts | `useCustomers.ts` |
| Types / interfaces | PascalCase | `CustomerView`, `OrderStatus` |
| Fonctions utilitaires | camelCase | `formatPhone`, `buildWhatsAppUrl` |

### Règles de développement

| Règle | Détail |
|---|---|
| Pas d'alias `@/` | Utiliser des chemins relatifs : `../../hooks/useOrders` |
| Pas de strings hardcodées dans l'UI | Toujours `t('section.cle')` via `useI18n()` |
| Queries Supabase dans hooks ou `lib/` | Jamais directement dans un composant |
| Dark mode obligatoire | Tout nouveau composant doit avoir ses variantes `dark:` |
| RTL obligatoire | Vérifier le rendu en arabe pour tout changement UI |
| Pas de `default export` | Sauf `App.tsx` — utiliser les exports nommés |
| Tailwind dans le JSX uniquement | Pas de CSS custom sauf dans `index.css` |
| Cleanup Realtime obligatoire | `return () => { supabase.removeChannel(...) }` dans chaque useEffect Realtime |
| Noms de canaux uniques | Suffixe `instanceId` obligatoire — jamais de nom statique partagé |

### Structure type d'un hook

```typescript
export function useMonHook(filters: MonFilters = {}) {
  const [data, setData]       = useState<MonType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase.from('ma_table').select('*')
    if (err) setError(err.message)
    else setData(data ?? [])
    setLoading(false)
  }, [/* dépendances stables */])

  useEffect(() => { load() }, [load])

  return { data, loading, error, refetch: load }
}
```

---

## 14. Points d'attention connus

| # | Problème | Solution / statut |
|---|---|---|
| 1 | `.env.example` a des préfixes `NEXT_PUBLIC_` incorrects | Utiliser `VITE_` uniquement — ne pas se fier au fichier exemple |
| 2 | `react-helmet-async` installé mais non utilisé | Peut être retiré de `package.json` |
| 3 | Numéro WhatsApp hardcodé dans `src/lib/whatsapp.ts` | Migrer vers variable `VITE_WHATSAPP_NUMBER` |
| 4 | Heartbeat agent : statut reste actif ~2 min après fermeture de l'onglet | Comportement normal (fenêtre heartbeat `check_agents_online`) |
| 5 | Bundle ~1 224 kB non splitté | Warning Vite normal — pas de code-splitting configuré. Voir section Améliorations. |
| 6 | `pg_cron` requis pour la distribution automatique des interactions | Activer dans Dashboard → Database → Extensions |
| 7 | `supabase_vault` requis pour l'intégration Gmail | Activer dans Dashboard → Database → Extensions |
| 8 | `CREATE OR REPLACE VIEW` échoue si les colonnes sont réordonnées | Toujours faire `DROP VIEW IF EXISTS` d'abord |
| 9 | `CREATE OR REPLACE FUNCTION` échoue si la signature change | Faire `DROP FUNCTION IF EXISTS (signature)` d'abord |
| 10 | `useConversationHistory` conservé mais remplacé par `useInteractionHistory` | Peut être supprimé si le code legacy n'est plus nécessaire |
| 11 | `InlineTransferModal` dans WorkspacePage affiche l'ID tronqué des agents | Relier à `profiles` pour afficher les noms complets |
| 12 | Canal email Gmail nécessite le déploiement des Edge Functions | Ne pas activer depuis l'UI avant que les fonctions soient déployées |
