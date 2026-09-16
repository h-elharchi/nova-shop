-- ============================================
-- NOVA SHOP — Comptes & Rôles (Lot 1)
-- Exécuter dans Supabase SQL Editor
-- IDEMPOTENT : peut être exécuté plusieurs fois
-- Prérequis : supabase-setup.sql et supabase-chat.sql exécutés
-- ============================================

-- ============================================
-- 1. MIGRATION TABLE profiles
--    Ajout colonnes, mise à jour contrainte role
-- ============================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS first_name    TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_name     TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url    TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active     BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- Mettre à jour la contrainte de rôle pour inclure 'agent'
-- On supprime la contrainte existante sur la colonne role, puis on la recrée
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%role%'
  LOOP
    EXECUTE 'ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'agent', 'user'));

-- ============================================
-- 2. FONCTION is_admin() — CORRIGÉE
--    SET search_path, vérifie is_active
-- ============================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND is_active = TRUE
  );
$$;

-- ============================================
-- 3. FONCTION is_staff() — NOUVEAU
--    Vrai pour admin ET agent actifs
-- ============================================
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'agent')
      AND is_active = TRUE
  );
$$;

-- ============================================
-- 4. TRIGGER handle_new_user() — CORRIGÉ
--    N'insère pas de profil pour les anonymes
--    Supporte le champ role dans les metadata
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ne pas créer de profil pour les utilisateurs anonymes
  IF NEW.is_anonymous IS TRUE THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (id, email, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    TRUE
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ============================================
-- 5. TRIGGER : Protection escalade de privilèges
--    Seul un admin peut changer les rôles
--    service_role (auth.uid() IS NULL) autorisé
-- ============================================
CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Opérations service_role : auth.uid() est NULL → autorisé
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Seul un admin actif peut modifier les rôles
  IF OLD.role IS DISTINCT FROM NEW.role AND NOT is_admin() THEN
    RAISE EXCEPTION 'Permission refusée : seul un administrateur peut modifier les rôles';
  END IF;

  -- Un admin ne peut pas se dégrader lui-même
  IF OLD.id = auth.uid() AND OLD.role = 'admin' AND NEW.role <> 'admin' THEN
    RAISE EXCEPTION 'Permission refusée : vous ne pouvez pas modifier votre propre rôle administrateur';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_privilege_escalation ON public.profiles;
CREATE TRIGGER prevent_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role)
  EXECUTE FUNCTION public.prevent_privilege_escalation();

-- ============================================
-- 6. TRIGGER : Protection dernier admin actif
--    Empêche de désactiver / dégrader le dernier admin
-- ============================================
CREATE OR REPLACE FUNCTION public.prevent_last_admin_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining INTEGER;
BEGIN
  -- Vérifier uniquement si on touche un admin actif
  IF OLD.role = 'admin' AND OLD.is_active = TRUE THEN
    -- On démote ou désactive ?
    IF (NEW.role <> 'admin') OR (NEW.is_active = FALSE) THEN
      SELECT COUNT(*) INTO v_remaining
      FROM public.profiles
      WHERE role = 'admin'
        AND is_active = TRUE
        AND id <> OLD.id;

      IF v_remaining = 0 THEN
        RAISE EXCEPTION 'Opération interdite : impossible de supprimer le dernier administrateur actif';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_last_admin_removal ON public.profiles;
CREATE TRIGGER prevent_last_admin_removal
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_last_admin_removal();

