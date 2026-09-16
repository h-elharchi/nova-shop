# NOVA SHOP

Boutique e-commerce bilingue (Français / Arabe) pour le marché marocain.  
Prise de commande via WhatsApp ou formulaire en ligne. Administration sécurisée.

---

## 1. Présentation

NOVA SHOP est une Single Page Application statique déployée sur GitHub Pages.  
Les clients parcourent le catalogue, commandent via WhatsApp ou via un formulaire qui enregistre la commande dans Supabase. L'admin gère produits, catégories et commandes depuis un dashboard protégé par Supabase Auth.

**Pas de serveur backend custom.** Toute la logique métier côté serveur est assurée par Supabase (PostgreSQL, Auth, Storage, RLS).

---

## 2. Fonctionnalités

**Visiteur**
- Catalogue produits avec filtres (recherche, catégorie, prix, stock)
- Pages produit avec galerie d'images et vidéos
- Commande directe via formulaire (prénom, nom, téléphone marocain)
- Commande via WhatsApp avec message pré-rempli
- Bouton WhatsApp flottant sur mobile
- Chat en temps réel avec un agent (widget flottant, file d'attente, countdown 30 s)
- Interface bilingue FR / AR avec RTL complet
- Dark mode / light mode avec persistance
- Design responsive (mobile-first)

**Admin**
- Dashboard : statistiques produits et commandes
- CRUD produits : ajout, édition, activation, suppression
- Upload images et vidéos (Supabase Storage)
- CRUD catégories
- Gestion commandes : filtres avancés (statut, produit, période), changement de statut
- Export Excel des commandes filtrées
- Appel / WhatsApp direct depuis les commandes
- Interface chat temps réel : file d'attente, prise en charge, historique, toggle disponibilité

---

## 3. Architecture Générale

```
React SPA (HashRouter)
    │
    ├── Supabase Client (@supabase/supabase-js)
    │       ├── Auth          → session admin email/password + clients anonymes (signInAnonymously)
    │       ├── Database      → PostgreSQL (categories, products, orders, chat…)
    │       ├── Storage       → product-images, product-videos
    │       └── Realtime      → chat_messages, chat_conversations, chat_agents
    │
    └── WhatsApp              → lien wa.me (externe)

Build Vite → dist/ → GitHub Actions → GitHub Pages
```

---

## 4. Architecture Frontend

### Router

`HashRouter` (react-router-dom v6) — obligatoire pour GitHub Pages.  
Les URLs ont le format `https://host/nova-shop/#/products`.

### Providers (App.tsx)

```
HashRouter
  └── ThemeContext.Provider   (isDark, toggleTheme)
        └── LanguageContext.Provider  (lang, setLang, t, isRTL, dir)
              └── Routes
```

### State Management

Pas de Redux ou Zustand. Uniquement :
- React Context pour langue et thème (globaux)
- useState local dans les composants
- Hooks personnalisés pour les données Supabase

### Composants Layout

`Layout` = `Header` + `<main>` + `Footer` + `WhatsAppFloat` + `ChatButton`  
Toutes les pages publiques utilisent `Layout`. Les pages admin utilisent `AdminLayout`.

---

## 5. Architecture Supabase

### Client

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
)
```

### Services utilisés

| Service | Utilisation |
|---|---|
| Supabase Database | Toutes les données (produits, catégories, commandes, profils, chat) |
| Supabase Auth | Authentification admin (email/password) + clients chat (anonyme) |
| Supabase Storage | Images et vidéos produits |
| Supabase Realtime | Messagerie chat temps réel (messages, conversations, présence agents) |
| RLS PostgreSQL | Contrôle d'accès aux données (isolation par utilisateur pour le chat) |

---

## 6. Architecture PostgreSQL

### Diagramme des relations

```
categories (1) ──< products (N)
                      │
                      ├──< product_images (N)
                      ├──< product_videos (N)
                      └──< orders (N)

auth.users (1) ── profiles (1)
auth.users (1) ──< chat_conversations (N)   [customer_user_id — session anonyme]
chat_conversations (1) ──< chat_messages (N)
auth.users (1) ── chat_agents (1)           [user_id — admin]
```

---

## 7. Authentication

**Méthode :** Supabase Auth, email + password.

**Flux :**
```
Admin → /admin/login
      → supabase.auth.signInWithPassword({ email, password })
      → Session JWT stockée par le client Supabase
      → ProtectedRoute valide la session
      → Accès au dashboard
```

**Hook `useAuth`** (`src/hooks/useAuth.ts`) :
- `getSession()` au montage
- `onAuthStateChange()` pour écouter les changements
- Expose : `user`, `loading`, `signIn()`, `signOut()`

**ProtectedRoute** (`src/pages/Admin/ProtectedRoute.tsx`) :
- Si `loading` : spinner
- Si `!user` : redirect `/admin/login`
- Si `user` : affiche les children

---

## 8. Authorization / RLS

### Fonction helper

```sql
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;
```

### Policies par table

| Table | Visiteur | Admin |
|---|---|---|
| `categories` | SELECT WHERE is_active=true | FULL ACCESS |
| `products` | SELECT WHERE is_active=true | FULL ACCESS |
| `product_images` | SELECT (toutes) | FULL ACCESS |
| `product_videos` | À configurer | À configurer |
| `profiles` | SELECT own | SELECT all |
| `orders` | INSERT uniquement | FULL ACCESS |
| `chat_conversations` | SELECT/INSERT WHERE customer_user_id = auth.uid() | FULL ACCESS |
| `chat_messages` | SELECT/INSERT sur ses propres conversations | FULL ACCESS |
| `chat_agents` | — | FULL ACCESS |

### Créer un admin

```sql
-- 1. Créer l'utilisateur dans Supabase Auth (dashboard)
-- 2. Exécuter dans SQL Editor :
UPDATE profiles SET role = 'admin' WHERE email = 'admin@example.com';
```

---

## 9. Supabase Storage

### Buckets

| Bucket | Accès | Contenu |
|---|---|---|
| `product-images` | Public | Images produits (JPG, PNG, WebP) |
| `product-videos` | Public | Vidéos produits (MP4, MOV, WebM) |

### Path format

```
{productId}/{timestamp}-{index}.{extension}
// Exemple : 550e8400-e29b-41d4-a716-446655440000/1726401600000-0.jpg
```

### Flux upload

```typescript
// 1. Upload fichier
await supabase.storage.from('product-images').upload(path, file, { upsert: true })

