Tu es un développeur Full-Stack senior. Je veux que tu développes une plateforme e-commerce moderne appelée **NOVA SHOP**.

## 1. CONTRAINTE PRINCIPALE

Je veux utiliser uniquement :

- **GitHub** pour le repository, le code source et GitHub Pages
- **Supabase** pour la base de données, l'authentification et le stockage des images

Je ne veux PAS utiliser :

- Vercel
- Netlify
- Firebase
- AWS
- un autre service backend
- un autre service de hosting

Le projet doit être compatible avec **GitHub Pages**.

---

# 2. STACK TECHNIQUE

Utilise :

- React
- Vite
- TypeScript
- Tailwind CSS
- Supabase
- React Router si nécessaire

Évite les dépendances inutiles.

Le projet doit être moderne, propre, modulaire et facilement maintenable.

Le code doit être TypeScript strict autant que possible.

---

# 3. OBJECTIF

NOVA SHOP est une boutique en ligne destinée principalement au marché marocain.

La boutique est généraliste.

Je dois pouvoir vendre différents types de produits :

- Maison
- Automobile
- Accessoires
- Gadgets
- Lifestyle
- etc.

Je ne veux donc PAS créer une architecture limitée à une seule catégorie.

Les visiteurs consultent les produits et passent leur commande directement via WhatsApp.

Numéro WhatsApp :

**+212606732531**

Il n'y aura PAS de paiement en ligne dans cette première version.

---

# 4. LANGUES

Le site doit être entièrement bilingue :

🇫🇷 Français  
🇲🇦 العربية

L'utilisateur doit pouvoir changer de langue depuis le header.

Afficher :

**FR | العربية**

Le choix de langue doit être conservé dans le navigateur.

La version arabe doit être réellement RTL :

```text
direction: rtl
```

La version française :

```text
direction: ltr
```

Tous les composants doivent supporter correctement RTL :

- Header
- Navigation
- Cards
- Boutons
- Formulaires
- Dashboard
- Tables
- Modals
- Footer
- Menus
- Pagination

Ne pas simplement traduire les textes : l'interface doit être visuellement adaptée au RTL.

---

# 5. DESIGN

Je veux une interface :

- moderne
- professionnelle
- élégante
- minimaliste
- responsive
- mobile-first
- rapide

La majorité des visiteurs viendront de Facebook et Instagram depuis leur smartphone.

Brand :

**NOVA SHOP**

Slogan français :

**Des produits utiles au meilleur prix**

Slogan arabe :

**منتجات مفيدة بأثمنة مناسبة**

Créer une identité visuelle cohérente.

Utiliser des composants réutilisables.

---

# 6. SITE PUBLIC

Créer les pages suivantes :

```text
/
 /products
 /products/:slug
 /categories/:slug
 /contact
```

## Homepage

La homepage doit contenir :

### Header

- Logo NOVA SHOP
- Accueil
- Produits
- Catégories
- Contact
- FR / العربية
- bouton WhatsApp

Sur mobile :

- hamburger menu
- navigation adaptée au mobile

### Hero

Français :

**Découvrez nos produits**

Des produits sélectionnés pour vous, au meilleur rapport qualité/prix.

Bouton :

**Découvrir les produits**

Arabe :

**اكتشف منتجاتنا**

منتجات مختارة بعناية وبأثمنة مناسبة.

Bouton :

**اكتشف المنتجات**

### Sections

Ajouter :

- Nouveautés
- Produits populaires
- Catégories
- Pourquoi NOVA SHOP ?
- Livraison partout au Maroc
- Commande facile via WhatsApp

---

# 7. CATALOGUE PRODUITS

Créer une page `/products`.

Afficher les produits sous forme de cartes modernes.

Chaque carte doit afficher :

- image principale
- nom
- prix
- ancien prix si disponible
- réduction si disponible
- catégorie
- badge "Nouveau" si nécessaire
- badge "Populaire" si nécessaire
- disponibilité
- bouton "Commander sur WhatsApp"

Ajouter :

- recherche
- filtre par catégorie
- tri par prix
- filtre disponibilité

Les produits doivent être récupérés depuis Supabase.

NE PAS hardcoder les produits dans le frontend.

---

# 8. PAGE PRODUIT

Créer :

```text
/products/:slug
```

Afficher :

- galerie d'images
- nom FR/AR
- description FR/AR
- prix
- ancien prix
- réduction
- disponibilité
- catégorie
- bouton WhatsApp

Le bouton WhatsApp doit générer automatiquement un message.

Français :

"Bonjour, je souhaite commander le produit : [NOM DU PRODUIT]."

Arabe :

"السلام عليكم، أريد طلب المنتج: [اسم المنتج]."

Utiliser :

```text
https://wa.me/212606732531
```

Encoder correctement le message dans l'URL.

---

# 9. BOUTON WHATSAPP

Créer un composant réutilisable :

```text
WhatsAppButton
```

Il doit être utilisé :

- Header
- Product cards
- Product details
- Footer
- Floating button mobile

