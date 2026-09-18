-- fix-customers-flexible-contact.sql
-- La table customers exigeait un téléphone (UNIQUE NOT NULL), donc impossible
-- de créer un client depuis une interaction email sans numéro connu. Rend le
-- téléphone optionnel (au moins téléphone OU email requis), et ajoute une RPC
-- dédiée pour créer/relier un client depuis une interaction (typiquement un
-- email sans client identifié) sans créer de doublon si un client correspond
-- déjà par téléphone ou par email.
--
-- Aucune donnée existante affectée : toutes les lignes actuelles ont déjà un
-- téléphone non nul, la contrainte CHECK est donc immédiatement satisfaite.
--
-- Exécuter dans Supabase SQL Editor.

ALTER TABLE customers ALTER COLUMN phone DROP NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_phone_or_email_check'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_phone_or_email_check
      CHECK (phone IS NOT NULL OR email IS NOT NULL);
  END IF;
END $$;

-- ─── RPC : créer/relier un client depuis une interaction ─────
CREATE OR REPLACE FUNCTION create_customer_from_interaction(
  p_interaction_id UUID,
  p_first_name     TEXT,
  p_last_name      TEXT DEFAULT '',
  p_phone          TEXT DEFAULT NULL,
  p_email          TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_customer_id UUID;
  v_phone       TEXT := NULLIF(trim(p_phone), '');
  v_email       TEXT := NULLIF(lower(trim(p_email)), '');
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'permission denied'; END IF;
  IF v_phone IS NULL AND v_email IS NULL THEN
    RAISE EXCEPTION 'phone or email required';
  END IF;

  SELECT id INTO v_customer_id
  FROM customers
  WHERE (v_phone IS NOT NULL AND phone = v_phone)
     OR (v_email IS NOT NULL AND LOWER(email) = v_email)
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    INSERT INTO customers (phone, first_name, last_name, email, source)
    VALUES (v_phone, p_first_name, COALESCE(p_last_name, ''), v_email, 'email')
    RETURNING id INTO v_customer_id;
  END IF;

  UPDATE interactions SET customer_id = v_customer_id WHERE id = p_interaction_id;

  -- Rattacher aussi les autres messages du même fil pour l'historique 360°
  UPDATE email_messages em
  SET customer_id = v_customer_id
  FROM interactions i
  WHERE i.id = p_interaction_id
    AND i.email_thread_id IS NOT NULL
    AND em.thread_id = i.email_thread_id
    AND em.customer_id IS NULL;

  RETURN v_customer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_customer_from_interaction TO authenticated;