// 2. Récupérer l'URL publique
const { data } = supabase.storage.from('product-images').getPublicUrl(path)

// 3. Sauvegarder l'URL en base
await supabase.from('product_images').insert({ product_id, image_url: data.publicUrl, display_order })
```

### Policies Storage recommandées

```sql
-- Lecture publique
CREATE POLICY "Public read product images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- Upload admin uniquement
CREATE POLICY "Admin upload product images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'product-images' AND is_admin());
```

---

## 10. Orders System

### Flux complet

```
Client → ProductCard ou ProductDetailsPage
       → Bouton "Commander" → OrderModal
       → Validation (prénom ≥2 cars, nom ≥2 cars, téléphone marocain)
       → useCreateOrder()
           → supabase.from('products').select() [vérification produit actif + vrai prix]
           → supabase.from('orders').insert({ status: 'new', ... })
       → Succès → message de confirmation
```

### Validation téléphone

```typescript
// src/hooks/useOrders.ts
/^(0[67]\d{8}|\+212[67]\d{8}|00212[67]\d{8})$/.test(cleaned)
```
Formats acceptés : `06XXXXXXXX`, `07XXXXXXXX`, `+2126XXXXXXXX`, `+2127XXXXXXXX`, `002126XXXXXXXX`, `002127XXXXXXXX`

### Statuts de commande

| Statut | Signification |
|---|---|
| `new` | Nouvelle commande non traitée |
| `contacted` | Admin a contacté le client |
| `confirmed` | Commande confirmée |
| `cancelled` | Commande annulée |
| `completed` | Commande livrée et terminée |

### Admin — Gestion commandes

- Filtres côté serveur : statut, recherche (nom/phone/produit), plage de dates
- Filtre côté client : produit spécifique
- Pagination : 20 commandes par page
- Export Excel via librairie `xlsx`
- Actions par commande : changer statut, appeler (`tel:`), WhatsApp direct

---

## 11. Product Management

### Champs produit

| Champ | Type | Description |
|---|---|---|
| `name_fr` / `name_ar` | TEXT | Nom FR et AR |
| `description_fr` / `description_ar` | TEXT | Description FR et AR |
| `slug` | TEXT UNIQUE | Identifiant URL (auto-généré depuis name_fr) |
| `price` | NUMERIC | Prix en MAD |
| `old_price` | NUMERIC | Ancien prix (affiche le % de réduction) |
| `category_id` | UUID FK | Catégorie parente |
| `is_active` | BOOLEAN | Visible en frontend |
| `is_featured` | BOOLEAN | Affiché dans "Populaires" |
| `is_new` | BOOLEAN | Affiché dans "Nouveautés" |
| `stock_available` | BOOLEAN | En stock |
| `display_order` | INTEGER | Ordre d'affichage |

### Slug auto-generation

```typescript
function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
// Déclenché sur changement de name_fr uniquement en mode création
```

---

## 12. Category Management

### Champs catégorie

| Champ | Type | Description |
|---|---|---|
| `name_fr` / `name_ar` | TEXT | Nom FR et AR |
| `slug` | TEXT UNIQUE | Identifiant URL |
| `image_url` | TEXT | URL image (optionnel, saisie manuelle) |
| `is_active` | BOOLEAN | Visible en frontend |

**Note :** Les images de catégories ne passent pas par Supabase Storage. L'admin saisit directement une URL.

---

## 13. WhatsApp Integration

**Fichier :** `src/lib/whatsapp.ts`

| Élément | Valeur |
|---|---|
| Numéro | `212606732531` (hardcodé) |
| API | `https://wa.me/{number}?text={encoded}` |
| Message FR | `Bonjour, je souhaite commander le produit : {nom}.` |
| Message AR | `السلام عليكم، أريد طلب المنتج: {nom}.` |

**Composants :**
- `WhatsAppButton` : bouton inline, tailles sm/md/lg, message contextuel (produit ou générique)
- `WhatsAppFloat` : bulle fixe bottom-right, mobile uniquement (`md:hidden`)

**Depuis les commandes admin :** Lien WhatsApp dynamique avec message `Bonjour {prénom}, concernant votre commande : {produit}.`

---

## 14. Excel Export

**Fichier :** `src/lib/exportExcel.ts`  
**Librairie :** `xlsx` v0.18.5

**Colonnes exportées :** ID, Date, Produit, Prix (MAD), Prénom, Nom, Téléphone, Statut

**Fonctionnalités :**
- En-têtes traduits FR/AR selon la langue active
- Auto-filter sur la ligne d'en-tête
- Première ligne figée
- Colonne téléphone forcée en texte (évite la conversion numérique Excel)
- Largeurs de colonnes définies
- Nom de fichier : `nova-shop-commandes[-{statut}]-{YYYY-MM-DD}.xlsx`
- Téléchargement direct via Blob + URL.createObjectURL

