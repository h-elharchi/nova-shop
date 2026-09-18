-- fix-chat-email-capture.sql
-- L'email saisi par le client dans le formulaire de chat n'était jamais
-- enregistré : chat_conversations n'avait pas de colonne customer_email, et
-- le pont vers `customers` (bridge_chat_to_interaction) ne le reprenait pas
-- non plus dans l'upsert. Corrige les deux.
--
-- Exécuter dans Supabase SQL Editor.

ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS customer_email TEXT;

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
  INSERT INTO customers (phone, first_name, last_name, email, source)
  VALUES (
    NEW.customer_phone,
    NEW.customer_first_name,
    NEW.customer_last_name,
    NULLIF(NEW.customer_email, ''),
    'chat'
  )
  ON CONFLICT (phone) DO UPDATE
    SET first_name = EXCLUDED.first_name,
        last_name  = EXCLUDED.last_name,
        email      = COALESCE(EXCLUDED.email, customers.email),
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