Le bouton doit ouvrir WhatsApp dans un nouvel onglet ou l'application WhatsApp sur mobile.

---

# 10. ADMIN DASHBOARD

Créer une interface d'administration :

```text
/admin/login
/admin
/admin/products
/admin/products/new
/admin/products/:id/edit
/admin/categories
```

L'admin doit pouvoir gérer complètement les produits.

---

# 11. AUTHENTIFICATION ADMIN

Utiliser exclusivement :

**Supabase Authentication**

Login :

- email
- password

Créer une protection des routes admin.

Un visiteur non authentifié ne doit jamais accéder au dashboard.

Si un utilisateur non connecté tente d'accéder à :

```text
/admin
```

il doit être redirigé vers :

```text
/admin/login
```

Prévoir :

- Login
- Logout
- Session persistence
- Protected routes

Ne jamais mettre d'identifiants admin dans le code.

---

# 12. DASHBOARD

Créer un dashboard moderne avec sidebar.

Sidebar :

```text
Dashboard
Produits
Ajouter un produit
Catégories
Paramètres
Déconnexion
```

Dashboard principal :

Afficher :

- nombre total de produits
- produits actifs
- produits inactifs
- produits populaires
- nouveautés
- nombre de catégories

Ajouter éventuellement quelques statistiques simples.

---

# 13. CRUD PRODUITS

L'admin doit pouvoir :

### Ajouter

Champs :

- Nom français
- Nom arabe
- Description française
- Description arabe
- Prix
- Ancien prix
- Catégorie
- Disponibilité
- Produit actif/inactif
- Produit populaire
- Nouveau produit
- Images
- Ordre d'affichage

### Modifier

L'admin doit pouvoir modifier tous les champs.

### Supprimer

Afficher une confirmation avant suppression.

### Activer / désactiver

Permettre de désactiver un produit sans le supprimer.

---

# 14. GESTION DES IMAGES

Utiliser :

**Supabase Storage**

Créer un bucket :

```text
product-images
```

L'admin doit pouvoir :

- uploader plusieurs images
- supprimer une image
- définir l'ordre des images
- choisir l'image principale

Optimiser les images avant affichage lorsque possible.

---

# 15. CATÉGORIES

Créer un CRUD catégories.

Champs :

```text
id
name_fr
name_ar
slug
image_url
is_active
created_at
updated_at
```

L'admin doit pouvoir :

- créer
- modifier
- supprimer
- activer/désactiver

---

# 16. BASE DE DONNÉES SUPABASE

Créer au minimum les tables suivantes.

## products

```text
id
slug
name_fr
name_ar
description_fr
description_ar
price
old_price
category_id
is_active
is_featured
is_new
stock_available
display_order
created_at
updated_at
```

## product_images

```text
id
product_id
image_url
display_order
created_at
```

## categories

```text
id
name_fr
name_ar
slug
image_url
is_active
created_at
updated_at
```

Utiliser les relations PostgreSQL appropriées.

---

# 17. SUPABASE RLS

Configurer correctement Row Level Security.

### Public

Les visiteurs peuvent :

- consulter les catégories actives
- consulter les produits actifs
- consulter les images des produits

### Admin

Seuls les utilisateurs authentifiés autorisés doivent pouvoir :

- créer des produits
- modifier des produits
- supprimer des produits
- créer/modifier/supprimer des catégories
- gérer les images

Ne jamais désactiver RLS simplement pour simplifier le développement.

---

# 18. ADMIN ROLE

Prévoir une solution propre pour distinguer les admins des utilisateurs normaux.

Ne pas considérer simplement "être connecté" comme suffisant si cela permet à n'importe quel utilisateur de modifier les produits.

Proposer une approche Supabase sécurisée pour gérer le rôle admin.

Par exemple avec une table :

```text
profiles
```

ou une autre solution adaptée à Supabase.

Documenter cette approche dans le README.

---

# 19. VARIABLES D'ENVIRONNEMENT

Créer :

```text
.env.example
```

avec uniquement les variables nécessaires.

Par exemple :

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Ne jamais mettre de secret dans GitHub.

Ne jamais utiliser la Service Role Key dans le frontend.

---

# 20. GITHUB PAGES

Le projet doit être déployable sur GitHub Pages.

Configurer Vite correctement pour GitHub Pages.

Le repository sera probablement :

```text
nova-shop
```

Prévoir une configuration compatible avec une URL du type :

```text
https://USERNAME.github.io/nova-shop/
```

Configurer correctement :

- `base` dans Vite
- React Router / routing
- assets
- refresh/navigation

Éviter les problèmes de routes sur GitHub Pages.

Si nécessaire, utiliser une stratégie de routing compatible avec un hébergement statique.

---

# 21. GITHUB ACTIONS

Configurer GitHub Actions pour automatiser le build et le déploiement vers GitHub Pages.

Créer par exemple :

```text
.github/workflows/deploy.yml
```

Le workflow doit :