---

## 15. Système de Chat Temps Réel

### Vue d'ensemble

Le chat permet aux clients de contacter un agent admin directement depuis le site. Il est entièrement géré par Supabase (Realtime, Auth anonyme, RLS). Aucun serveur tiers n'est requis.

### Authentification client

Les clients s'authentifient via `supabase.auth.signInAnonymously()` avant d'ouvrir une conversation. Cette session est persistée dans `sessionStorage` (clé `nova-chat-session`) et permet de reprendre une conversation active après un rechargement de page.

### États du widget client

| État | Description |
|---|---|
| `idle` | Widget fermé, bouton visible |
| `form` | Formulaire prénom / nom / téléphone |
| `connecting` | Création de la conversation en cours |
| `searching` | Countdown 30 s — aucun agent en ligne |
| `waiting` | En file d'attente — agents occupés |
| `active` | Conversation ouverte avec un agent |
| `closed` | Conversation terminée par l'agent |
| `timeout` | Aucun agent disponible après 30 s |

### File d'attente et assignation

1. À la création de la conversation, `assign_to_available_admin()` tente une assignation immédiate.
2. Si des agents sont occupés : la conversation passe en `waiting` et reçoit un `queue_position`.
3. Si aucun agent n'est en ligne : countdown 30 s + souscription Realtime sur `chat_agents`. Dès qu'un agent passe `available`, assignation automatique.
4. La prise en charge par l'admin utilise `claim_conversation()` — une fonction PostgreSQL avec `FOR UPDATE SKIP LOCKED` pour éviter les race conditions quand plusieurs admins prennent la même conversation simultanément.

### Présence agent admin

Les admins qui ont la page `/admin/chat` ouverte envoient un heartbeat toutes les 20 secondes via `update_agent_heartbeat()`. La fonction `check_agents_online()` ne considère comme "en ligne" que les agents dont le `last_seen_at` date de moins de 2 minutes.

### Fichiers clés

| Fichier | Rôle |
|---|---|
| `supabase-chat.sql` | Schéma complet + RLS + fonctions PostgreSQL |
| `src/types/chat.ts` | Types TypeScript du module chat |
| `src/lib/chat.ts` | Fonctions utilitaires (auth anonyme, CRUD, RPCs) |
| `src/hooks/useChat.ts` | Machine d'état côté client |
| `src/hooks/useChatMessages.ts` | Chargement + Realtime messages |
| `src/hooks/useChatPresence.ts` | Présence admin + liste conversations |
| `src/components/chat/` | 9 composants UI (widget, messages, formulaire…) |
| `src/pages/Admin/ChatPage.tsx` | Interface admin complète |

### Sécurité RLS

- Un client ne peut **jamais** lire les conversations d'un autre client.
- Les messages ne sont accessibles qu'au client propriétaire de la conversation et aux admins.
- Les agents (`chat_agents`) ne sont visibles que par les admins.

---

## 16. Internationalisation FR/AR

**Fichier :** `src/i18n/translations.ts`

Structure de clés :
```
nav.*         → Navigation
hero.*        → Section héro
sections.*    → Titres de sections
product.*     → Labels produit
filters.*     → Labels filtres
admin.*       → Interface admin
forms.*       → Labels formulaires
contact.*     → Page contact
footer.*      → Pied de page
common.*      → Messages génériques
order.*       → Commandes
```

**Hook :** `useI18n()` → `t('clé.sous-clé')` retourne la chaîne dans la langue active

**Stockage :** `localStorage['nova-shop-lang']` = `'fr'` | `'ar'`

---

## 17. RTL

**Activation automatique** quand lang = `'ar'` :

```typescript
document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
document.documentElement.lang = lang
```

**Police arabe :** Cairo (Google Fonts), appliquée via CSS sur `[dir="rtl"]`

**Adaptations UI RTL dans les composants :**
- `flex-row-reverse` pour certains containers
- `rotate-180` pour les flèches directionnelles
- `dir="rtl"` sur les champs de formulaire arabes
- Propriété `dir={isRTL ? 'rtl' : 'ltr'}` sur le modal commande

---

## 18. Dark Mode

**Implémentation :** Classe `dark` sur `<html>` + Tailwind `darkMode: 'class'`

**Anti-flash :** Script inline dans `index.html` exécuté avant React

**Persistance :** `localStorage['nova-theme']` = `'dark'` | `'light'`

**Fallback :** `window.matchMedia('(prefers-color-scheme: dark)')` si pas de préférence stockée

**Couleurs dark custom :**
```
dark-bg:      #0F1115
dark-surface: #171A21
dark-card:    #1E222B
dark-border:  #252B38
```

---

## 19. Responsive Design

| Breakpoint Tailwind | Largeur | Utilisation |
|---|---|---|
| (base) | < 640px | Mobile, grille 2 colonnes |
| `sm:` | ≥ 640px | Ajustements modaux |
| `md:` | ≥ 768px | Sidebar admin visible, grille 4 colonnes |
| `lg:` | ≥ 1024px | Grille 3-4 colonnes produits |
| `xl:` | ≥ 1280px | Grille 4 colonnes produits |

---

## 20. Technologies Utilisées

