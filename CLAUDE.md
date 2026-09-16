# CLAUDE.md — NOVA SHOP

Mémoire technique du projet pour Claude Code.
Toujours lire ce fichier avant toute modification.

---

## 1. Project Overview

NOVA SHOP est une boutique e-commerce bilingue (Français / Arabe) ciblant le marché marocain.
Les clients commandent via WhatsApp ou via un formulaire en ligne. L'admin gère les produits, catégories et commandes depuis un dashboard protégé.

**URL de production :** `https://<USERNAME>.github.io/nova-shop/`

---

## 2. Business Purpose

- Vendre des produits au Maroc via WhatsApp
- Interface entièrement bilingue FR / AR avec support RTL complet
- Administration sécurisée (produits, catégories, commandes)
- Déploiement statique sur GitHub Pages (aucun serveur backend)
- Prise de commande sans système de paiement en ligne (paiement à la livraison)
- Chat en temps réel client ↔ admin avec file d'attente et présence agent (Supabase Realtime)

---

## 3. Architecture Générale

```
Frontend (React SPA)
      │
      ├── Supabase JS Client
      │       ├── Supabase Auth (email/password admin + signInAnonymously client)
      │       ├── Supabase Database (PostgreSQL)
      │       ├── Supabase Storage (product-images, product-videos)
      │       └── Supabase Realtime (chat_messages, chat_conversations, chat_agents)
      │
      └── WhatsApp API (wa.me — lien external)

Build → dist/  →  GitHub Actions  →  GitHub Pages
```

**Pas de backend custom.** Toute la logique serveur est gérée par Supabase (RLS, triggers, fonctions SQL, Realtime).

---

## 4. Technology Stack — Versions EXACTES

| Technologie | Version | Rôle |
|---|---|---|
| React | ^18.3.1 | UI framework |
| TypeScript | ^5.5.3 | Typage statique |
| Vite | ^5.4.1 | Build tool, dev server |
| Tailwind CSS | ^3.4.11 | Styles utilitaires |
| @supabase/supabase-js | ^2.45.0 | Client Supabase (BaaS) |
| react-router-dom | ^6.26.2 | Routing SPA |
| lucide-react | ^0.441.0 | Icônes |
| xlsx | ^0.18.5 | Export Excel |
| react-helmet-async | ^2.0.5 | En dépendance — NON UTILISÉ dans le code actuel |
| postcss | ^8.4.45 | Compilation CSS |
| autoprefixer | ^10.4.20 | Préfixes CSS |

---

## 5. Structure du Projet

