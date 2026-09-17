# PLAN — NOVA SHOP Multicanal (Workspace Agent + Gestion Contacts)

> Document vivant — mis à jour à chaque lot. Dernière MAJ : Lot 1.

---

## 0. Résumé exécutif

### Situation actuelle
- Chat CRC : file d'attente, capacité, wrap-up, transfert — **fonctionnel**
- Email Gmail : inbox, thread, réponse via Edge Functions — **fonctionnel**
- Rappels (callbacks) : colonne `callback_at` dans `orders`, aucun workflow dédié — **manquant**
- Base clients : table `customers` basique (phone UNIQUE, source, notes) — **partiel**
- Distribution : FIFO uniquement pour le chat, aucune pour email/callbacks — **partiel**

### Ce qui change
1. **Table `interactions`** pivot unifiée (chat + email + callback)
2. **Moteur `route_interactions()`** unique remplace la logique de distribution chat
3. **Workspace Agent** (`/admin/workspace`) remplace `/admin/chat` + `/admin/email`
4. **Gestion contacts** complète (archive, restauration, anonymisation, adresses)
5. **Formulaire chat + rappel** : ajout champ email
6. **Page Contact + Footer** : email `hel.nova.shop@gmail.com`

---

## 1. Décisions d'architecture

| Point | Choix | Raison |
|---|---|---|
| Table pivot | `interactions` liée à chat_conversations, email_threads, callback_requests | Evite de dupliquer les statuts dans chaque canal |
| Email threads | Nouvelle table `email_threads` (1 ligne par gmail_thread_id) | Distingue le fil (permanentement) de l'interaction (éphémère par demande) |
| Numérotation | Séquence PostgreSQL → `INT-2026-000001` | Lisible par l'agent et le client |
| Distribution | Fonction `route_interactions()` SQL + pg_cron 1 min | Atomique, pas de race condition |
| Assignation chat | Mode "proposition" (offer→accept/reject) configurable | Conserve le comportement attendu par les agents |
| Assignation email | Mode "directe" — apparaît dans "Mes interactions" immédiatement | Email ne requiert pas d'acceptation immédiate |
| Assignation callback | Mode "directe" quand `due_at` ≤ now() | Similaire à email |
| Capacité agent | Table `agent_channel_capacity` avec valeurs par défaut globales | Permet spécialisation par agent |
| Workspace Agent | Route `/admin/workspace`, redirection des anciennes routes | Migration transparente |
| Status clients | Enum `active \| archived \| blocked \| merged \| anonymized` + `version` INT | Contrôle concurrence optimiste |
| Suppression | Soft-delete (archived) + anonymisation SQL atomique | Pas de DELETE direct autorisé via API |
| Adresses clients | Table `customer_addresses` liée par FK | 1 client = N adresses, 1 défaut |

---

## 2. Modèle de données cible

### Nouvelles tables