| Technologie | Version | Utilisation |
|---|---|---|
| React | ^18.3.1 | UI framework |
| TypeScript | ^5.5.3 | Typage statique |
| Vite | ^5.4.1 | Build tool, dev server |
| Tailwind CSS | ^3.4.11 | Styles utilitaires |
| @supabase/supabase-js | ^2.45.0 | Client BaaS (DB, Auth, Storage) |
| react-router-dom | ^6.26.2 | Routing SPA (HashRouter) |
| lucide-react | ^0.441.0 | Icônes SVG |
| xlsx | ^0.18.5 | Export Excel |
| react-helmet-async | ^2.0.5 | En dépendance (non utilisé actuellement) |
| postcss | ^8.4.45 | Compilation CSS |
| autoprefixer | ^10.4.20 | Préfixes CSS cross-browser |
| Cairo (Google Fonts) | — | Police arabe |

---

## 21. APIs et Services

| API / Service | Utilisation | Authentification | Fichier(s) |
|---|---|---|---|
| Supabase Database API | CRUD produits, catégories, commandes, profils | Anon key (RLS) | `src/lib/supabase.ts`, tous les hooks |
| Supabase Auth API | Login admin, session | Email/password | `src/hooks/useAuth.ts` |
| Supabase Storage API | Upload/lecture images et vidéos | Anon key (Storage RLS) | `src/pages/Admin/ProductFormPage.tsx` |
| Supabase Realtime | Chat temps réel (messages, présence) | Anon key (RLS) | `src/hooks/useChatMessages.ts`, `src/hooks/useChatPresence.ts` |
| wa.me (WhatsApp) | Redirection WhatsApp avec message | Aucune | `src/lib/whatsapp.ts` |
| Google Fonts | Police Cairo pour l'arabe | Aucune | `index.html`, `src/index.css` |
| GitHub Actions | CI/CD build + déploiement | Secrets GitHub | `.github/workflows/deploy.yml` |
| GitHub Pages | Hébergement statique | GitHub repository | — |

---

## 22. Variables d'Environnement

**Noms des variables (ne jamais afficher les valeurs) :**

| Variable | Utilisation |
|---|---|
| `VITE_SUPABASE_URL` | URL du projet Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Clé anon publique Supabase |

**Fichier local :** `.env` (ignoré par git)  
**En production :** Secrets GitHub Actions

**⚠ Important :** Le fichier `.env.example` contient des préfixes `NEXT_PUBLIC_` incorrects. Utiliser impérativement le préfixe `VITE_` pour ce projet Vite.

**Ne jamais utiliser :** La clé `service_role` Supabase côté frontend.

---

## 23. Structure du Projet

```
nova-shop/
├── .env                              # Variables d'env locales (git-ignoré)
├── .env.example                      # ⚠ Préfixes incorrects — voir section 21
├── .gitignore
├── .github/
│   └── workflows/
│       └── deploy.yml                # CI/CD GitHub Actions
├── index.html                        # HTML entry, favicons, anti-flash dark mode
├── vite.config.ts                    # base: '/nova-shop/' (CRITIQUE)
├── tailwind.config.js                # darkMode: 'class', couleurs custom
├── tsconfig.json                     # Références tsconfig.app + tsconfig.node
├── tsconfig.app.json                 # Config TypeScript strict pour src/
├── tsconfig.node.json                # Config TypeScript pour Vite config
├── postcss.config.js                 # tailwindcss + autoprefixer
├── package.json                      # Dépendances et scripts
├── supabase-setup.sql                # SQL: categories, products, product_images, profiles, RLS
├── supabase-orders.sql               # SQL: orders, index, RLS
├── supabase-chat.sql                 # SQL: chat_conversations, chat_messages, chat_agents, RLS, fonctions
│
├── public/
│   ├── favicon.ico / .svg / .png    # Favicons multi-résolutions
│   ├── apple-touch-icon.png          # Icône iOS
│   ├── site.webmanifest              # PWA manifest
│   └── robots.txt                    # SEO
│
└── src/
    ├── main.tsx                      # Montage React
    ├── App.tsx                       # HashRouter + providers + routes
    ├── index.css                     # Tailwind + global styles RTL + dark mode
    ├── vite-env.d.ts                 # Types Vite env
    ├── types/index.ts                # Tous les types TypeScript
    ├── i18n/translations.ts          # Traductions FR + AR
    ├── context/
    │   ├── LanguageContext.ts        # Context langue + hook useI18n
    │   └── ThemeContext.ts           # Context thème + hook useThemeCtx
    ├── hooks/
    │   ├── useLanguage.ts            # Langue, RTL, traductions
    │   ├── useTheme.ts               # Dark/light mode
    │   ├── useAuth.ts                # Supabase Auth
    │   ├── useCategories.ts          # Fetch catégories actives
    │   ├── useProducts.ts            # Fetch produits avec filtres
    │   ├── useProduct.ts             # Fetch produit par slug
    │   ├── useOrders.ts              # Créer commande, lister commandes, stats
    │   ├── useChat.ts                # Machine d'état widget chat client
    │   ├── useChatMessages.ts        # Chargement + Realtime messages
    │   └── useChatPresence.ts        # Présence admin + liste conversations (Realtime)
    ├── lib/
    │   ├── supabase.ts               # Client Supabase singleton
    │   ├── whatsapp.ts               # Utilitaires WhatsApp
    │   ├── exportExcel.ts            # Export XLSX
    │   └── chat.ts                   # Auth anonyme, CRUD conversations/messages, RPCs
    ├── components/
    │   ├── layout/
    │   │   ├── Header.tsx            # Navbar + menu mobile + langue + dark mode
    │   │   ├── Footer.tsx            # Footer avec liens et contact
    │   │   └── Layout.tsx            # Wrapper public (Header+Footer+WhatsAppFloat)
    │   ├── products/
    │   │   ├── ProductCard.tsx       # Carte produit avec commande et WhatsApp
    │   │   └── ProductFiltersBar.tsx # Sidebar filtres produits
    │   ├── orders/
    │   │   ├── OrderModal.tsx        # Modal de commande
    │   │   └── OrderStatusBadge.tsx  # Badge statut coloré
    │   ├── whatsapp/
    │   │   ├── WhatsAppButton.tsx    # Bouton WhatsApp contextuel
    │   │   └── WhatsAppFloat.tsx     # Bulle flottante mobile (bottom-20 right-4)
    │   └── chat/
    │       ├── ChatButton.tsx        # Bouton flottant bleu + conteneur widget
    │       ├── ChatWidget.tsx        # Shell widget (dimensions responsives)
    │       ├── ChatHeader.tsx        # En-tête bleue avec statut et boutons
    │       ├── ChatCustomerForm.tsx  # Formulaire d'identification client
    │       ├── ChatQueueStatus.tsx   # Affichage countdown / file d'attente
    │       ├── ChatClosedMessage.tsx # Écran de fin de conversation
    │       ├── ChatMessage.tsx       # Bulle de message (customer/admin/system)
    │       ├── ChatInput.tsx         # Zone de saisie avec auto-hauteur
    │       └── ChatWindow.tsx        # Conteneur messages + input
    └── pages/
        ├── Home/index.tsx            # Accueil
        ├── Products/index.tsx        # Catalogue avec filtres
        ├── ProductDetails/index.tsx  # Détail produit + galerie + commande
        ├── Categories/index.tsx      # Grille catégories
        ├── Categories/CategoryPage.tsx # Produits par catégorie
        ├── Contact/index.tsx         # Page contact WhatsApp
        └── Admin/
            ├── LoginPage.tsx         # Connexion
            ├── ProtectedRoute.tsx    # Guard de route
            ├── AdminLayout.tsx       # Layout sidebar admin
            ├── DashboardPage.tsx     # Tableau de bord
            ├── ProductsPage.tsx      # Liste produits admin
            ├── ProductFormPage.tsx   # Formulaire produit (création/édition)
            ├── CategoriesPage.tsx    # Gestion catégories
            ├── OrdersPage.tsx        # Gestion commandes
            └── ChatPage.tsx          # Interface admin chat (file, actif, historique)
```

