-- fix-chat-interaction-bridge.sql
-- Pont entre l'ancien système de chat (chat_conversations) et le
-- nouveau workspace multicanal (interactions).
--
-- Problème : les conversations initiées depuis le widget client ne
-- créaient aucune interaction dans la table `interactions`.
-- Le workspace était donc aveugle aux demandes de chat.
--
-- Ce script ajoute :
--   1. Trigger AFTER INSERT sur chat_conversations
--      → crée une interaction (channel='chat', status='queued')
--      → upsert le customer depuis le numéro de téléphone
--      → relie chat_conversations.interaction_id
--
--   2. assign_to_available_admin modifiée
--      → court-circuit si interaction_id IS NOT NULL
--        (le workspace prend le relais, pas l'ancien système)
--
--   3. Trigger AFTER UPDATE sur interactions (channel='chat')
--      → quand l'interaction passe à 'assigned'/'active' :
--          · passe la chat_conversation à 'active'
--          · renseigne assigned_admin_id
--          · insère le message système 'conversation_started'
--      → quand l'interaction passe à 'closed' :
--          · insère le message système 'conversation_closed'
--          (la conversation est déjà fermée par close_interaction)
--
-- Idempotent : DROP TRIGGER IF EXISTS + CREATE OR REPLACE.
-- Exécuter dans Supabase SQL Editor.

-- ═══════════════════════════════════════════════════════════════
-- 1. TRIGGER : chat_conversations → interactions
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.bridge_chat_to_interaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_customer_id    UUID;
  v_interaction_id UUID;
BEGIN
  -- Upsert customer depuis les données du formulaire chat
  INSERT INTO customers (phone, first_name, last_name, source)
  VALUES (
    NEW.customer_phone,
    NEW.customer_first_name,
    NEW.customer_last_name,
    'chat'
  )
  ON CONFLICT (phone) DO UPDATE
    SET first_name = EXCLUDED.first_name,
        last_name  = EXCLUDED.last_name,
        updated_at = now()
  RETURNING id INTO v_customer_id;

  -- Créer l'interaction dans la file du workspace
  INSERT INTO interactions (
    channel, origin_channel, customer_id, subject, status, queued_at
  )
  VALUES (
    'chat',
    'website_chat',
    v_customer_id,
    'Chat — ' || NEW.customer_first_name || ' ' || NEW.customer_last_name,
    'queued',
    now()
  )
  RETURNING id INTO v_interaction_id;

  -- Journaliser la création
  PERFORM log_interaction_event(
    v_interaction_id, 'created', NULL,
    jsonb_build_object('channel', 'chat', 'conversation_id', NEW.id)
  );

  -- Lier la conversation à l'interaction
  UPDATE chat_conversations
  SET interaction_id = v_interaction_id
  WHERE id = NEW.id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS bridge_chat_to_interaction_trig ON public.chat_conversations;
CREATE TRIGGER bridge_chat_to_interaction_trig
  AFTER INSERT ON public.chat_conversations
  FOR EACH ROW
  WHEN (NEW.status = 'waiting' AND NEW.interaction_id IS NULL)
  EXECUTE FUNCTION public.bridge_chat_to_interaction();

-- ═══════════════════════════════════════════════════════════════
-- 2. assign_to_available_admin — court-circuit workspace
--    (remplace la version de supabase-crc.sql)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.assign_to_available_admin(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID;
  v_has_interaction BOOLEAN;
BEGIN
  -- Vérifier que la conversation est en attente et appartient à l'appelant
  IF NOT EXISTS (
    SELECT 1 FROM chat_conversations
    WHERE  id = p_conversation_id
      AND  customer_user_id = auth.uid()
      AND  status = 'waiting'
  ) THEN
    RETURN FALSE;
  END IF;

  -- Si une interaction workspace est déjà liée, laisser le workspace gérer
  SELECT (interaction_id IS NOT NULL)
    INTO v_has_interaction
  FROM chat_conversations
  WHERE id = p_conversation_id;

  IF v_has_interaction THEN
    RETURN FALSE;
  END IF;

  -- Comportement d'origine (ancienne logique CRC, si interaction non liée)
  SELECT user_id INTO v_admin_id
  FROM   chat_agents
  WHERE  status = 'available'
    AND  last_seen_at >= now() - INTERVAL '2 minutes'
    AND  active_conversations_count < capacity
  ORDER  BY active_conversations_count ASC, last_seen_at DESC
  LIMIT  1
  FOR    UPDATE SKIP LOCKED;

  IF v_admin_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE chat_conversations SET
    status            = 'active',
    assigned_admin_id = v_admin_id,
    assigned_at       = now(),
    queue_position    = NULL,
    updated_at        = now()
  WHERE id = p_conversation_id;

  UPDATE chat_agents
  SET active_conversations_count = active_conversations_count + 1
  WHERE user_id = v_admin_id;

  INSERT INTO chat_messages (conversation_id, sender_type, sender_id, message)
  VALUES (p_conversation_id, 'system', NULL, 'conversation_started');

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_to_available_admin(UUID) TO authenticated, anon;

-- ═══════════════════════════════════════════════════════════════
-- 3. TRIGGER : interactions → chat_conversations (sync)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.sync_interaction_to_chat()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_conv_id UUID;
BEGIN
  -- Ce trigger ne gère que les interactions chat
  IF NEW.channel != 'chat' THEN
    RETURN NULL;
  END IF;

  -- Récupérer la conversation liée
  SELECT id INTO v_conv_id
  FROM   chat_conversations
  WHERE  interaction_id = NEW.id;

  IF v_conv_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- ── Interaction assignée / active ─────────────────────────────
  -- (transition depuis un état avant prise en charge)
  IF NEW.status IN ('assigned', 'active')
     AND OLD.status NOT IN ('assigned', 'active', 'wrap_up')
  THEN
    UPDATE chat_conversations
    SET status            = 'active',
        assigned_admin_id = NEW.assigned_agent_id,
        assigned_at       = COALESCE(assigned_at, now()),
        updated_at        = now()
    WHERE id = v_conv_id
      AND status = 'waiting';

    -- Message système pour le widget client (seulement si la conv était en attente)
    IF FOUND THEN
      INSERT INTO chat_messages (conversation_id, sender_type, sender_id, message)
      VALUES (v_conv_id, 'system', NULL, 'conversation_started');
    END IF;
  END IF;

  -- ── Interaction clôturée ──────────────────────────────────────
  -- close_interaction ferme déjà la chat_conversation ;
  -- on insère ici le message 'conversation_closed' manquant.
  IF NEW.status = 'closed' AND OLD.status != 'closed' THEN
    INSERT INTO chat_messages (conversation_id, sender_type, sender_id, message)
    VALUES (v_conv_id, 'system', NULL, 'conversation_closed');
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sync_interaction_to_chat_trig ON public.interactions;
CREATE TRIGGER sync_interaction_to_chat_trig
  AFTER UPDATE OF status, assigned_agent_id ON public.interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_interaction_to_chat();