```
nova-shop/
├── .env                          # Variables d'env (NE PAS COMMITTER)
├── .env.example                  # ⚠ Contient des préfixes NEXT_PUBLIC_ incorrects
├── .github/workflows/deploy.yml  # CI/CD GitHub Actions → GitHub Pages
├── index.html                    # Point d'entrée HTML, anti-flash dark mode
├── vite.config.ts                # base: '/nova-shop/' — CRITIQUE pour GitHub Pages
├── tailwind.config.js            # darkMode: 'class', couleurs custom nova/dark
├── tsconfig.app.json             # strict: true, noUnusedLocals/Parameters
├── postcss.config.js             # tailwindcss + autoprefixer
├── supabase-setup.sql            # SQL: tables categories/products/product_images/profiles + RLS
├── supabase-orders.sql           # SQL: table orders + RLS
├── supabase-chat.sql             # SQL: tables chat_conversations/chat_messages/chat_agents + RLS + fonctions
│
├── public/
│   ├── favicon.ico / .svg / .png # Favicons multi-formats
│   ├── site.webmanifest          # PWA manifest (start_url: '/nova-shop/')
│   └── robots.txt
│
└── src/
    ├── main.tsx                  # Entrée React, StrictMode
    ├── App.tsx                   # HashRouter + providers + routes
    ├── index.css                 # Tailwind directives, RTL font, dark mode body
    ├── vite-env.d.ts             # Types Vite
    │
    ├── types/
    │   ├── index.ts              # Types e-commerce (Product, Category, Order, Profile…)
    │   └── chat.ts               # Types chat (ChatConversation, ChatMessage, ChatAgent, états…)
    ├── i18n/translations.ts      # Traductions FR + AR — inclut section chat.*
    │
    ├── context/
    │   ├── LanguageContext.ts    # Context React + hook useI18n()
    │   └── ThemeContext.ts       # Context React + hook useThemeCtx()
    │
    ├── hooks/
    │   ├── useLanguage.ts        # Langue + RTL + traductions, localStorage 'nova-shop-lang'
    │   ├── useTheme.ts           # Dark/light, localStorage 'nova-theme'
    │   ├── useAuth.ts            # Supabase Auth (session, signIn, signOut)
    │   ├── useCategories.ts      # SELECT categories WHERE is_active=true
    │   ├── useProducts.ts        # SELECT products + category + images, avec filtres
    │   ├── useProduct.ts         # SELECT produit unique par slug + images + vidéos
    │   ├── useOrders.ts          # useCreateOrder, useOrders (admin), useOrderStats
    │   ├── useChat.ts            # Machine d'état chat client (idle→form→connecting→active…)
    │   ├── useChatMessages.ts    # Chargement + Realtime messages d'une conversation
    │   └── useChatPresence.ts    # Présence admin (statut, heartbeat), useAdminConversations
    │
    ├── lib/
    │   ├── supabase.ts           # createClient(VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY)
    │   ├── whatsapp.ts           # WHATSAPP_NUMBER hardcodé, buildWhatsAppUrl, getOrderMessage
    │   ├── exportExcel.ts        # Export XLSX via librairie xlsx
    │   └── chat.ts               # ensureAnonAuth, createConversation, sendMessage, claimConversation, RPCs…
    │
    ├── components/
    │   ├── layout/
    │   │   ├── Header.tsx        # Navbar sticky, menu mobile, toggle langue, toggle dark mode
    │   │   ├── Footer.tsx        # Liens, contact, copyright
    │   │   └── Layout.tsx        # Wrapper Header + main + Footer + WhatsAppFloat
    │   ├── products/
    │   │   ├── ProductCard.tsx   # Carte produit (image, prix, badges, bouton commander)
    │   │   └── ProductFiltersBar.tsx # Filtres sidebar (search, catégorie, prix, stock)
    │   ├── orders/
    │   │   ├── OrderModal.tsx    # Modal commande (prénom, nom, téléphone marocain)
    │   │   └── OrderStatusBadge.tsx # Badge coloré selon statut
    │   ├── whatsapp/
    │   │   ├── WhatsAppButton.tsx # Bouton WhatsApp avec message optionnel
    │   │   └── WhatsAppFloat.tsx  # Bouton flottant mobile (bottom-20 right-4, md:hidden)
    │   └── chat/
    │       ├── ChatButton.tsx     # Bouton flottant bleu + conteneur du widget
    │       ├── ChatWidget.tsx     # Shell du widget (dimensions responsives, routing états)
    │       ├── ChatHeader.tsx     # Barre bleue avec dot statut, minimize, close
    │       ├── ChatCustomerForm.tsx # Formulaire prénom/nom/téléphone + validation
    │       ├── ChatQueueStatus.tsx  # Spinner countdown (searching) ou position file (waiting)
    │       ├── ChatClosedMessage.tsx # Écran fin de conversation (closed/timeout)
    │       ├── ChatMessage.tsx    # Bulle message (customer droite, admin gauche, système centré)
    │       ├── ChatInput.tsx      # Textarea auto-hauteur, Enter envoie, Shift+Enter newline
    │       └── ChatWindow.tsx     # Conteneur messages + input, toujours sender_type='customer'
    │
    └── pages/
        ├── Home/index.tsx         # Accueil: hero, nouveautés, populaires, catégories, CTA
        ├── Products/index.tsx     # Liste produits + filtres sidebar
        ├── ProductDetails/index.tsx # Détail produit, galerie images+vidéos, modal commande
        ├── Categories/index.tsx   # Grille catégories
        ├── Categories/CategoryPage.tsx # Produits d'une catégorie par slug
        ├── Contact/index.tsx      # Page contact WhatsApp + option démarrer le chat
        └── Admin/
            ├── LoginPage.tsx      # Formulaire connexion Supabase Auth
            ├── ProtectedRoute.tsx # Vérifie session active (useAuth)
            ├── AdminLayout.tsx    # Sidebar admin + badge waitingCount chat
            ├── DashboardPage.tsx  # Stats produits + stats commandes + dernières commandes
            ├── ProductsPage.tsx   # Liste produits admin (toggle actif, suppression)
            ├── ProductFormPage.tsx # Formulaire ajout/édition produit + upload images/vidéos
            ├── CategoriesPage.tsx # CRUD catégories (modal inline)
            ├── OrdersPage.tsx     # Gestion commandes (filtres, statuts, export Excel)
            └── ChatPage.tsx       # Interface admin chat (statut agent, file, actif, historique)
```

---

## 6. Routing

**IMPORTANT : HashRouter, pas BrowserRouter.**

```tsx
// App.tsx
<HashRouter>  // Utilise # dans l'URL : https://host/nova-shop/#/products
```

**Raison :** GitHub Pages sert des fichiers statiques. Sans HashRouter, un accès direct à `/products` retournerait une 404. Le `#` est traité côté client.

Routes définies :
| Path | Composant | Protégé |
|---|---|---|
| `/` | HomePage | Non |
| `/products` | ProductsPage | Non |
| `/products/:slug` | ProductDetailsPage | Non |
| `/categories` | CategoriesPage | Non |
| `/categories/:slug` | CategoryPage | Non |
| `/contact` | ContactPage | Non |
| `/admin/login` | AdminLoginPage | Non |
| `/admin` | AdminDashboard | Oui |
| `/admin/products` | AdminProductsPage | Oui |
| `/admin/products/new` | ProductFormPage | Oui |
| `/admin/products/:id/edit` | ProductFormPage | Oui |
| `/admin/categories` | AdminCategoriesPage | Oui |
| `/admin/orders` | AdminOrdersPage | Oui |
| `/admin/chat` | AdminChatPage | Oui |
| `*` | Redirect `/` | — |

---

## 7. Variables d'Environnement