---

## 24. Database Schema

### Table `categories`

| Colonne | Type | Nullable | Default | Contrainte |
|---|---|---|---|---|
| id | UUID | NO | gen_random_uuid() | PK |
| name_fr | TEXT | NO | — | |
| name_ar | TEXT | NO | — | |
| slug | TEXT | NO | — | UNIQUE |
| image_url | TEXT | YES | — | |
| is_active | BOOLEAN | YES | true | |
| created_at | TIMESTAMPTZ | YES | now() | |
| updated_at | TIMESTAMPTZ | YES | now() | Trigger auto |

### Table `products`

| Colonne | Type | Nullable | Default | Contrainte |
|---|---|---|---|---|
| id | UUID | NO | gen_random_uuid() | PK |
| slug | TEXT | NO | — | UNIQUE |
| name_fr | TEXT | NO | — | |
| name_ar | TEXT | NO | — | |
| description_fr | TEXT | YES | '' | |
| description_ar | TEXT | YES | '' | |
| price | NUMERIC(10,2) | NO | — | |
| old_price | NUMERIC(10,2) | YES | — | |
| category_id | UUID | YES | — | FK → categories ON DELETE SET NULL |
| is_active | BOOLEAN | YES | true | |
| is_featured | BOOLEAN | YES | false | |
| is_new | BOOLEAN | YES | false | |
| stock_available | BOOLEAN | YES | true | |
| display_order | INTEGER | YES | 0 | |
| created_at | TIMESTAMPTZ | YES | now() | |
| updated_at | TIMESTAMPTZ | YES | now() | Trigger auto |

### Table `product_images`

| Colonne | Type | Nullable | Default | Contrainte |
|---|---|---|---|---|
| id | UUID | NO | gen_random_uuid() | PK |
| product_id | UUID | YES | — | FK → products ON DELETE CASCADE |
| image_url | TEXT | NO | — | |
| display_order | INTEGER | YES | 0 | |
| created_at | TIMESTAMPTZ | YES | now() | |

### Table `product_videos`

| Colonne | Type | Nullable | Default | Contrainte |
|---|---|---|---|---|
| id | UUID | NO | gen_random_uuid() | PK |
| product_id | UUID | YES | — | FK → products ON DELETE CASCADE |
| video_url | TEXT | NO | — | |
| display_order | INTEGER | YES | 0 | |
| created_at | TIMESTAMPTZ | YES | now() | |

### Table `profiles`

| Colonne | Type | Nullable | Default | Contrainte |
|---|---|---|---|---|
| id | UUID | NO | — | PK, FK → auth.users ON DELETE CASCADE |
| email | TEXT | YES | — | |
| role | TEXT | YES | 'user' | CHECK IN ('admin', 'user') |
| created_at | TIMESTAMPTZ | YES | now() | |

### Table `orders`

| Colonne | Type | Nullable | Default | Contrainte |
|---|---|---|---|---|
| id | UUID | NO | gen_random_uuid() | PK |
| product_id | UUID | NO | — | FK → products ON DELETE RESTRICT |
| product_name | TEXT | NO | — | |
| product_price | NUMERIC(10,2) | NO | — | |
| customer_first_name | TEXT | NO | — | |
| customer_last_name | TEXT | NO | — | |
| customer_phone | TEXT | NO | — | |
| status | TEXT | NO | 'new' | CHECK IN ('new','contacted','confirmed','cancelled','completed') |
| created_at | TIMESTAMPTZ | NO | now() | Index DESC |
| updated_at | TIMESTAMPTZ | NO | now() | Trigger auto |

