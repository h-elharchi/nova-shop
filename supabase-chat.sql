-- ============================================
-- NOVA SHOP — Chat System
-- Exécuter dans Supabase SQL Editor
-- ============================================
-- Prérequis : supabase-setup.sql doit avoir été exécuté
-- (is_admin() et update_updated_at() doivent exister)
-- ============================================

-- ============================================
-- 1. TABLE chat_conversations
-- ============================================
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_user_id    UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_first_name TEXT NOT NULL,
  customer_last_name  TEXT NOT NULL,
  customer_phone      TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'waiting'
                        CHECK (status IN ('waiting','active','closed','timeout')),
  assigned_admin_id   UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  queue_position      INTEGER NULL,
  last_message_at     TIMESTAMPTZ NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_at         TIMESTAMPTZ NULL,
  closed_at           TIMESTAMPTZ NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 2. TABLE chat_messages
-- ============================================
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender_type     TEXT NOT NULL CHECK (sender_type IN ('customer','admin','system')),
  sender_id       UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  message         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 3. TABLE chat_agents
-- ============================================
CREATE TABLE IF NOT EXISTS public.chat_agents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'offline'
                 CHECK (status IN ('offline','available','busy')),
  last_seen_at TIMESTAMPTZ NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- 4. INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS chat_conversations_status_idx        ON public.chat_conversations(status);
CREATE INDEX IF NOT EXISTS chat_conversations_admin_idx         ON public.chat_conversations(assigned_admin_id);
CREATE INDEX IF NOT EXISTS chat_conversations_created_idx       ON public.chat_conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS chat_conversations_last_msg_idx      ON public.chat_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS chat_conversations_customer_user_idx ON public.chat_conversations(customer_user_id);
CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx       ON public.chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS chat_messages_created_idx            ON public.chat_messages(created_at ASC);
CREATE INDEX IF NOT EXISTS chat_agents_status_idx               ON public.chat_agents(status);
CREATE INDEX IF NOT EXISTS chat_agents_user_idx                 ON public.chat_agents(user_id);

-- ============================================
-- 5. TRIGGERS updated_at (réutilise update_updated_at)
-- ============================================
DROP TRIGGER IF EXISTS chat_conversations_updated_at ON public.chat_conversations;
CREATE TRIGGER chat_conversations_updated_at
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS chat_agents_updated_at ON public.chat_agents;
CREATE TRIGGER chat_agents_updated_at
  BEFORE UPDATE ON public.chat_agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- 6. TRIGGER : mettre à jour last_message_at
-- ============================================
CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.chat_conversations
  SET last_message_at = NEW.created_at, updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_messages_update_last_message ON public.chat_messages;
CREATE TRIGGER chat_messages_update_last_message
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_conversation_last_message();

-- ============================================
-- 7. TRIGGER : recalculer les positions de la queue
-- ============================================
CREATE OR REPLACE FUNCTION public.recalculate_queue_positions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS pos
    FROM public.chat_conversations
    WHERE status = 'waiting'
  )
  UPDATE public.chat_conversations c
  SET queue_position = r.pos
  FROM ranked r
  WHERE c.id = r.id;

  -- Reset position pour les conversations non-waiting
  UPDATE public.chat_conversations
  SET queue_position = NULL
  WHERE status != 'waiting' AND queue_position IS NOT NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_conversations_queue_reorder ON public.chat_conversations;
CREATE TRIGGER chat_conversations_queue_reorder
  AFTER INSERT OR UPDATE OF status ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.recalculate_queue_positions();

-- ============================================
-- 8. FUNCTION : ensure_chat_agent
-- Crée l'entrée agent si elle n'existe pas encore.
-- L'admin appelle cette fonction à la connexion.
-- ============================================
CREATE OR REPLACE FUNCTION public.ensure_chat_agent()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.chat_agents (user_id, status, last_seen_at)
  VALUES (auth.uid(), 'offline', now())
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

