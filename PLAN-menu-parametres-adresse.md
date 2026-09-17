# PLAN — Menu admin, Paramètres, Adresse livraison, CRUD clients

## Diagnostic

### AdminLayout.tsx (état actuel)
- 12 items dans un tableau plat sans groupes
- Deux items Settings identiques (`email-settings` + `crc-settings`)
- `products/new` dans le menu (doublon — bouton "+" déjà dans ProductsPage)
- Pas de mode icon-only, pas de groupes collapsibles

### Commandes (état actuel)
- `Order` type : pas de `customer_email`, `delivery_city`, `delivery_address`, `delivery_district`, `delivery_landmark`
- `create_order_admin` RPC : pas de ces paramètres
- `OrderModal.tsx` (public) : seulement prénom/nom/téléphone
- `OrderCreateModal.tsx` (staff) : canal/téléphone/prénom/nom/produit/notes/rappel

### Clients (état actuel)
- `archiveCustomer`, `restoreCustomer`, `deleteCustomer` dans `useCustomers.ts` : RPC errors silencieuses (retournent `false` sans exposer le message d'erreur)
- `CustomerDetailModal` : aucun affichage d'erreur en cas d'échec
- `archive_customer` SQL : bloque si interactions ouvertes et non admin → exception SQL → perdue en frontend

---

## Décisions de conception

### Partie 1 — Menu admin
- `src/config/adminNavigation.ts` : groupes + items
- Groupes : **Activité** (workspace, orders, history, customers) | **Catalogue** (products, categories) | **Admin** (supervision, users, settings)
- Mode icon-only : bouton « ← » en pied de sidebar, état `nova-sidebar-compact` en localStorage
- Supprimer `products/new` (bouton "+" déjà dans ProductsPage.tsx)
- Supprimer `email-settings` (migré dans `/admin/settings/email`)
- Renommer `crc-settings` → `settings` → `/admin/settings`
- Conserver le comportement mobile drawer existant

### Partie 2 — SettingsPage
- Route `/admin/settings/:section` (admin uniquement)
- `/admin/settings` → redirect `/admin/settings/general`
- 9 sections : `general` | `email` | `distribution` | `pause` | `qualification` | `quick_replies` | `orders` | `customers` | `notifications`
- Migrer contenu CRCSettingsPage + EmailSettingsPage dans SettingsPage
- Redirections : `/admin/crc-settings` → `/admin/settings/pause` | `/admin/email-settings` → `/admin/settings/email`
- Supprimer CRCSettingsPage.tsx et EmailSettingsPage.tsx
- La section `general` lit/écrit les clés crc_settings : `shop_name`, `contact_email`, `whatsapp_number`
- La détection OAuth callback (hash params) est migrée dans la section `email`

### Partie 3 — Adresse commandes
- `supabase-orders-address.sql` : ADD COLUMN IF NOT EXISTS (5 colonnes)
- DROP FUNCTION create_order_admin avant CREATE OR REPLACE (signature change)
- Pas de RPC create_web_order — INSERT direct dans useCreateOrder avec les nouveaux champs
- `src/lib/moroccanCities.ts` : ~50 villes (datalist)
- Champs du formulaire public : email (optionnel), ville (obligatoire), adresse (obligatoire), quartier + repère (optionnels)
- Champs formulaire staff : identiques
- City picker : `<input list>` + datalist (accessible, mobile-friendly)

### Partie 4 — Visibilité adresses
- Filtre "ville" dans OrdersPage (ilike via useOrders)
- Afficher la ville + adresse dans la card d'ordre
- Export Excel : +email, +ville, +adresse
- Pas de modal séparé pour détail livraison

### Partie 5 — CRUD clients
- `diagnostic-customers.sql` : SELECT + inspection uniquement
- `useCustomers.ts` : ajouter `opError` + exposer dans `archiveCustomer`/`restoreCustomer`/`deleteCustomer` (return `{ ok, error }`)
- `CustomersPage.tsx` : afficher l'erreur dans les modals + inline

---

## Progression

- [x] Partie 1 : Menu admin
- [x] Partie 2 : SettingsPage
- [x] Partie 3 : SQL + formulaires commandes
- [x] Partie 4 : Visibilité adresses
- [x] Partie 5 : CRUD clients + diagnostic SQL
- [x] Build propre + commit