```
interactions
├── id UUID PK
├── interaction_number TEXT UNIQUE (INT-2026-000001)
├── channel TEXT CHECK('chat','email','callback')
├── origin_channel TEXT (website_chat, website_contact, email, phone…)
├── customer_id UUID FK customers
├── subject TEXT
├── priority INT DEFAULT 0
├── status TEXT CHECK(queued,offered,assigned,active,pending_customer,
│                      scheduled,wrap_up,closed,abandoned,timeout,failed)
├── queued_at TIMESTAMPTZ
├── due_at TIMESTAMPTZ        -- null=maintenant, future=rappel programmé
├── offered_to UUID FK auth.users  -- agent à qui la proposition est faite
├── offered_at TIMESTAMPTZ
├── offer_expires_at TIMESTAMPTZ
├── assigned_agent_id UUID FK auth.users
├── assigned_at TIMESTAMPTZ
├── first_response_at TIMESTAMPTZ
├── closed_at TIMESTAMPTZ
├── closed_by UUID FK auth.users
├── outcome TEXT CHECK('treated','not_treated')
├── disposition_code_id UUID FK crc_disposition_codes
├── wrap_up_notes TEXT
├── wrap_up_started_at TIMESTAMPTZ
├── wrap_up_seconds INT
└── created_at, updated_at TIMESTAMPTZ

interaction_events
├── id UUID PK
├── interaction_id UUID FK interactions CASCADE
├── event_type TEXT  (created,queued,offered,accepted,rejected,assigned,
│                     message_in,message_out,call_attempt,transferred,
│                     rescheduled,status_changed,customer_modified,
│                     order_created,closed,abandoned,timeout)
├── actor_id UUID FK auth.users (null=system)
├── data JSONB  (détails libres : note transfert, ancien statut, etc.)
└── created_at TIMESTAMPTZ

email_threads
├── id UUID PK
├── gmail_thread_id TEXT UNIQUE NOT NULL
├── email_account_id UUID FK email_accounts
├── subject TEXT
├── from_address TEXT
├── last_message_at TIMESTAMPTZ
└── created_at TIMESTAMPTZ

callback_requests
├── id UUID PK
├── interaction_id UUID FK interactions
├── customer_id UUID FK customers
├── first_name, last_name, phone, email TEXT
├── city, district, address, landmark TEXT
├── message TEXT  (motif / notes client)
├── preferred_slot TEXT  (asap | scheduled)
├── preferred_datetime TIMESTAMPTZ
├── origin_conversation_id UUID FK chat_conversations
├── attempts_count INT DEFAULT 0
├── max_attempts INT DEFAULT 3
└── created_at TIMESTAMPTZ

callback_attempts
├── id UUID PK
├── callback_request_id UUID FK callback_requests CASCADE
├── agent_id UUID FK auth.users
├── attempted_at TIMESTAMPTZ
├── result TEXT CHECK(reached,no_answer,busy,voicemail,wrong_number,callback_later)
├── next_attempt_at TIMESTAMPTZ
└── comment TEXT

agent_channel_capacity
├── id UUID PK
├── agent_id UUID FK auth.users UNIQUE+channel
├── channel TEXT CHECK(chat,email,callback)
├── max_capacity INT DEFAULT 3
├── is_enabled BOOLEAN DEFAULT true
└── created_at TIMESTAMPTZ

customer_addresses
├── id UUID PK
├── customer_id UUID FK customers CASCADE
├── label TEXT  (Domicile, Travail…)
├── city, district, address, landmark TEXT
├── is_default BOOLEAN DEFAULT false
└── created_at, updated_at TIMESTAMPTZ

admin_audit_log
├── id UUID PK
├── actor_id UUID FK auth.users
├── action TEXT  (archive_customer, restore_customer, delete_customer, anonymize_customer)
├── target_type TEXT  (customer)
├── target_id UUID  (id du client — conservé même après suppression)
├── customer_number TEXT  (ex CL-000123 — conservé)
├── reason TEXT
└── created_at TIMESTAMPTZ
```

### Tables modifiées

```
interactions ajoutées dans :
  chat_conversations  → interaction_id UUID FK
  email_messages      → thread_id UUID FK email_threads
  orders              → interaction_id UUID FK (nullable)

customers étendus :
  status     TEXT DEFAULT 'active' CHECK(active,archived,blocked,merged,anonymized)
  archived_at, archived_by, archive_reason
  anonymized_at
  version    INT DEFAULT 1  (contrôle concurrence optimiste)
  customer_number TEXT UNIQUE  (CL-000001 — lisible)
  phone2, whatsapp_phone, email2, preferred_lang TEXT
  tags TEXT[]
  merged_into UUID FK customers (si statut merged)
```

---

## 3. Statuts et transitions `interactions`

```
                       ┌──────────────┐
                       │   queued     │◄──── retour_en_file()
                       └──────┬───────┘
                              │ route_interactions()
              ┌───────────────▼───────────────┐
         chat │    offered (proposition)       │ email/callback
              │  → offer_expires_at 20s        │
              └─────────┬─────────┬────────────┘
                        │ accept  │ reject/expire
                        │         └──► queued (prochain agent)
                        ▼
                    ┌───────────┐
                    │ assigned  │
                    └─────┬─────┘
                          │ premier message
                          ▼
                    ┌───────────┐
                    │  active   │◄──── message entrant
                    └─────┬─────┘
          ┌───────────────┼─────────────────┐
          ▼               ▼                 ▼
    pending_customer   scheduled         wrap_up
    (attente client)   (rappel reprog.)  (qualification)
                                              │
                              ┌───────────────┤
                              ▼               ▼
                           closed          failed
                      (treated/not_treated)
```

---

## 4. Moteur de distribution `route_interactions()`

```sql
-- Appelée par : pg_cron toutes les minutes, triggers INSERT interaction,
--               UPDATE agent status, fin de wrap_up

route_interactions()
  1. Libérer propositions expirées → queued (event: offer_expired)
  2. Pour chaque interaction WHERE status='queued' AND due_at <= now()
     ORDER BY priority DESC, queued_at ASC
     FOR UPDATE SKIP LOCKED :
       a. Trouver agent éligible :
          - status = 'available'
          - last_seen_at > now() - interval '2 minutes'
          - agent_channel_capacity(channel).is_enabled = true
          - active_on_channel < max_capacity(channel)
          - Priorité : inactif le plus longtemps sur ce canal
       b. Si trouvé ET mode=proposition (chat) :
          → status='offered', offered_to=agent_id, offer_expires_at=now()+accept_delay
       c. Si trouvé ET mode=direct (email, callback) :
          → status='assigned', assigned_agent_id, assigned_at=now()
          → INSERT interaction_event(assigned)
       d. Si aucun agent → reste en queued
  3. Réassigner callbacks reprogrammés arrivant à échéance
```