-- ============================================
-- 9. FUNCTION : update_agent_heartbeat
-- L'admin appelle cette fonction toutes les 20s
-- pour maintenir sa présence.
-- ============================================
CREATE OR REPLACE FUNCTION public.update_agent_heartbeat(p_status TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_status IS NOT NULL THEN
    UPDATE public.chat_agents
    SET status = p_status, last_seen_at = now(), updated_at = now()
    WHERE user_id = auth.uid();
  ELSE
    UPDATE public.chat_agents
    SET last_seen_at = now(), updated_at = now()
    WHERE user_id = auth.uid();
  END IF;
END;
$$;

-- ============================================
-- 10. FUNCTION : claim_conversation
-- Prend en charge une conversation spécifique.
-- Protection contre les race conditions via
-- SELECT ... FOR UPDATE SKIP LOCKED.
-- Retourne la conversation ou NULL si déjà prise.
-- ============================================
CREATE OR REPLACE FUNCTION public.claim_conversation(p_conversation_id UUID)
RETURNS public.chat_conversations LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_conversation public.chat_conversations;
BEGIN
  -- Vérifier que l'appelant est admin
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Verrouiller la conversation pour éviter les courses concurrentes
  SELECT * INTO v_conversation
  FROM public.chat_conversations
  WHERE id = p_conversation_id
    AND status = 'waiting'
  FOR UPDATE SKIP LOCKED;

  -- Si NULL : conversation déjà prise ou inexistante
  IF v_conversation.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Assigner la conversation
  UPDATE public.chat_conversations
  SET
    status            = 'active',
    assigned_admin_id = auth.uid(),
    queue_position    = NULL,
    assigned_at       = now(),
    updated_at        = now()
  WHERE id = p_conversation_id
  RETURNING * INTO v_conversation;

  -- Passer l'agent en busy
  UPDATE public.chat_agents
  SET status = 'busy', updated_at = now()
  WHERE user_id = auth.uid()
    AND status = 'available';

  -- Message système
  INSERT INTO public.chat_messages (conversation_id, sender_type, message)
  VALUES (p_conversation_id, 'system', 'conversation_started');

  RETURN v_conversation;
END;
$$;

-- ============================================
-- 11. FUNCTION : close_conversation
-- Ferme une conversation active.
-- L'admin redevient available s'il n'a plus
-- d'autres conversations actives.
-- ============================================
CREATE OR REPLACE FUNCTION public.close_conversation(p_conversation_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_admin_id UUID;
  v_active_count INTEGER;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Récupérer l'admin assigné
  SELECT assigned_admin_id INTO v_admin_id
  FROM public.chat_conversations
  WHERE id = p_conversation_id AND status = 'active';

  IF v_admin_id IS NULL THEN
    RETURN;
  END IF;

  -- Fermer la conversation
  UPDATE public.chat_conversations
  SET
    status     = 'closed',
    closed_at  = now(),
    updated_at = now()
  WHERE id = p_conversation_id
    AND status = 'active';

  -- Message système
  INSERT INTO public.chat_messages (conversation_id, sender_type, message)
  VALUES (p_conversation_id, 'system', 'conversation_closed');

  -- Compter les autres conversations actives de cet admin
  SELECT COUNT(*) INTO v_active_count
  FROM public.chat_conversations
  WHERE assigned_admin_id = v_admin_id
    AND status = 'active';

  -- Si plus de conversation active, repasser available
  IF v_active_count = 0 THEN
    UPDATE public.chat_agents
    SET status = 'available', updated_at = now()
    WHERE user_id = v_admin_id
      AND status = 'busy';
  END IF;
END;
$$;

-- ============================================
-- 12. FUNCTION : assign_to_available_admin
-- Essaie d'assigner une conversation waiting
-- à un admin available.
-- Appelée par le client après création.
-- Retourne TRUE si assignée, FALSE sinon.
-- ============================================
CREATE OR REPLACE FUNCTION public.assign_to_available_admin(p_conversation_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  -- Vérifier que la conversation appartient au caller
  IF NOT EXISTS (
    SELECT 1 FROM public.chat_conversations
    WHERE id = p_conversation_id
      AND customer_user_id = auth.uid()
      AND status = 'waiting'
  ) THEN
    RETURN FALSE;
  END IF;

  -- Chercher un admin disponible (non expiré depuis 2 min)
  SELECT user_id INTO v_admin_id
  FROM public.chat_agents
  WHERE status = 'available'
    AND last_seen_at > now() - INTERVAL '2 minutes'
  ORDER BY last_seen_at DESC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_admin_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Assigner
  UPDATE public.chat_conversations
  SET
    status            = 'active',
    assigned_admin_id = v_admin_id,
    queue_position    = NULL,
    assigned_at       = now(),
    updated_at        = now()
  WHERE id = p_conversation_id
    AND status = 'waiting';

  -- Passer l'agent en busy
  UPDATE public.chat_agents
  SET status = 'busy', updated_at = now()
  WHERE user_id = v_admin_id;

  -- Message système
  INSERT INTO public.chat_messages (conversation_id, sender_type, message)
  VALUES (p_conversation_id, 'system', 'conversation_started');

  RETURN TRUE;
END;
$$;

-- ============================================
-- 13. FUNCTION : timeout_conversation
-- Passe une conversation en timeout.
-- Appelée par le client après 30s sans admin.
-- ============================================
CREATE OR REPLACE FUNCTION public.timeout_conversation(p_conversation_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.chat_conversations
  SET
    status     = 'timeout',
    updated_at = now()
  WHERE id = p_conversation_id
    AND customer_user_id = auth.uid()
    AND status = 'waiting';
END;
$$;

-- ============================================
-- 14. FUNCTION : check_agents_online
-- Retourne si des admins sont disponibles ou occupés.
-- Utilisé pour décider queue vs timeout.
-- ============================================
CREATE OR REPLACE FUNCTION public.check_agents_online()
RETURNS TABLE(available_count INTEGER, busy_count INTEGER)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE status = 'available' AND last_seen_at > now() - INTERVAL '2 minutes')::INTEGER,
    COUNT(*) FILTER (WHERE status = 'busy'      AND last_seen_at > now() - INTERVAL '2 minutes')::INTEGER
  FROM public.chat_agents;
END;
$$;

-- ============================================
-- 15. ROW LEVEL SECURITY
-- ============================================
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_agents        ENABLE ROW LEVEL SECURITY;

-- -------- chat_conversations --------

-- Client : voir SA conversation (via anonymous auth)
DROP POLICY IF EXISTS "Customer can view own conversation" ON public.chat_conversations;
CREATE POLICY "Customer can view own conversation"
  ON public.chat_conversations FOR SELECT
  USING (customer_user_id = auth.uid());

-- Client : créer une conversation
DROP POLICY IF EXISTS "Customer can create conversation" ON public.chat_conversations;
CREATE POLICY "Customer can create conversation"
  ON public.chat_conversations FOR INSERT
  WITH CHECK (customer_user_id = auth.uid());

-- Admin : voir toutes les conversations
DROP POLICY IF EXISTS "Admin can view all conversations" ON public.chat_conversations;
CREATE POLICY "Admin can view all conversations"
  ON public.chat_conversations FOR SELECT
  USING (is_admin());

-- Admin : modifier les conversations
DROP POLICY IF EXISTS "Admin can update conversations" ON public.chat_conversations;
CREATE POLICY "Admin can update conversations"
  ON public.chat_conversations FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());

-- -------- chat_messages --------

-- Client : voir les messages de SA conversation
DROP POLICY IF EXISTS "Customer can view own messages" ON public.chat_messages;
CREATE POLICY "Customer can view own messages"
  ON public.chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_conversations
      WHERE id = chat_messages.conversation_id
        AND customer_user_id = auth.uid()
    )
  );