**Fichier `.env` réel (variables correctes) :**
```
VITE_SUPABASE_URL=<valeur_secrète>
VITE_SUPABASE_PUBLISHABLE_KEY=<valeur_secrète>
```

**⚠ Point d'attention :** Le fichier `.env.example` contient des préfixes `NEXT_PUBLIC_` qui sont INCORRECTS pour ce projet Vite. Les vraies variables utilisées dans le code et le workflow GitHub Actions sont bien `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY`.

**Règle absolue :** Ne jamais exposer les valeurs de ces variables. Ne jamais les committer. Ne jamais les afficher dans les logs.

Les variables `VITE_` sont accessibles côté client (bundlées dans le build). Ce sont des clés publiques (anon key Supabase). La clé `service_role` ne doit JAMAIS être utilisée ici.

---

## 8. Supabase

### Initialisation

**Fichier :** `src/lib/supabase.ts`

```typescript
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
)
```

Le client est un singleton exporté, utilisé dans tous les hooks.

### Tables utilisées

| Table | Description |
|---|---|
| `categories` | Catégories de produits (FR + AR + slug) |
| `products` | Produits (FR + AR + prix + flags + catégorie) |
| `product_images` | Images associées aux produits (URL Supabase Storage) |
| `product_videos` | Vidéos associées aux produits (URL Supabase Storage) |
| `profiles` | Profils utilisateurs liés à `auth.users` (rôle admin/user) |
| `orders` | Commandes clients |
| `chat_conversations` | Conversations client ↔ admin (statut, file d'attente, agent assigné) |
| `chat_messages` | Messages d'une conversation (customer / admin / system) |
| `chat_agents` | Présence et statut des agents admin (offline / available / busy) |

### Relations

```
categories (1) ──< products (N)
products   (1) ──< product_images (N)
products   (1) ──< product_videos (N)
auth.users (1) ──  profiles (1)
products   (1) ──< orders (N)
auth.users (1) ──< chat_conversations (N)   [customer_user_id — auth anonyme]
chat_conversations (1) ──< chat_messages (N)
auth.users (1) ──  chat_agents (1)          [user_id — admin]
```

### Authentification anonyme (chat client)

Les clients du chat s'authentifient via `supabase.auth.signInAnonymously()` avant de créer une conversation. Cette session anonyme est persistée dans `sessionStorage` (`nova-chat-session`) pour permettre la reprise de session.

**Pourquoi :** La RLS de `chat_conversations` et `chat_messages` utilise `auth.uid()` pour isoler chaque client — un client ne peut jamais lire les conversations d'un autre.

### Supabase Realtime

Les 3 tables chat sont publiées dans la publication Realtime :
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE chat_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_agents;
```

**Règle impérative sur les noms de canaux :** Chaque instance de hook doit utiliser un nom de canal **unique** (suffix `instanceId = Date.now() + random`). Réutiliser le même nom retourne le canal déjà souscrit → erreur "cannot add postgres_changes callbacks after subscribe()".

Hooks concernés : `useChatPresence` (canal `agents-{id}`, `waiting-conv-{id}`), `useChatMessages` (canal `msgs-{convId}-{timestamp}`).

---

## 9. Database Schema

### Table `categories`
```sql
id         UUID PK DEFAULT gen_random_uuid()
name_fr    TEXT NOT NULL
name_ar    TEXT NOT NULL
slug       TEXT UNIQUE NOT NULL
image_url  TEXT (nullable)
is_active  BOOLEAN DEFAULT true
created_at TIMESTAMPTZ DEFAULT now()
updated_at TIMESTAMPTZ DEFAULT now()
```

### Table `products`
```sql
id              UUID PK DEFAULT gen_random_uuid()
slug            TEXT UNIQUE NOT NULL
name_fr         TEXT NOT NULL
name_ar         TEXT NOT NULL
description_fr  TEXT DEFAULT ''
description_ar  TEXT DEFAULT ''
price           NUMERIC(10,2) NOT NULL
old_price       NUMERIC(10,2) (nullable)
category_id     UUID FK → categories(id) ON DELETE SET NULL
is_active       BOOLEAN DEFAULT true
is_featured     BOOLEAN DEFAULT false
is_new          BOOLEAN DEFAULT false
stock_available BOOLEAN DEFAULT true
display_order   INTEGER DEFAULT 0
created_at      TIMESTAMPTZ DEFAULT now()
updated_at      TIMESTAMPTZ DEFAULT now()
```

### Table `product_images`
```sql
id            UUID PK DEFAULT gen_random_uuid()
product_id    UUID FK → products(id) ON DELETE CASCADE
image_url     TEXT NOT NULL
display_order INTEGER DEFAULT 0
created_at    TIMESTAMPTZ DEFAULT now()
```

### Table `product_videos`
```sql
id            UUID PK DEFAULT gen_random_uuid()
product_id    UUID FK → products(id) ON DELETE CASCADE
video_url     TEXT NOT NULL
display_order INTEGER DEFAULT 0
created_at    TIMESTAMPTZ DEFAULT now()
```
**⚠ Note :** Cette table est utilisée dans le code (`ProductFormPage`, `useProduct`) mais elle n'est PAS présente dans `supabase-setup.sql`. Elle doit être créée manuellement dans Supabase.

### Table `profiles`
```sql
id         UUID PK FK → auth.users(id) ON DELETE CASCADE
email      TEXT
role       TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user'))
created_at TIMESTAMPTZ DEFAULT now()
```

### Table `orders`
```sql
id                  UUID PK DEFAULT gen_random_uuid()
product_id          UUID FK → products(id) ON DELETE RESTRICT
product_name        TEXT NOT NULL
product_price       NUMERIC(10,2) NOT NULL
customer_first_name TEXT NOT NULL
customer_last_name  TEXT NOT NULL
customer_phone      TEXT NOT NULL
status              TEXT DEFAULT 'new' CHECK (status IN ('new','contacted','confirmed','cancelled','completed'))
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
```

Index sur `orders` : `product_id`, `status`, `created_at DESC`, `customer_phone`

### Table `chat_conversations`
```sql
id                   UUID PK DEFAULT gen_random_uuid()
customer_user_id     UUID FK → auth.users(id) ON DELETE CASCADE  -- session anonyme
customer_first_name  TEXT NOT NULL
customer_last_name   TEXT NOT NULL
customer_phone       TEXT NOT NULL
status               TEXT DEFAULT 'waiting' CHECK (status IN ('waiting','active','closed','timeout'))
assigned_admin_id    UUID FK → auth.users(id) ON DELETE SET NULL (nullable)
queue_position       INTEGER (nullable)
last_message_at      TIMESTAMPTZ (nullable)
created_at           TIMESTAMPTZ DEFAULT now()
updated_at           TIMESTAMPTZ DEFAULT now()
```

### Table `chat_messages`
```sql
id               UUID PK DEFAULT gen_random_uuid()
conversation_id  UUID FK → chat_conversations(id) ON DELETE CASCADE
sender_type      TEXT NOT NULL CHECK (sender_type IN ('customer','admin','system'))
sender_id        UUID (nullable)  -- NULL pour system
message          TEXT NOT NULL
created_at       TIMESTAMPTZ DEFAULT now()
```

### Table `chat_agents`
```sql
id           UUID PK DEFAULT gen_random_uuid()
user_id      UUID UNIQUE FK → auth.users(id) ON DELETE CASCADE
status       TEXT DEFAULT 'offline' CHECK (status IN ('offline','available','busy'))
last_seen_at TIMESTAMPTZ DEFAULT now()
created_at   TIMESTAMPTZ DEFAULT now()
updated_at   TIMESTAMPTZ DEFAULT now()
```

---

## 10. Triggers et Fonctions SQL

### Triggers `updated_at`
- `products_updated_at` → `update_updated_at()` → met à jour `updated_at` avant chaque UPDATE
- `categories_updated_at` → idem
- `orders_updated_at` → `update_orders_updated_at()` → idem

### Trigger de création de profil
- `on_auth_user_created` → `handle_new_user()` → crée un profil avec `role='user'` à chaque nouvel utilisateur Supabase Auth

### Fonction helper `is_admin()`
```sql
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;
```
Utilisée dans toutes les policies RLS pour les opérations admin.

### Triggers chat
- `chat_conversations_updated_at` → `update_updated_at()` — met à jour `updated_at`
- `chat_agents_updated_at` → `update_updated_at()` — idem
- `chat_messages_update_conversation` → `update_conversation_last_message()` — met à jour `last_message_at` de la conversation à chaque INSERT dans `chat_messages`
- `recalculate_queue_trigger` → `recalculate_queue_positions()` — recalcule les `queue_position` quand une conversation change de statut

### Fonctions SQL chat (fichier `supabase-chat.sql`)

| Fonction | Description |
|---|---|
| `ensure_chat_agent()` | Crée l'entrée `chat_agents` pour l'admin si elle n'existe pas |
| `update_agent_heartbeat(p_status TEXT DEFAULT NULL)` | Met à jour `last_seen_at` (et `status` si fourni) de l'agent courant |
| `claim_conversation(p_conversation_id UUID)` | Réserve atomiquement une conversation en attente via `FOR UPDATE SKIP LOCKED`, la passe en `active`, insère un message système `conversation_started`, retourne la conversation mise à jour |
| `close_conversation(p_conversation_id UUID)` | Passe la conversation en `closed`, libère `queue_position` |
| `assign_to_available_admin(p_conversation_id UUID)` | Cherche un agent `available` et lui assigne la conversation |
| `timeout_conversation(p_conversation_id UUID)` | Passe la conversation en `timeout` |
| `check_agents_online()` | Retourne `(available_count INT, busy_count INT)` — agents avec `last_seen_at` < 2 min |

---

## 11. RLS (Row Level Security)

Toutes les tables ont RLS activé.

| Table | Accès public | Accès admin |
|---|---|---|
| `categories` | SELECT WHERE is_active=true | FULL (ALL) |
| `products` | SELECT WHERE is_active=true | FULL (ALL) |
| `product_images` | SELECT (toutes) | FULL (ALL) |
| `orders` | INSERT (créer une commande) | FULL (ALL) |
| `profiles` | SELECT (propre profil) | SELECT (tous) |
| `chat_conversations` | SELECT/INSERT WHERE customer_user_id = auth.uid() | FULL (ALL) |
| `chat_messages` | SELECT/INSERT WHERE conversation appartient à auth.uid() | FULL (ALL) |
| `chat_agents` | — | FULL (ALL) |

**Note :** La table `product_videos` doit avoir des policies RLS similaires à `product_images`.

**Règle de sécurité chat :** Un client ne peut jamais lire les conversations d'un autre client. Le filtre RLS `customer_user_id = auth.uid()` sur `chat_conversations` et une sous-requête équivalente sur `chat_messages` garantissent l'isolation complète. Ne jamais créer de policy `WITH CHECK (true)` sans vérification sur ces tables.

---

## 12. Supabase Storage

### Buckets
| Bucket | Usage | Visibilité |
|---|---|---|
| `product-images` | Images des produits | Public |
| `product-videos` | Vidéos des produits | Public |

### Flux upload (ProductFormPage)
1. Admin sélectionne un fichier
2. Upload vers `supabase.storage.from('product-images').upload(path, file)`
3. Récupération URL : `supabase.storage.from('product-images').getPublicUrl(path)`
4. URL stockée dans `product_images.image_url`

**Path format :** `{productId}/{timestamp}-{index}.{ext}`

---

## 13. Authentification

**Méthode :** Supabase Auth, email + password uniquement.

**Flux :**
1. Admin navigue vers `/admin/login`
2. Saisie email + password → `supabase.auth.signInWithPassword()`
3. Session Supabase stockée dans localStorage/cookies par le client Supabase
4. `ProtectedRoute` vérifie la session via `useAuth` → `supabase.auth.getSession()`
5. Si pas de session → redirect `/admin/login`

**Hook `useAuth`** (`src/hooks/useAuth.ts`) :
- Écoute les changements de session via `supabase.auth.onAuthStateChange()`
- Expose : `user`, `loading`, `signIn()`, `signOut()`

---

## 14. Autorisation (Rôles)

**⚠ Point d'attention :** `ProtectedRoute` vérifie uniquement la présence d'une session active (user connecté). Il ne vérifie PAS si l'utilisateur a le rôle `admin`. 

Un utilisateur non-admin connecté via Supabase Auth pourrait théoriquement accéder aux pages `/admin/*`. La protection réelle est assurée côté base de données par les policies RLS (`is_admin()`).

Pour un accès complet admin, l'utilisateur doit avoir `role = 'admin'` dans la table `profiles`.

**Créer un admin :**
```sql
UPDATE profiles SET role = 'admin' WHERE email = 'admin@example.com';
```

---

## 15. Flux de Données Principaux

### Flux visiteur → produits
```
Browser → React → useProducts() → supabase.from('products').select()
       → PostgreSQL RLS (is_active=true) → Données → UI
```

### Flux commande client
```
Client → ProductCard/ProductDetailsPage → OrderModal
       → useCreateOrder() → supabase.from('orders').insert()
       → PostgreSQL (RLS: Public INSERT) → Commande créée
       → Admin reçoit notification (dashboard)
```

### Flux upload image admin
```
Admin → ProductFormPage → input[type=file]
      → supabase.storage.from('product-images').upload()
      → getPublicUrl() → URL publique
      → supabase.from('product_images').insert({ image_url })
```

### Flux WhatsApp
```
Client → WhatsAppButton.onClick()
       → getOrderMessage(productName, lang)
       → window.open('https://wa.me/212606732531?text=...')
       → Application WhatsApp
```

### Flux chat client (widget)
```
Client → ChatButton → openWidget() → widgetState: 'form'
       → saisie prénom/nom/téléphone → startChat()
           → ensureAnonAuth() [signInAnonymously si pas de session]
           → createConversation() → INSERT chat_conversations
           → assignToAvailableAdmin() → RPC assign_to_available_admin
               [admin dispo] → widgetState: 'active' → ChatWindow
               [admins occupés] → widgetState: 'waiting' → file d'attente
               [aucun admin] → widgetState: 'searching' → countdown 30s
                   [admin se connecte] → agent watch channel → assign → 'active'
                   [timeout] → timeoutConversation() → widgetState: 'timeout'
       → [actif] send() → INSERT chat_messages (sender_type='customer')
       → [fermer] → widgetState: 'closed'
```

### Flux chat admin (ChatPage)
```
Admin → /admin/chat → AdminChatPage
      → useChatPresence(adminId) → ensureChatAgent() → canal Realtime agents
      → setStatus('available') → updateAgentHeartbeat + heartbeat toutes 20s
      → tabs: file d'attente | actif | historique
      → [prendre conversation] → claimConversation() → RPC claim_conversation
          [FOR UPDATE SKIP LOCKED — protection race condition]
          → conversation passe 'active' + message système 'conversation_started'
      → useChatMessages(selectedConv.id) → load + canal Realtime messages
      → send(text, 'admin', user.id) → INSERT chat_messages (sender_type='admin')
      → [terminer] → closeConversation() → RPC close_conversation → 'closed'
```

---

## 16. WhatsApp

**Fichier :** `src/lib/whatsapp.ts`

- Numéro : `212606732531` (hardcodé)
- Messages bilingues FR/AR selon la langue active
- `WhatsAppButton` : bouton cliquable avec message personnalisé
- `WhatsAppFloat` : bulle flottante visible uniquement sur mobile (`md:hidden`)
- Lien format : `https://wa.me/212606732531?text=<encoded>`

**Pour changer le numéro :** Modifier uniquement `WHATSAPP_NUMBER` dans `src/lib/whatsapp.ts`.

---

## 17. Internationalisation (i18n)

**Fichier :** `src/i18n/translations.ts`

- 2 langues : `fr` (défaut) et `ar`
- Toutes les chaînes dans un seul objet `const translations`
- Clés hiérarchiques : `nav.home`, `product.price`, `order.submit`, etc.
- Stockage langue : localStorage, clé `nova-shop-lang`
- Hook `useLanguage()` expose : `lang`, `setLang()`, `t()`, `isRTL`, `dir`
- Contexte `LanguageContext` + hook `useI18n()` dans tous les composants

---

## 18. RTL (Right-to-Left)

**Implémentation :**

```typescript
// useLanguage.ts
useEffect(() => {
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  document.documentElement.lang = lang
}, [lang])
```

```css
/* index.css */
[dir="rtl"] {
  font-family: 'Cairo', 'Noto Sans Arabic', sans-serif;
}
```

- La police **Cairo** est chargée via Google Fonts pour l'arabe
- Certains composants appliquent `flex-row-reverse` ou `rotate-180` en RTL
- Le formulaire commande `OrderModal` utilise `dir={isRTL ? 'rtl' : 'ltr'}`
- Les champs arabe dans `ProductFormPage` ont `dir="rtl"` explicite

---

## 19. Dark Mode

**Implémentation :** Classe `dark` sur `<html>`, pattern Tailwind `darkMode: 'class'`

**Anti-flash script dans `index.html` :**
```javascript
var t = localStorage.getItem('nova-theme');
if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  document.documentElement.classList.add('dark');
}
```
Ce script s'exécute avant React pour éviter le flash de thème.

**Stockage :** localStorage, clé `nova-theme` (valeurs: `'dark'` | `'light'`)

**Hook `useTheme()`** : gère l'état, applique la classe, écoute les préférences système

**Couleurs custom dark :**
```js
dark: { bg: '#0F1115', surface: '#171A21', card: '#1E222B', border: '#252B38' }
```

---

## 20. Responsive Design

- Tailwind CSS breakpoints : `sm` (640px), `md` (768px), `lg` (1024px), `xl` (1280px)
- Grilles produits : `grid-cols-2 md:grid-cols-4`
- Sidebar admin : cachée sur mobile, visible sur `md:flex`
- Menu mobile : hamburger avec overlay
- `WhatsAppFloat` : visible uniquement sur mobile (`md:hidden`)
- Modal commande : bottom sheet sur mobile, centré sur desktop

---

## 21. GitHub Actions / Pages

**Fichier :** `.github/workflows/deploy.yml`

**Déclenchement :** Push sur `main` ou `workflow_dispatch`

**Pipeline :**
1. Checkout code (actions/checkout@v7)
2. Setup Node.js 24 (actions/setup-node@v7 avec cache npm)
3. `npm ci`
4. `npm run build` avec secrets `VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY`
5. actions/configure-pages@v6
6. Upload artifact `./dist` (actions/upload-pages-artifact@v5)
7. Deploy sur GitHub Pages (actions/deploy-pages@v5)

**URL de déploiement :** `https://<USERNAME>.github.io/nova-shop/`

