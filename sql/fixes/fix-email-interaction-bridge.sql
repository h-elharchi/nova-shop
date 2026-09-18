-- fix-email-interaction-bridge.sql
-- Pont entre la sync Gmail (email_messages) et le workspace (interactions).
--
-- Problème : gmail-sync insère dans email_messages mais ne crée jamais
-- d'interaction dans la table interactions. Le workspace est donc aveugle
-- aux emails entrants.
-- De plus, interactions n'avait pas de colonne email_thread_id, rendant
-- le join PostgREST dans EmailPanel non fonctionnel.
--
-- Ce script ajoute :
--   1. Colonne interactions.email_thread_id (FK → email_threads)
--   2. Trigger AFTER INSERT sur email_messages (direction='in') qui :
--        · Upsert l'email_thread (1 thread par gmail_thread_id)
--        · Lie email_messages.thread_id → email_thread
--        · Crée une interaction queued si aucune interaction ouverte
--          n'existe déjà pour ce thread
--   3. NOTIFY pgrst pour que PostgREST recharge le schéma et reconnaisse
--      la nouvelle FK pour les joins
--
-- Règles de gestion :
--   - 1er email d'un thread → interaction créée (queued)
--   - Réponse dans un thread avec interaction ouverte → rien de nouveau
--     (le message est lié au thread, l'agent le voit déjà)
--   - Email dans un thread clôturé → nouvelle interaction créée
--
-- Idempotent : ALTER TABLE IF NOT EXISTS, CREATE OR REPLACE, DROP IF EXISTS.
-- Exécuter dans Supabase SQL Editor.

-- ═══════════════════════════════════════════════════════════════
-- 1. Colonne email_thread_id sur interactions
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.interactions
  ADD COLUMN IF NOT EXISTS email_thread_id UUID
    REFERENCES public.email_threads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS interactions_email_thread_idx
  ON public.interactions (email_thread_id)
  WHERE email_thread_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- 2. Trigger : email_messages → email_threads + interactions
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.bridge_email_to_interaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_thread_id      UUID;
  v_interaction_id UUID;
  v_customer_id    UUID;
  v_sender_email   TEXT;
BEGIN
  -- Uniquement pour les emails entrants
  IF NEW.direction != 'in' THEN
    RETURN NULL;
  END IF;

  -- Extraire l'adresse email pure depuis "Nom Prénom <email@domain.com>"
  v_sender_email := COALESCE(
    substring(NEW.from_address FROM '<([^>]+)>'),
    trim(NEW.from_address)
  );

  -- Tenter de lier à un client existant via email
  SELECT id INTO v_customer_id
  FROM customers
  WHERE LOWER(email)  = LOWER(v_sender_email)
     OR LOWER(email2) = LOWER(v_sender_email)
  LIMIT 1;

  -- ── Upsert email_thread (1 par gmail_thread_id) ─────────────
  INSERT INTO email_threads (
    gmail_thread_id, email_account_id,
    subject, from_address,
    last_message_at, created_at
  )
  VALUES (
    NEW.gmail_thread_id,
    NEW.email_account_id,
    NEW.subject,
    NEW.from_address,
    NEW.received_at,
    NEW.received_at
  )
  ON CONFLICT (gmail_thread_id) DO UPDATE
    SET last_message_at = GREATEST(email_threads.last_message_at, EXCLUDED.last_message_at)
  RETURNING id INTO v_thread_id;

  -- Lier le message à son thread
  UPDATE email_messages
  SET thread_id = v_thread_id
  WHERE id = NEW.id;

  -- ── Interaction : créer seulement si aucune n'est ouverte ────
  SELECT id INTO v_interaction_id
  FROM interactions
  WHERE email_thread_id = v_thread_id
    AND status NOT IN ('closed', 'abandoned', 'timeout', 'failed')
  ORDER BY queued_at DESC
  LIMIT 1;

  IF v_interaction_id IS NULL THEN
    -- Pas d'interaction ouverte → en créer une nouvelle
    INSERT INTO interactions (
      channel, origin_channel,
      customer_id, email_thread_id,
      subject, status, queued_at
    )
    VALUES (
      'email', 'email',
      v_customer_id, v_thread_id,
      COALESCE(NEW.subject, '(sans objet)'),
      'queued', now()
    )
    RETURNING id INTO v_interaction_id;

    PERFORM log_interaction_event(
      v_interaction_id, 'created', NULL,
      jsonb_build_object(
        'channel', 'email',
        'thread_id', v_thread_id,
        'from', v_sender_email
      )
    );
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS bridge_email_to_interaction_trig ON public.email_messages;
CREATE TRIGGER bridge_email_to_interaction_trig
  AFTER INSERT ON public.email_messages
  FOR EACH ROW
  WHEN (NEW.direction = 'in')
  EXECUTE FUNCTION public.bridge_email_to_interaction();

-- ═══════════════════════════════════════════════════════════════
-- 3. Recharger le schéma PostgREST (reconnaître la nouvelle FK)
-- ═══════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';