-- Client : envoyer un message dans SA conversation
DROP POLICY IF EXISTS "Customer can send messages" ON public.chat_messages;
CREATE POLICY "Customer can send messages"
  ON public.chat_messages FOR INSERT
  WITH CHECK (
    sender_type = 'customer'
    AND EXISTS (
      SELECT 1 FROM public.chat_conversations
      WHERE id = chat_messages.conversation_id
        AND customer_user_id = auth.uid()
        AND status = 'active'
    )
  );

-- Admin : voir tous les messages
DROP POLICY IF EXISTS "Admin can view all messages" ON public.chat_messages;
CREATE POLICY "Admin can view all messages"
  ON public.chat_messages FOR SELECT
  USING (is_admin());

-- Admin : envoyer des messages
DROP POLICY IF EXISTS "Admin can send messages" ON public.chat_messages;
CREATE POLICY "Admin can send messages"
  ON public.chat_messages FOR INSERT
  WITH CHECK (
    is_admin()
    AND sender_type IN ('admin','system')
  );

-- -------- chat_agents --------

-- Admin : voir les agents
DROP POLICY IF EXISTS "Admin can view agents" ON public.chat_agents;
CREATE POLICY "Admin can view agents"
  ON public.chat_agents FOR SELECT
  USING (is_admin());

-- Admin : gérer son propre agent
DROP POLICY IF EXISTS "Admin can manage own agent" ON public.chat_agents;
CREATE POLICY "Admin can manage own agent"
  ON public.chat_agents FOR ALL
  USING (is_admin() AND user_id = auth.uid())
  WITH CHECK (is_admin() AND user_id = auth.uid());

-- ============================================
-- 16. REALTIME — Activer les publications
-- ============================================
-- Permet les subscriptions Supabase Realtime sur ces tables.
-- À exécuter avec les droits superadmin (rôle postgres).
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_agents;

-- ============================================
-- 17. PERMISSIONS sur les fonctions RPC
-- ============================================
GRANT EXECUTE ON FUNCTION public.ensure_chat_agent()           TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_agent_heartbeat(TEXT)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_conversation(UUID)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_conversation(UUID)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_to_available_admin(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.timeout_conversation(UUID)    TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.check_agents_online()         TO authenticated, anon;