**Permissions requises :** `contents: read`, `pages: write`, `id-token: write`

**Secrets à configurer dans GitHub :**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

---

## 22. Commandes

```bash
npm install          # Installer les dépendances
npm run dev          # Démarrer le serveur de développement (localhost:5173)
npm run build        # Compiler TypeScript + builder Vite → dist/
npm run preview      # Prévisualiser le build local
npm run lint         # Lancer ESLint
```

---

## 23. Conventions de Code Observées

- **Composants** : fonctions nommées exportées (pas de default export sauf `App`)
- **Hooks** : préfixe `use`, retournent un objet
- **Types** : centralisés dans `src/types/index.ts`
- **Imports** : chemins relatifs, pas d'alias `@/`
- **Traductions** : toujours via `t('clé.sous-clé')` — pas de strings hardcodées dans l'UI (sauf quelques exceptions dans les pages Admin)
- **Tailwind** : classes utilitaires directement dans JSX, pas de classes CSS custom sauf exceptions dans `index.css`
- **Dark mode** : pattern `bg-white dark:bg-dark-card` systématique
- **Supabase queries** : dans les hooks, pas directement dans les composants
- **Gestion d'erreurs** : `setError(err.message)` + affichage dans l'UI
- **Cleanup** : pattern `let cancelled = false` dans les hooks avec useEffect pour éviter les mises à jour sur composant démonté