-- ============================================
-- 7. TABLE admin_audit_log
--    Journal des actions privilégiées
-- ============================================
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action         TEXT        NOT NULL,
  target_user_id UUID        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  details        JSONB       NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_actor_idx  ON public.admin_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx ON public.admin_audit_log(target_user_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_date_idx   ON public.admin_audit_log(created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Seuls les admins peuvent lire le journal
DROP POLICY IF EXISTS "Admins can view audit log" ON public.admin_audit_log;
CREATE POLICY "Admins can view audit log"
  ON public.admin_audit_log FOR SELECT
  USING (is_admin());

-- Les insertions se font uniquement via service_role (Edge Function)
-- Pas de politique INSERT/UPDATE/DELETE pour les utilisateurs normaux

-- ============================================
-- 8. STORAGE BUCKET avatars
--    Avatars du personnel (admin + agents)
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Tout utilisateur authentifié peut lire les avatars (sidebar, profil)
DROP POLICY IF EXISTS "Authenticated can view avatars" ON storage.objects;
CREATE POLICY "Authenticated can view avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');

-- Le staff peut uploader dans son propre dossier {user_id}/
DROP POLICY IF EXISTS "Staff can upload own avatar" ON storage.objects;
CREATE POLICY "Staff can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
    AND is_staff()
  );

-- Le staff peut remplacer son avatar
DROP POLICY IF EXISTS "Staff can update own avatar" ON storage.objects;
CREATE POLICY "Staff can update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
    AND is_staff()
  );

-- Le staff peut supprimer son avatar
DROP POLICY IF EXISTS "Staff can delete own avatar" ON storage.objects;
CREATE POLICY "Staff can delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND split_part(name, '/', 1) = auth.uid()::text
    AND is_staff()
  );

-- ============================================
-- 9. MISE À JOUR RLS orders — accès agents
--    Les agents peuvent consulter et mettre à jour
--    le statut des commandes
-- ============================================

-- Supprimer les anciennes politiques admin-only
DROP POLICY IF EXISTS "Admins can view orders"        ON public.orders;
DROP POLICY IF EXISTS "Admins can manage orders"      ON public.orders;
DROP POLICY IF EXISTS "Admin can view orders"         ON public.orders;
DROP POLICY IF EXISTS "Admin can manage orders"       ON public.orders;

-- Staff (admin + agent) : lecture des commandes
DROP POLICY IF EXISTS "Staff can view orders" ON public.orders;
CREATE POLICY "Staff can view orders"
  ON public.orders FOR SELECT
  USING (is_staff());

-- Staff : mise à jour du statut
DROP POLICY IF EXISTS "Staff can update orders" ON public.orders;
CREATE POLICY "Staff can update orders"
  ON public.orders FOR UPDATE
  USING (is_staff())
  WITH CHECK (is_staff());

-- Admin uniquement : supprimer des commandes
DROP POLICY IF EXISTS "Admins can delete orders" ON public.orders;
CREATE POLICY "Admins can delete orders"
  ON public.orders FOR DELETE
  USING (is_admin());