**Index sur `orders` :** `product_id`, `status`, `created_at DESC`, `customer_phone`

### Table `chat_conversations`

| Colonne | Type | Nullable | Default | Contrainte |
|---|---|---|---|---|
| id | UUID | NO | gen_random_uuid() | PK |
| customer_user_id | UUID | NO | — | FK → auth.users ON DELETE CASCADE |
| customer_first_name | TEXT | NO | — | |
| customer_last_name | TEXT | NO | — | |
| customer_phone | TEXT | NO | — | |
| status | TEXT | NO | 'waiting' | CHECK IN ('waiting','active','closed','timeout') |
| assigned_admin_id | UUID | YES | — | FK → auth.users ON DELETE SET NULL |
| queue_position | INTEGER | YES | — | |
| last_message_at | TIMESTAMPTZ | YES | — | Trigger auto |
| created_at | TIMESTAMPTZ | YES | now() | |
| updated_at | TIMESTAMPTZ | YES | now() | Trigger auto |

### Table `chat_messages`

| Colonne | Type | Nullable | Default | Contrainte |
|---|---|---|---|---|
| id | UUID | NO | gen_random_uuid() | PK |
| conversation_id | UUID | NO | — | FK → chat_conversations ON DELETE CASCADE |
| sender_type | TEXT | NO | — | CHECK IN ('customer','admin','system') |
| sender_id | UUID | YES | — | NULL pour les messages système |
| message | TEXT | NO | — | |
| created_at | TIMESTAMPTZ | YES | now() | |

### Table `chat_agents`

| Colonne | Type | Nullable | Default | Contrainte |
|---|---|---|---|---|
| id | UUID | NO | gen_random_uuid() | PK |
| user_id | UUID | NO | — | UNIQUE, FK → auth.users ON DELETE CASCADE |
| status | TEXT | NO | 'offline' | CHECK IN ('offline','available','busy') |
| last_seen_at | TIMESTAMPTZ | YES | now() | Heartbeat toutes les 20 s |
| created_at | TIMESTAMPTZ | YES | now() | |
| updated_at | TIMESTAMPTZ | YES | now() | Trigger auto |

---

## 25. Database Relationships

```
categories (1) ──< products (N)
  id              category_id

products (1) ──< product_images (N)
  id               product_id [CASCADE DELETE]

products (1) ──< product_videos (N)
  id               product_id [CASCADE DELETE]

products (1) ──< orders (N)
  id               product_id [RESTRICT DELETE]

auth.users (1) ── profiles (1)
  id               id [CASCADE DELETE]

auth.users (1) ──< chat_conversations (N)
  id               customer_user_id [CASCADE DELETE]

chat_conversations (1) ──< chat_messages (N)
  id                        conversation_id [CASCADE DELETE]

auth.users (1) ── chat_agents (1)
  id               user_id [CASCADE DELETE]
```

---

## 26. Installation

```bash
# 1. Cloner le projet
git clone https://github.com/<USERNAME>/nova-shop.git
cd nova-shop

# 2. Installer les dépendances
npm install

# 3. Configurer les variables d'environnement
cp .env.example .env
# Éditer .env avec les vraies valeurs VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY
```

---

## 27. Configuration Locale

### Supabase