---

## 24. Contraintes Critiques à Respecter

1. **HashRouter obligatoire** — Ne JAMAIS remplacer par BrowserRouter (casse GitHub Pages)
2. **base: '/nova-shop/'** dans `vite.config.ts` — Ne JAMAIS modifier sans changer aussi la config GitHub Pages
3. **Préfixe VITE_** pour les variables d'environnement — Ne JAMAIS utiliser `NEXT_PUBLIC_`, `REACT_APP_` ou autre
4. **Supabase anon key uniquement** — Ne JAMAIS utiliser `service_role` key dans le frontend
5. **RTL préservé** — Tout changement UI doit tester FR et AR
6. **Dark mode préservé** — Chaque nouveau composant doit avoir ses variantes `dark:`
7. **Pas de build cassé** — Toujours vérifier `npm run build` après modifications importantes
8. **Noms de canaux Realtime uniques** — Chaque instance de hook qui souscrit à Supabase Realtime DOIT utiliser un nom de canal unique (suffixe `instanceId` généré à la création du hook). Ne jamais réutiliser un nom statique partagé entre plusieurs instances du même hook.
9. **Isolation RLS chat** — Ne jamais accorder SELECT global sur `chat_conversations` ou `chat_messages` à l'anon role. La policy doit toujours filtrer sur `customer_user_id = auth.uid()`.

