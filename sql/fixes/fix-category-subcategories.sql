-- fix-category-subcategories.sql
-- Sous-catégories (2 niveaux : catégorie → sous-catégories), chacune avec sa
-- propre image (categories.image_url existe déjà).
--
-- Règles garanties côté base (en plus de l'UI) :
--   - une sous-catégorie a pour parent une catégorie de premier niveau ;
--   - une catégorie qui a des sous-catégories ne peut pas devenir elle-même
--     une sous-catégorie ;
--   - une catégorie ne peut pas être son propre parent ;
--   - supprimer une catégorie qui a encore des sous-catégories est refusé
--     (ON DELETE RESTRICT) — les produits d'une catégorie supprimée passent
--     à category_id NULL comme avant.
--
-- Exécuter dans Supabase SQL Editor.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.categories(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS categories_parent_idx ON public.categories (parent_id);

CREATE OR REPLACE FUNCTION public.enforce_category_depth()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'a category cannot be its own parent';
  END IF;

  IF EXISTS (SELECT 1 FROM public.categories WHERE id = NEW.parent_id AND parent_id IS NOT NULL) THEN
    RAISE EXCEPTION 'subcategories can only be nested one level deep';
  END IF;

  IF EXISTS (SELECT 1 FROM public.categories WHERE parent_id = NEW.id) THEN
    RAISE EXCEPTION 'a category with subcategories cannot become a subcategory';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS categories_enforce_depth ON public.categories;
CREATE TRIGGER categories_enforce_depth
  BEFORE INSERT OR UPDATE OF parent_id ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.enforce_category_depth();

NOTIFY pgrst, 'reload schema';
