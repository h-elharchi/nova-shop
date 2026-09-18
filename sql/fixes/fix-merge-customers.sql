-- fix-merge-customers.sql
-- Fusion de deux fiches client suspectées d'être la même personne. Le schéma
-- prévoyait déjà cette fonctionnalité (customers.status = 'merged',
-- customers.merged_into — voir supabase-customers-v2.sql) mais la fonction de
-- fusion elle-même n'avait jamais été écrite.
--
-- p_keep_id  : le client conservé (celui dont la fiche reste active)
-- p_merge_id : le client fusionné (passe en status='merged', conservé pour
--              traçabilité mais plus modifiable — RLS l'interdit déjà)
--
-- Comportement :
--   - Complète les champs manquants du client conservé (email, téléphone
--     secondaire, whatsapp, notes concaténées, tags) avec ceux du fusionné.
--   - Rattache tout l'historique du fusionné (commandes, interactions,
--     emails, rappels, adresses) au client conservé.
--   - Journalise l'opération dans admin_audit_log.
--
-- Exécuter dans Supabase SQL Editor. Nécessite fix-admin-audit-log-columns.sql
-- (colonnes target_type/target_id déjà utilisées par les autres fonctions
-- clients) déjà en place.

CREATE OR REPLACE FUNCTION public.merge_customers(
  p_keep_id  UUID,
  p_merge_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_keep  customers%ROWTYPE;
  v_merge customers%ROWTYPE;
BEGIN
  IF NOT is_staff() THEN RAISE EXCEPTION 'permission denied'; END IF;
  IF p_keep_id = p_merge_id THEN RAISE EXCEPTION 'cannot merge a customer into itself'; END IF;

  SELECT * INTO v_keep  FROM customers WHERE id = p_keep_id  FOR UPDATE;
  SELECT * INTO v_merge FROM customers WHERE id = p_merge_id FOR UPDATE;

  IF v_keep.id IS NULL OR v_merge.id IS NULL THEN
    RAISE EXCEPTION 'customer not found';
  END IF;
  IF v_keep.status = 'merged' OR v_merge.status = 'merged' THEN
    RAISE EXCEPTION 'customer already merged';
  END IF;

  -- Compléter les infos manquantes du client conservé avec celles du fusionné
  UPDATE customers SET
    email          = COALESCE(NULLIF(v_keep.email, ''), NULLIF(v_merge.email, '')),
    email2         = CASE
                        WHEN v_keep.email IS NOT NULL AND v_keep.email2 IS NULL
                          THEN NULLIF(v_merge.email, '')
                        ELSE v_keep.email2
                      END,
    phone2         = COALESCE(v_keep.phone2,
                       CASE WHEN v_merge.phone IS DISTINCT FROM v_keep.phone THEN v_merge.phone END),
    whatsapp_phone = COALESCE(v_keep.whatsapp_phone, v_merge.whatsapp_phone),
    notes          = NULLIF(TRIM(BOTH E'\n' FROM CONCAT_WS(E'\n', v_keep.notes, v_merge.notes)), ''),
    tags           = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(v_keep.tags, '{}') || COALESCE(v_merge.tags, '{}')))),
    version        = v_keep.version + 1,
    updated_at     = now()
  WHERE id = p_keep_id;

  -- Rattacher tout l'historique du client fusionné au client conservé
  UPDATE orders             SET customer_id = p_keep_id WHERE customer_id = p_merge_id;
  UPDATE interactions       SET customer_id = p_keep_id WHERE customer_id = p_merge_id;
  UPDATE email_messages     SET customer_id = p_keep_id WHERE customer_id = p_merge_id;
  UPDATE callback_requests  SET customer_id = p_keep_id WHERE customer_id = p_merge_id;
  UPDATE customer_addresses SET customer_id = p_keep_id WHERE customer_id = p_merge_id;

  -- Marquer le client fusionné (conservé pour traçabilité, plus modifiable)
  UPDATE customers SET
    status      = 'merged',
    merged_into = p_keep_id,
    version     = version + 1,
    updated_at  = now()
  WHERE id = p_merge_id;

  INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, customer_number, reason)
  VALUES (
    auth.uid(), 'merge_customer', 'customer', p_merge_id, v_merge.customer_number,
    'merged into ' || COALESCE(v_keep.customer_number, p_keep_id::text)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_customers TO authenticated;