---

## 25. Points d'Attention / Problèmes Connus

1. **`.env.example` incorrect** : Contient `NEXT_PUBLIC_SUPABASE_URL` au lieu de `VITE_SUPABASE_URL`. À corriger.

2. **`product_videos` absent de `supabase-setup.sql`** : La table est utilisée dans `useProduct.ts` et `ProductFormPage.tsx` mais le script SQL de setup ne la crée pas. Elle doit être créée manuellement.

3. **`ProtectedRoute` ne vérifie pas le rôle admin** : Vérifie seulement la session, pas `role = 'admin'`. Un utilisateur non-admin connecté peut accéder au dashboard. Protection réelle = RLS côté Supabase.

4. **`react-helmet-async` non utilisé** : Présent dans `package.json` mais aucun import trouvé dans le code source. Dépendance morte potentielle.

5. **Numéro WhatsApp hardcodé** : `212606732531` dans `src/lib/whatsapp.ts`. Pas de variable d'environnement.

6. **Pas de validation côté serveur** pour les ordres (hors phone marocain validé côté client). La RLS empêche les abus mais n'effectue pas de validation des données.

7. **Copyright footer** : `© 2024 NOVA SHOP` — date statique dans les traductions.

8. **`supabase-chat.sql` doit être exécuté manuellement** dans Supabase SQL Editor. La table `product_videos` (même problème) n'est pas dans `supabase-setup.sql`.