---

## 5. Capacités agent par canal

Valeurs par défaut globales (crc_settings) :
- `default_chat_capacity` : 3
- `default_email_capacity` : 5
- `default_callback_capacity` : 1

Table `agent_channel_capacity` surcharge les valeurs par agent.

---

## 6. Maquettes ASCII

### 6.1 Workspace Agent — Desktop

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [●] Disponible 00:23:41  │ Chat 2/3 · Email 1/5 · Rappel 0/1 │ [⚡ Suivant] │
├──────────────────┬──────────────────────────────┬────────────────────────┤
│  MES INTERACTIONS│                              │  FICHE CLIENT          │
│  ──────────────  │   [CHAT] Yassine Benali       │  ─────────────────     │
│  ● Chat  Yassine │   ● En ligne · 12 min        │  Yassine Benali        │
│    12 min ●NL    │   ─────────────────────────  │  +212 6XX XX XX XX     │
│  ─────────────── │   Client: "Bonjour j'ai un   │  yassine@example.com   │
│  ○ Email  Malak  │   problème avec ma commande" │                        │
│    28 min        │   Agent: "Bonjour Yassine..." │  [Modifier] [+ Adresse]│
│  ─────────────── │   ...                        │  ─────────────────     │
│  FILE D'ATTENTE  │   ─────────────────────────  │  COMMANDES (3)         │
│  ──────────────  │   [QuickReply /]  [Transférer]│  CMD-001 · 450 MAD ✓  │
│  ● Chat  Fatima  │   ─────────────────────────  │  CMD-002 · 120 MAD ⏳  │
│    8 min  [Prendre]  [__________________] [Envoyer]│  ─────────────────  │
│  ○ Email Sarah   │                              │  INTERACTIONS (5)      │
│    15 min [Prendre]  │                          │  Chat 12/09 ✓          │
│                  │                              │  Email 10/09 ✓         │
│  [Tous][Chat][Email][Rappel]                    │  [+ Commande]          │
└──────────────────┴──────────────────────────────┴────────────────────────┘
```

### 6.2 Panneau Rappel

```
┌──────────────────────────────────────────────────────┐
│  [📞 RAPPEL] Ahmed Khalil · Tentative 1/3           │
│  ─────────────────────────────────────────────────── │
│  📱 +212 6XX XX XX XX  [Copier] [WhatsApp]           │
│  📧 ahmed@example.com                                │
│  📍 Casablanca · Maârif · Rue Léon l'Africain        │
│                                                      │
│  Motif : "Je voudrais commander le produit X mais   │
│  je n'arrive pas à finaliser ma commande"            │
│                                                      │
│  Créneau : Dès que possible                         │
│  Origine : Chat du 12/09 (transcription ▼)          │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  ╔══════════════════════════════════════╗    │   │
│  │  ║ 📞 APPELER +212 6XX XX XX XX         ║    │   │
│  │  ╚══════════════════════════════════════╝    │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  Résultat de la tentative :                         │
│  ○ Atteint  ○ Pas de réponse  ○ Occupé             │
│  ○ Messagerie  ○ Mauvais numéro  ○ Rappel demandé  │
│                                                      │
│  [Enregistrer tentative]  [Reprogrammer]            │
└──────────────────────────────────────────────────────┘
```

### 6.3 Qualification (wrap-up unifié)

```
┌─────────────────────────────────────────────┐
│  QUALIFICATION — Chat Yassine               │
│  Durée : 8 min 32s                          │
│  ─────────────────────────────────────────  │
│  Résultat * :                               │
│  ● Traitée   ○ Non traitée                 │
│                                             │
│  Code * :                                   │
│  [▼ Commande passée                    ]   │
│                                             │
│  Notes :                                    │
│  [________________________________________] │
│  [________________________________________] │
│                                             │
│  Suite (si non traitée) :                  │
│  ○ Reprogrammer  ○ Remettre en file        │
│  ○ Clôturer sans suite                     │
│                                             │
│  [Valider et clôturer]                     │
└─────────────────────────────────────────────┘
```

### 6.4 Page Clients

```
┌──────────────────────────────────────────────────────────────────┐
│  CLIENTS (247)                           [+ Nouveau] [Exporter]  │
│  ──────────────────────────────────────────────────────────────  │
│  🔍 [Rechercher nom, téléphone, email, ville…]                   │
│  [Actifs ▼] [Canal ▼] [Ville ▼] [Commandes ▼] [Période ▼]      │
│                                                                  │
│  □  Nom              Téléphone         Email           Statut    │
│  □  Yassine Benali   +212 6XX XX XX   yas@…           ● Actif   │
│  □  Malak Tahiri     +212 6XX XX XX   —               ● Actif   │
│  □  Ahmed Khalil     +212 6XX XX XX   ahmed@…         ○ Archivé │
│                                                                  │
│  Actions sél. : [Archiver] [Tag] [Exporter]                      │
│  < 1 2 3 … >                                                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 7. Découpage des lots