1. récupérer le code
2. installer les dépendances
3. lancer le build
4. déployer automatiquement sur GitHub Pages

Documenter la configuration nécessaire dans le README.

---

# 22. SEO

Préparer le site pour :

- Google
- Facebook
- Instagram
- WhatsApp

Ajouter :

- title
- meta description
- Open Graph
- favicon
- robots.txt
- sitemap si possible
- URLs avec slug

Les pages produits doivent avoir des titres et descriptions dynamiques.

---

# 23. RESPONSIVE

Le site doit être testé pour :

- smartphone
- tablette
- desktop

Priorité absolue au mobile.

Les boutons WhatsApp doivent être facilement accessibles sur mobile.

---

# 24. PERFORMANCE

Optimiser :

- images
- lazy loading
- bundle JavaScript
- composants React
- requêtes Supabase
- rendering

Ne pas charger inutilement toutes les images ou tous les produits.

---

# 25. STRUCTURE DU PROJET

Proposer une architecture similaire à :

```text
nova-shop/
│
├── public/
│
├── src/
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   ├── products/
│   │   ├── admin/
│   │   └── whatsapp/
│   │
│   ├── pages/
│   │   ├── Home/
│   │   ├── Products/
│   │   ├── ProductDetails/
│   │   ├── Categories/
│   │   ├── Contact/
│   │   └── Admin/
│   │
│   ├── hooks/
│   ├── lib/
│   │   ├── supabase.ts
│   │   └── whatsapp.ts
│   │
│   ├── services/
│   │   ├── products.ts
│   │   └── categories.ts
│   │
│   ├── types/
│   ├── i18n/
│   ├── App.tsx
│   └── main.tsx
│
├── .env.example
├── .gitignore
├── package.json
├── vite.config.ts
├── README.md
└── .github/
    └── workflows/
        └── deploy.yml
```

Tu peux modifier cette structure si une meilleure architecture est nécessaire.

---

# 26. DONNÉES DE TEST

Créer quelques produits de démonstration.

Exemples :

- Support téléphone voiture
- Lampe LED
- Organisateur maison
- Accessoire cuisine
- Gadget automobile

Créer également quelques catégories.

Mais les données doivent être insérées dans Supabase et non hardcodées dans les composants React.

---

# 27. IMPORTANT — PAS DE BACKEND PERSONNEL

Je veux explicitement :

```text
React/Vite
     ↓
Supabase
```

Pas de :

```text
React
 ↓
Node.js backend
 ↓
Database
```

Pas de serveur Node.js séparé.

Supabase doit fournir :

- Database
- API
- Auth
- Storage

---

# 28. TESTS ET QUALITÉ

Avant de considérer le projet terminé :

Exécuter :

```bash
npm install
npm run build
```

Corriger toutes les erreurs.

Vérifier :

- TypeScript
- routes
- responsive
- authentification
- CRUD
- upload images
- Supabase queries
- RTL
- WhatsApp
- GitHub Pages

---

# 29. README

Créer un README complet expliquant :

### Installation

```bash
npm install
npm run dev
```

### Supabase

Expliquer :

1. création du projet Supabase
2. création des tables
3. exécution du SQL
4. création du Storage bucket
5. configuration RLS
6. création du compte admin
7. configuration des variables d'environnement

### GitHub

Expliquer :

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin ...
git push -u origin main
```

### GitHub Pages

Expliquer comment :

- activer GitHub Pages
- configurer GitHub Actions
- vérifier le deployment
- récupérer l'URL publique

---

# 30. MÉTHODE DE TRAVAIL

Ne génère pas seulement un plan.

Je veux que tu travailles directement sur le projet.

Avant de coder :

1. inspecte les fichiers existants du projet
2. vérifie les versions disponibles
3. propose brièvement l'architecture
4. puis implémente-la

Pendant le développement :

- privilégie des composants réutilisables
- évite la duplication
- garde le code simple
- ne mets aucun secret dans le repository
- n'utilise aucun service payant
- n'ajoute pas de dépendances sans raison

À chaque étape importante, vérifie que le projet continue à compiler.

À la fin :

1. exécute le build
2. corrige les erreurs
3. vérifie la structure du projet
4. donne-moi les fichiers créés/modifiés
5. donne-moi les étapes restantes pour connecter mon projet Supabase
6. donne-moi les étapes pour déployer sur GitHub Pages.

## OBJECTIF FINAL

Je veux obtenir :

```text
                 GITHUB
                    │
              GitHub Pages
                    │
                    ▼
              NOVA SHOP
                    │
                    ▼
                SUPABASE
          ┌─────────┼─────────┐
          │         │         │
       Database    Auth     Storage
          │         │         │
          ▼         ▼         ▼
       Products   Admin    Product Images

                    │
                    ▼
              WhatsApp
          +212606732531
```

Le résultat doit être un **MVP e-commerce réellement fonctionnel**, bilingue français/arabe, avec catalogue produits, commande WhatsApp et dashboard admin permettant de gérer les produits et catégories.