9. **Heartbeat admin** : si l'onglet est fermé sans clic sur "Hors ligne", l'agent reste `available` en base jusqu'à expiration (`last_seen_at` > 2 min). `check_agents_online()` filtre sur cette fenêtre de 2 min.

10. **Session chat client** dans `sessionStorage` (clé `nova-chat-session`) — perdue à la fermeture de l'onglet. C'est voulu : une nouvelle session = un nouvel utilisateur anonyme.

---

## 26. Améliorations Futures Possibles

- Ajouter `product_videos` dans `supabase-setup.sql`
- Corriger `.env.example` (VITE_ au lieu de NEXT_PUBLIC_)
- Renforcer `ProtectedRoute` pour vérifier le rôle admin
- Mettre le numéro WhatsApp en variable d'environnement
- Supprimer `react-helmet-async` si non utilisé ou l'utiliser pour le SEO
- Ajouter des meta OG dynamiques par page produit
- Pagination côté serveur pour les produits
- Notifications sonores/visuelles (badge onglet) pour nouvelles conversations en attente
- Transfert de conversation entre agents admin
- Historique de chat côté client après fermeture et réouverture
- Pièces jointes dans le chat (images produit depuis le catalogue)
- Évaluation de la conversation (satisfaction client) à la fermeture

---

## 27. Module Chat — Référence Rapide

### États du widget client (`ChatWidgetState`)

```
idle → form → connecting → active
                         → searching → active (agent trouvé)
                                     → timeout (30s dépassé)
                         → waiting   → active (admin prend la conv)
active → closed
       → timeout
```

### États agent admin (`ChatAgentStatus`)
`offline` | `available` | `busy`

### Machine d'état `useChat.ts`

| Transition | Déclencheur |
|---|---|
| `idle → form` | `openWidget()` |
| `form → connecting` | `startChat(formData)` |
| `connecting → active` | `assignToAvailableAdmin()` retourne true |
| `connecting → searching` | aucun admin en ligne → countdown 30s |
| `connecting → waiting` | admins en ligne mais tous occupés |
| `searching → active` | agent se connecte pendant countdown |
| `searching → timeout` | countdown atteint 0 |
| `waiting → active` | subscription UPDATE on conv → status='active' |
| `active → closed` | subscription UPDATE on conv → status='closed' |
| `* → idle` | `resetToIdle()` |

### Pattern cleanup Realtime (à reproduire dans tout nouveau hook)

```typescript
const instanceId = useRef(`${Date.now()}-${Math.random().toString(36).slice(2,7)}`)

useEffect(() => {
  let cancelled = false
  const channel = supabase
    .channel(`nom-${instanceId.current}`)  // nom unique par instance
    .on('postgres_changes', { ... }, handler)
    .subscribe()
  channelRef.current = channel

  return () => {
    cancelled = true
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
  }
}, [dep])
```

### Sécurité RLS chat — règles immuables

