-- fix-customer-close-signal.sql
-- Quand le CLIENT ferme le widget de chat, l'agent n'était jamais prévenu :
-- l'interaction restait "active" indéfiniment tant que l'agent ne s'en rendait
-- pas compte lui-même. On ne ferme PAS automatiquement l'interaction (c'est à
-- l'agent de la qualifier via "Terminer") — on insère juste un message système
-- visible côté agent, comme les autres événements (conversation_started, etc.).
--
-- Exécuter dans Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.close_conversation_by_customer(p_conversation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Vérifier que l'appelant est bien le client propriétaire de cette conversation,
  -- encore ouverte (sinon on ignore silencieusement — rejouer l'appel est sans danger).
  IF NOT EXISTS (
    SELECT 1 FROM chat_conversations
    WHERE id = p_conversation_id
      AND customer_user_id = auth.uid()
      AND status IN ('waiting', 'active')
  ) THEN
    RETURN;
  END IF;

  INSERT INTO chat_messages (conversation_id, sender_type, message)
  VALUES (p_conversation_id, 'system', 'customer_left');
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_conversation_by_customer(UUID) TO authenticated, anon;