1. Créer un projet sur [supabase.com](https://supabase.com)
2. Dans **SQL Editor**, exécuter `supabase-setup.sql`
3. Dans **SQL Editor**, exécuter `supabase-orders.sql`
4. Dans **SQL Editor**, exécuter `supabase-chat.sql`
5. Créer manuellement la table `product_videos` (voir section 24) si absente de `supabase-setup.sql`
6. Dans **Storage**, créer les buckets `product-images` et `product-videos` (Public)
7. Configurer les policies Storage (voir section 9)
8. Dans **Authentication**, activer **Anonymous Sign-ins** (requis pour le chat client)
9. Dans **Authentication > Users**, créer un utilisateur admin
10. Exécuter : `UPDATE profiles SET role = 'admin' WHERE email = 'admin@example.com';`
11. Récupérer **Project URL** et **anon key** depuis **Settings > API**

### Variables d'environnement

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...votre-anon-key...
```

---

## 28. Development

```bash
npm run dev
# Serveur disponible sur http://localhost:5173/nova-shop/
```

---

## 29. Build

```bash
npm run build
# TypeScript compile + Vite build → dist/

npm run preview
# Prévisualiser le build local
```

---

## 30. Deployment

Le déploiement est automatique via GitHub Actions sur chaque push sur `main`.

**Déploiement manuel :**
1. Push sur la branche `main`
2. GitHub Actions déclenche le workflow `deploy.yml`
3. Build avec les secrets Supabase
4. Déploiement sur GitHub Pages

**URL :** `https://<USERNAME>.github.io/nova-shop/`

---

## 31. GitHub Actions

**Fichier :** `.github/workflows/deploy.yml`

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build:
    - actions/checkout@v7
    - actions/setup-node@v7 (Node 24, cache npm)
    - npm ci
    - npm run build (avec VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY)
    - actions/configure-pages@v6
    - actions/upload-pages-artifact@v5 (path: ./dist)

  deploy:
    - actions/deploy-pages@v5
```

---

## 32. GitHub Pages

**Configuration requise dans GitHub :**
- Settings > Pages > Source : **GitHub Actions**
- Settings > Secrets and variables > Actions > Secrets :
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`

**Config Vite :** `base: '/nova-shop/'` dans `vite.config.ts`

**PWA manifest :** `start_url: '/nova-shop/'` dans `public/site.webmanifest`

**Routing :** HashRouter (nécessaire — GitHub Pages ne supporte pas la réécriture d'URL pour SPA)

---

## 33. Security

### Points forts
- RLS activée sur toutes les tables
- Clé `service_role` jamais exposée (anon key uniquement)
- Protection admin via Supabase Auth
- `SECURITY DEFINER` sur les fonctions PostgreSQL
- Validation téléphone marocain côté client
- Variables d'environnement exclues du git

### Points d'attention

| Point | Risque | Recommandation |
|---|---|---|
| `ProtectedRoute` ne vérifie pas le rôle admin | Accès dashboard par user non-admin | Ajouter vérification rôle dans ProtectedRoute |
| Numéro WhatsApp hardcodé | Modification nécessite un redéploiement | Passer en variable d'environnement |
| `.env.example` avec mauvais préfixes | Confusion lors de l'installation | Corriger les préfixes NEXT_PUBLIC_ → VITE_ |
| `product_videos` absente de `supabase-setup.sql` | Erreurs si la table n'existe pas | Ajouter le SQL de création |
| `react-helmet-async` non utilisé | Bundle légèrement plus lourd | Supprimer ou utiliser pour le SEO |

---

## 34. Troubleshooting

**Page blanche après déploiement GitHub Pages**
→ Vérifier que `base: '/nova-shop/'` est dans `vite.config.ts`  
→ Vérifier que GitHub Pages est configuré sur "GitHub Actions"

**Erreur "Missing Supabase environment variables"**
→ Le fichier `.env` n'existe pas ou les variables ne sont pas définies  
→ Vérifier le préfixe : `VITE_SUPABASE_URL` (pas `NEXT_PUBLIC_`)

**Admin ne peut pas se connecter**
→ Vérifier que l'utilisateur existe dans Supabase Auth  
→ Vérifier que le profil a `role = 'admin'`

**Images non affichées**
→ Vérifier que le bucket `product-images` est public  
→ Vérifier les policies Storage

**Navigation directe `/nova-shop/products` retourne 404**
→ Normal — GitHub Pages ne supporte pas les SPA sans HashRouter  
→ S'assurer que HashRouter est utilisé (pas BrowserRouter)

**Vidéos non gérées**
→ Vérifier que la table `product_videos` a été créée dans Supabase  
→ Vérifier que le bucket `product-videos` existe

---

## 35. Known Limitations

- Pas de recherche full-text avancée (utilise `ilike` sur name_fr et name_ar)
- Pas de système de paiement en ligne
- Pas de gestion de stock quantitatif (seulement disponible/indisponible)
- Export Excel charge toutes les commandes filtrées en mémoire
- Numéro WhatsApp hardcodé dans le code source
- `ProtectedRoute` ne vérifie pas le rôle admin
- Copyright année statique (`2024`) dans les traductions
- `product_videos` absent du script SQL de setup
- Session chat perdue à la fermeture de l'onglet (sessionStorage)
- Si l'admin ferme l'onglet sans cliquer "Hors ligne", le statut reste actif jusqu'à expiration 2 min

---

## 36. Future Improvements

- Ajouter `product_videos` dans `supabase-setup.sql`
- Corriger `.env.example` (VITE_ au lieu de NEXT_PUBLIC_)
- Vérification du rôle admin dans `ProtectedRoute`
- Numéro WhatsApp en variable d'environnement (`VITE_WHATSAPP_NUMBER`)
- Meta OG dynamiques par produit (via `react-helmet-async`)
- Notifications sonores/badge onglet pour nouvelles conversations en attente
- Pagination côté serveur pour les produits
- Gestion de stock quantitatif
- Système de favoris côté client
- Statistiques de ventes avancées dans le dashboard
- Transfert de conversation entre agents admin
- Pièces jointes dans le chat (images depuis le catalogue)
- Évaluation client à la fermeture de conversation

---

## 37. Development with WebStorm

### Prérequis

| Outil | Version recommandée | Notes |
|---|---|---|
| JetBrains WebStorm | 2024.x ou supérieur | IDE principal |
| Node.js | 24.x (LTS) | Aligné avec GitHub Actions |
| npm | 10.x ou supérieur | Inclus avec Node.js 24 |
| Git | Toute version récente | Contrôle de version |

**Fichier `.nvmrc` :** `24` (version de référence GitHub Actions)

---

### 1. Ouvrir le projet dans WebStorm

1. Lancer WebStorm
2. `File > Open...`
3. Sélectionner le dossier racine `nova-shop/`
4. WebStorm détecte automatiquement : TypeScript, Vite, npm, ESLint

Le dossier `.idea/` est créé automatiquement par WebStorm et est exclu du git via `.gitignore`.

---

### 2. Configurer Node.js dans WebStorm

1. `File > Settings > Languages & Frameworks > Node.js`
2. **Node interpreter** : sélectionner l'installation Node.js 20 (ou 22)
3. Cocher **Coding assistance for Node.js** si disponible
4. `Apply > OK`

---

### 3. Configurer npm dans WebStorm

1. `File > Settings > Languages & Frameworks > Node.js`
2. **Package manager** : `npm`
3. Les scripts `package.json` sont automatiquement détectés dans le panneau **npm** (`View > Tool Windows > npm`)

---

### 4. Installer les dépendances

Depuis le **Terminal intégré** (`Alt+F12`) :

```bash
npm install
```

Ou depuis le panneau **npm** : double-cliquer sur `install`.

---

### 5. Configurer les variables d'environnement

```bash
cp .env.example .env
```

Éditer `.env` et renseigner :

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...votre-anon-key...
```

> Le fichier `.env` est dans `.gitignore` — il ne sera jamais commité.

---

### 6. Lancer le serveur de développement

Depuis le terminal intégré :

```bash
npm run dev
```

Ou depuis le panneau **npm** : double-cliquer sur `dev`.

**URL locale :** `http://localhost:5173/nova-shop/`

WebStorm propose d'ouvrir l'URL automatiquement dans le navigateur intégré.

---

### 7. Commandes disponibles

| Commande | Description |
|---|---|
| `npm run dev` | Serveur de développement (port 5173) |
| `npm run build` | Compilation TypeScript + build Vite → `dist/` |
| `npm run preview` | Prévisualisation du build `dist/` en local |
| `npm run lint` | Analyse ESLint sur tout le projet |

---

### 8. TypeScript dans WebStorm

WebStorm lit automatiquement `tsconfig.json` (qui référence `tsconfig.app.json` et `tsconfig.node.json`).

- **Mode strict** activé — les erreurs TypeScript sont signalées en temps réel
- **Module resolution** : `bundler` — WebStorm comprend les imports `.tsx` sans extension
- Pas d'alias `@/` — tous les imports sont des chemins relatifs
- Le service TypeScript de WebStorm est indépendant de `tsc` — les deux doivent être cohérents

---

### 9. ESLint dans WebStorm

Le fichier `eslint.config.js` est présent à la racine (ESLint v9, flat config).

1. `File > Settings > Languages & Frameworks > JavaScript > Code Quality Tools > ESLint`
2. Sélectionner **Automatic ESLint configuration**
3. WebStorm détecte `eslint.config.js` automatiquement
4. Cocher **Run eslint --fix on save** (optionnel)

---

### 10. Workflow Git depuis WebStorm

#### Initialisation du repository (première fois)

Le projet n'a pas encore de repository git. Pour l'initialiser :

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<USERNAME>/nova-shop.git
git push -u origin main
```

Ou depuis WebStorm : `VCS > Enable Version Control Integration > Git`

#### Workflow quotidien

```
WebStorm
  ↓ (modifier le code)
Git Commit    →  Ctrl+K  (ou VCS > Commit)
  ↓ (saisir message de commit)
Git Push      →  Ctrl+Shift+K  (ou VCS > Git > Push)
  ↓
GitHub (repository distant)
  ↓ (push sur branch main déclenche)
GitHub Actions
  ↓ npm ci
  ↓ npm run build  (avec VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY)
  ↓
GitHub Pages
  ↓
https://<USERNAME>.github.io/nova-shop/
```

#### Raccourcis Git WebStorm

| Action | Raccourci Windows |
|---|---|
| Commit | `Ctrl + K` |
| Push | `Ctrl + Shift + K` |
| Pull | `Ctrl + T` |
| Historique Git | `Alt + 9` (panneau Git) |
| Diff fichier | `Ctrl + D` |
| Revert fichier | `Ctrl + Alt + Z` |

---

### 11. Configurer GitHub dans WebStorm

Pour utiliser les fonctionnalités GitHub avancées (PR, issues) :

1. `File > Settings > Version Control > GitHub`
2. Cliquer **Add account**
3. Choisir **Log In via GitHub** (OAuth)
4. S'authentifier dans le navigateur

---

### 12. Configurer les Secrets GitHub Actions

Les secrets Supabase doivent être configurés dans GitHub, pas dans WebStorm :

1. Aller sur `github.com/<USERNAME>/nova-shop`
2. `Settings > Secrets and variables > Actions`
3. Ajouter :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`

---

### 13. Récupérer les changements depuis GitHub

```bash
git pull
```

Ou depuis WebStorm : `Ctrl + T` (Update Project)

---

### 14. Build et Preview locaux

```bash
npm run build
npm run preview
```

**URL preview :** `http://localhost:4173/nova-shop/`

Le build local simule exactement ce que GitHub Actions produit.

---

### 15. Fichiers exclus du repository

Vérification que les fichiers sensibles ne sont jamais commités :

| Fichier | Exclu par |
|---|---|
| `.env` | `.gitignore` |
| `.env.local` | `.gitignore` (pattern `*.local`) |
| `.env.production` | `.gitignore` |
| `node_modules/` | `.gitignore` |
| `dist/` | `.gitignore` |
| `.idea/` | `.gitignore` |
| `*.iml` | `.gitignore` |

> **Règle absolue :** Ne jamais commiter `.env` ni aucune valeur de clé Supabase.

---

### 16. Troubleshooting WebStorm

**"Cannot find module" dans WebStorm mais le build passe**  
→ `File > Invalidate Caches > Invalidate and Restart`

**ESLint ne fonctionne pas**  
→ Vérifier que `eslint.config.js` est présent à la racine  
→ `Settings > ESLint > Automatic ESLint configuration`

**TypeScript errors dans WebStorm mais pas dans `tsc`**  
→ Vérifier la version TypeScript utilisée : `Settings > TypeScript > TypeScript version` → sélectionner celle de `node_modules`

**npm scripts non détectés**  
→ `File > Settings > Node.js` → vérifier que l'interpréteur Node.js est bien configuré  
→ Cliquer sur le bouton Refresh dans le panneau npm

**Le dossier `.idea/` apparaît dans Git**  
→ Vérifier que `.gitignore` contient `.idea/` — déjà présent dans ce projet