1. `chat_conversations` INSERT : `WITH CHECK (customer_user_id = auth.uid())`
2. `chat_conversations` SELECT client : `USING (customer_user_id = auth.uid())`
3. `chat_messages` SELECT/INSERT client : sous-requête vérifiant que la conversation appartient à `auth.uid()`
4. `chat_agents` : réservé aux admins uniquement (`is_admin()`)

### Traductions chat (`src/i18n/translations.ts`)

Toutes les clés chat sont sous le préfixe `chat.*` (environ 40 clés, FR + AR). Exemples :
`chat.btn_label`, `chat.form_title`, `chat.searching`, `chat.waiting`, `chat.admin_title`, `chat.admin_take`, `chat.admin_end`, etc.

---

## 29. Règles pour Claude Code

**Avant toute modification :**
1. Toujours relire le fichier concerné avec Read avant de l'éditer
2. Vérifier les imports existants avant d'en ajouter
3. Comprendre les dépendances entre composants/hooks avant de refactorer

**Règles absolues :**
- Ne PAS remplacer HashRouter par BrowserRouter
- Ne PAS changer le `base` dans `vite.config.ts` sans coordination
- Ne PAS exposer les valeurs des secrets/clés dans les fichiers
- Ne PAS introduire de nouveau framework ou bibliothèque sans demande explicite
- Ne PAS remplacer Supabase par une autre solution sans demande explicite
- Ne PAS casser la bidirectionnalité FR/AR
- Ne PAS supprimer les classes `dark:` Tailwind existantes
- Ne PAS utiliser `NEXT_PUBLIC_` comme préfixe de variables d'environnement
- Ne PAS committer `.env` ou valeurs de secrets

**Lors d'ajouts :**
- Respecter les conventions de nommage existantes (PascalCase composants, camelCase hooks)
- Ajouter les traductions FR ET AR simultanément
- Ajouter les variantes dark mode pour tout nouveau composant UI
- Tester le build (`npm run build`) après modifications importantes

**En cas de doute :**
- Demander confirmation avant de modifier l'architecture
- Préférer une modification minimale à une réécriture complète
- Analyser l'existant avant de proposer une solution

---

## 30. Development Environment

### IDE Principal

**JetBrains WebStorm** (2024.x ou supérieur)

Le projet est configuré pour WebStorm :
- `.idea/` exclu du git via `.gitignore`
- `*.iml` exclu du git via `.gitignore`
- `eslint.config.js` présent à la racine (WebStorm le détecte automatiquement)
- `tsconfig.json` en racine (WebStorm l'utilise pour l'assistance TypeScript)

### Versions de référence

| Outil | Version de référence | Notes |
|---|---|---|
| Node.js | 24 (LTS) | Défini dans `.nvmrc` et GitHub Actions |
| npm | 10.x+ | Inclus avec Node 24 |
| TypeScript | ^5.5.3 | Défini dans `package.json` |
| Vite | ^5.4.1 | Build tool + dev server |
| ESLint | ^9.9.0 | Flat config (`eslint.config.js`) |

**Note :** Node.js v22 fonctionne également avec ce projet. La version 20 est la référence car c'est celle utilisée par GitHub Actions.

### Commandes de Développement

```bash
npm install        # Installer les dépendances
npm run dev        # Dev server → http://localhost:5173/nova-shop/
npm run build      # Build production → dist/
npm run preview    # Preview build → http://localhost:4173/nova-shop/
npm run lint       # ESLint (eslint.config.js flat config v9)
```

### Workflow Git → GitHub → Pages

```
WebStorm (édition code)
  ↓  Ctrl+K  (Commit)
  ↓  Ctrl+Shift+K  (Push)
GitHub (repository distant — branch main)
  ↓  déclenchement automatique
GitHub Actions (.github/workflows/deploy.yml)
  ↓  npm ci  +  npm run build  (Node 24, secrets injectés)
GitHub Pages
  ↓
https://<USERNAME>.github.io/nova-shop/
```

### État Git actuel

**⚠ Important :** Au moment de la rédaction de ce fichier, le projet n'est PAS encore initialisé comme repository git.

Pour initialiser :
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<USERNAME>/nova-shop.git
git push -u origin main
```

Depuis WebStorm : `VCS > Enable Version Control Integration > Git`

### Fichiers à ne jamais committer

| Fichier | Raison |
|---|---|
| `.env` | Contient les clés Supabase |
| `.env.local` | Couvert par pattern `*.local` dans `.gitignore` |
| `.env.production` | Variables de production |
| `node_modules/` | Dépendances installables via npm |
| `dist/` | Artefacts de build |
| `.idea/` | Configuration personnelle WebStorm |
| `*.iml` | Fichiers module JetBrains |

### Technologies

| Technologie | Rôle |
|---|---|
| React 18 | UI framework |
| TypeScript 5 | Typage statique |
| Vite 5 | Build + dev server |
| Tailwind CSS 3 | Styles |
| Supabase | BaaS (DB + Auth + Storage) |
| react-router-dom v6 | Routing (HashRouter) |

### Repository distant

- **Plateforme :** GitHub
- **Branch principale :** `main`
- **Déploiement :** GitHub Actions → GitHub Pages
- **URL production :** `https://<USERNAME>.github.io/nova-shop/`