| Lot | Contenu | Fichiers principaux |
|---|---|---|
| 1 | Audit + Plan | PLAN-multicanal.md |
| 2 | SQL : interactions, events, callbacks, capacités, customers-v2 | supabase-interactions.sql, supabase-customers-v2.sql |
| 3 | SQL : moteur de distribution, fonctions RPC, pg_cron | supabase-distribution.sql |
| 4 | SQL migration + rapport | migrate-interactions.sql |
| 5 | TypeScript types + hooks foundation | types/index.ts, types/interactions.ts, hooks/* |
| 6 | Gestion contacts : page Clients v2, adresses, archive/delete | CustomersPage.tsx, useCustomers.ts |
| 7 | Workspace Agent : navigation, panneaux chat + email | WorkspacePage.tsx, composants/* |
| 8 | Workspace : panneau Rappel, qualification unifiée | CallbackPanel.tsx, WrapUpModal.tsx |
| 9 | Formulaires : champ email chat + rappel | ChatCustomerForm.tsx, nouveaux types |
| 10 | Contact page + Footer + traductions | Contact/index.tsx, Footer.tsx, translations.ts |
| 11 | Historique unifié + Supervision + Paramètres | HistoryPage.tsx, SupervisionPage.tsx |
| 12 | Nettoyage : suppression ancien code, redirections | App.tsx, AdminLayout.tsx |
| 13 | Build, lint, rapport final | RAPPORT-FINAL.md |

---

## 8. Sécurité

- `DELETE` sur `customers` interdit via RLS (policy DELETE absente)
- `delete_customer()`, `archive_customer()`, `restore_customer()` : SECURITY DEFINER, vérifient le rôle
- `route_interactions()` : SECURITY DEFINER, pas de GRANT public
- `agent_channel_capacity` : staff SELECT, admin ALL
- `callback_requests` : staff ALL (anon rien)
- `interaction_events` : staff SELECT, system INSERT via SECURITY DEFINER
- `admin_audit_log` : staff SELECT, INSERT via fonctions uniquement

---

## 9. Choix techniques notables

1. **Numérotation interactions** : séquence PostgreSQL `interaction_seq` → formatée par trigger
2. **Contrôle concurrence clients** : colonne `version INT` — UPDATE WHERE version=$v AND RETURNING version > $v → erreur si mismatch
3. **Proposition chat** : pg_cron vérifie les offres expirées chaque minute (pas de timer applicatif)
4. **Email thread** : 1 thread Gmail = 1 interaction initiale. Nouveau message sur thread clos = nouvelle interaction sur même thread
5. **Anonymisation** : fonction SQL atomique, remplace les champs PII par `SUPPRIMÉ CL-XXXXXX`, journalise dans admin_audit_log
6. **Callbacks** : `preferred_slot='asap'` → `due_at=created_at`, `preferred_slot='scheduled'` → `due_at=preferred_datetime`
7. **Redirection routes** : `/admin/chat` et `/admin/email` → `<Navigate to="/admin/workspace" replace />`
8. **Agent inactif le plus longtemps** : ORDER BY `last_active_on_channel` (colonne ou calculé depuis interaction_events)
9. **Adresse défaut** : trigger SQL garantit 1 seule `is_default=true` par client
10. **Tags** : TEXT[] PostgreSQL, index GIN pour recherche rapide

---

## 10. Ce qui N'EST PAS implémenté (limites connues)

- Webhook WhatsApp entrant (nécessite Twilio/Waha/Meta API)
- Pièces jointes email (UI seulement, pas upload)
- Appel téléphonique direct depuis la plateforme (tel: link seulement)
- Notifications push mobile
- Export > 1000 lignes côté serveur (streaming)
- Fusion de clients (placé dans l'UI mais logique SQL simplifiée)

---

*Ce document sera complété après chaque lot implémenté.*
