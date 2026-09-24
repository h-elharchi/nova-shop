-- fix-category-subcategories.sql
-- Sous-catégories à profondeur libre, avec plusieurs parents possibles
-- (graphe orienté sans cycle) :
--   - une sous-catégorie peut appartenir à PLUSIEURS catégories ;
--   - une catégorie principale peut devenir sous-catégorie d'une autre
--     catégorie principale (et ainsi de suite, sans limite de niveaux) ;
--   - categories.show_at_root : une catégorie qui a des parents reste
--     affichée aussi au premier niveau si ce booléen est vrai ;
--   - l'ordre d'affichage sous un parent est stocké dans
--     category_parents.display_order (l'ordre des catégories de premier
--     niveau reste categories.display_order).
--
-- Garanties côté base :
--   - une catégorie ne peut pas être son propre parent, ni parent d'un de ses
--     ancêtres (aucun cycle) ;
--   - supprimer une catégorie qui a encore des sous-catégories est refusé
--     (ON DELETE RESTRICT) ; supprimer une sous-catégorie retire ses liens.
--
-- Idempotent. Si une version précédente de ce script (colonne
-- categories.parent_id) a déjà été exécutée, ses liens sont migrés puis la
-- colonne est supprimée.
--
-- Exécuter dans Supabase SQL Editor.

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS show_at_root BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.category_parents (
  category_id   UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  parent_id     UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (category_id, parent_id),
  CHECK (category_id <> parent_id)
);

CREATE INDEX IF NOT EXISTS category_parents_parent_idx ON public.category_parents (parent_id);

-- ── Anti-cycle ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_category_no_cycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Le nouveau parent ne doit pas être un descendant de la catégorie.
  IF EXISTS (
    WITH RECURSIVE descendants(id) AS (
      SELECT cp.category_id FROM public.category_parents cp WHERE cp.parent_id = NEW.category_id
      UNION
      SELECT cp.category_id FROM public.category_parents cp JOIN descendants d ON cp.parent_id = d.id
    )
    SELECT 1 FROM descendants WHERE id = NEW.parent_id
  ) THEN
    RAISE EXCEPTION 'category cycle: the chosen parent is already a subcategory of this category';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS category_parents_no_cycle ON public.category_parents;
CREATE TRIGGER category_parents_no_cycle
  BEFORE INSERT OR UPDATE ON public.category_parents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_category_no_cycle();

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.category_parents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read category parents" ON public.category_parents;
CREATE POLICY "Public can read category parents"
  ON public.category_parents FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admin full access to category parents" ON public.category_parents;
CREATE POLICY "Admin full access to category parents"
  ON public.category_parents FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON public.category_parents TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.category_parents TO authenticated;

-- ── Migration depuis l'ancienne colonne categories.parent_id ───────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'parent_id'
  ) THEN
    EXECUTE $m$
      INSERT INTO public.category_parents (category_id, parent_id, display_order)
      SELECT id, parent_id, display_order FROM public.categories WHERE parent_id IS NOT NULL
      ON CONFLICT DO NOTHING
    $m$;
    DROP TRIGGER IF EXISTS categories_enforce_depth ON public.categories;
    DROP FUNCTION IF EXISTS public.enforce_category_depth();
    ALTER TABLE public.categories DROP COLUMN parent_id;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
