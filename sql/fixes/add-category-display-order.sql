-- ============================================
-- FIX : Ajoute display_order sur categories
-- ============================================
-- Permet à l'admin de choisir l'ordre d'affichage des catégories
-- sur le site public (page Accueil + page Catégories).
-- À exécuter une seule fois dans Supabase SQL Editor.

ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

-- Initialise l'ordre existant selon le nom pour avoir un point de départ stable
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name_fr) - 1 AS rn
  FROM categories
)
UPDATE categories c
SET display_order = ordered.rn
FROM ordered
WHERE c.id = ordered.id;