-- ============================================
-- 10. MISE À JOUR fonctions chat — is_staff()
--     Les agents peuvent prendre et clôturer
--     des conversations, pas seulement les admins
-- ============================================
CREATE OR REPLACE FUNCTION public.claim_conversation(p_conversation_id UUID)
RETURNS public.chat_conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation public.chat_conversations;
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_conversation
  FROM public.chat_conversations
  WHERE id = p_conversation_id
    AND status = 'waiting'
  FOR UPDATE SKIP LOCKED;

  IF v_conversation.id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.chat_conversations
  SET
    status            = 'active',
    assigned_admin_id = auth.uid(),
    queue_position    = NULL,
    assigned_at       = now(),
    updated_at        = now()
  WHERE id = p_conversation_id
  RETURNING * INTO v_conversation;

  UPDATE public.chat_agents
  SET status = 'busy', updated_at = now()
  WHERE user_id = auth.uid()
    AND status = 'available';

  INSERT INTO public.chat_messages (conversation_id, sender_type, message)
  VALUES (p_conversation_id, 'system', 'conversation_started');

  RETURN v_conversation;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_conversation(p_conversation_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id    UUID;
  v_active_count INTEGER;
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT assigned_admin_id INTO v_admin_id
  FROM public.chat_conversations
  WHERE id = p_conversation_id AND status = 'active';

  IF v_admin_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.chat_conversations
  SET
    status     = 'closed',
    closed_at  = now(),
    updated_at = now()
  WHERE id = p_conversation_id
    AND status = 'active';

  INSERT INTO public.chat_messages (conversation_id, sender_type, message)
  VALUES (p_conversation_id, 'system', 'conversation_closed');

  SELECT COUNT(*) INTO v_active_count
  FROM public.chat_conversations
  WHERE assigned_admin_id = v_admin_id
    AND status = 'active';

  IF v_active_count = 0 THEN
    UPDATE public.chat_agents
    SET status = 'available', updated_at = now()
    WHERE user_id = v_admin_id
      AND status = 'busy';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_chat_agent()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_staff() THEN
    RAISE EXCEPTION 'Only staff can register as chat agents';
  END IF;

  INSERT INTO public.chat_agents (user_id, status, last_seen_at)
  VALUES (auth.uid(), 'offline', now())
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

-- ============================================
-- 11. MISE À JOUR RLS chat — is_staff()
-- ============================================

-- chat_conversations
DROP POLICY IF EXISTS "Admin can view all conversations" ON public.chat_conversations;
DROP POLICY IF EXISTS "Staff can view all conversations" ON public.chat_conversations;
CREATE POLICY "Staff can view all conversations"
  ON public.chat_conversations FOR SELECT
  USING (is_staff());

DROP POLICY IF EXISTS "Admin can update conversations" ON public.chat_conversations;
DROP POLICY IF EXISTS "Staff can update conversations" ON public.chat_conversations;
CREATE POLICY "Staff can update conversations"
  ON public.chat_conversations FOR UPDATE
  USING (is_staff())
  WITH CHECK (is_staff());

-- chat_messages
DROP POLICY IF EXISTS "Admin can view all messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Staff can view all messages" ON public.chat_messages;
CREATE POLICY "Staff can view all messages"
  ON public.chat_messages FOR SELECT
  USING (is_staff());

DROP POLICY IF EXISTS "Admin can send messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Staff can send messages" ON public.chat_messages;
CREATE POLICY "Staff can send messages"
  ON public.chat_messages FOR INSERT
  WITH CHECK (
    is_staff()
    AND sender_type IN ('admin', 'system')
  );

-- chat_agents
DROP POLICY IF EXISTS "Admin can view agents" ON public.chat_agents;
DROP POLICY IF EXISTS "Staff can view agents" ON public.chat_agents;
CREATE POLICY "Staff can view agents"
  ON public.chat_agents FOR SELECT
  USING (is_staff());

DROP POLICY IF EXISTS "Admin can manage own agent" ON public.chat_agents;
DROP POLICY IF EXISTS "Staff can manage own agent" ON public.chat_agents;
CREATE POLICY "Staff can manage own agent"
  ON public.chat_agents FOR ALL
  USING (is_staff() AND user_id = auth.uid())
  WITH CHECK (is_staff() AND user_id = auth.uid());

-- ============================================
-- 12. MISE À JOUR RLS profiles
--     Les agents voient leur propre profil
--     Les admins voient tous les profils staff
-- ============================================

-- Le staff peut lire son propre profil
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Staff can view own profile"  ON public.profiles;
CREATE POLICY "Staff can view own profile"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

-- Les admins voient tous les profils (pour la gestion des utilisateurs)
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (is_admin());

-- Le staff peut mettre à jour son propre profil
-- (role et is_active protégés par trigger)
DROP POLICY IF EXISTS "Staff can update own profile" ON public.profiles;
CREATE POLICY "Staff can update own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid() AND is_staff())
  WITH CHECK (id = auth.uid());

-- ============================================
-- 13. PERMISSIONS
-- ============================================
GRANT EXECUTE ON FUNCTION public.is_staff()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_chat_agent()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_agent_heartbeat(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_conversation(UUID)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_conversation(UUID)  TO authenticated;
