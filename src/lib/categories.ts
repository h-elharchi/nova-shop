import { supabase } from './supabase'
import type { Category, CategoryParentLink } from '../types'

// Une catégorie peut avoir plusieurs parents et la profondeur est libre :
// c'est un graphe sans cycle (table category_parents), pas un arbre strict.

export type CategoryWithDepth = Category & { depth: number; treeKey: string }

function bySiblingOrder(a: Category, b: Category) {
  return a.display_order - b.display_order || a.name_fr.localeCompare(b.name_fr)
}

export function parentIdsOf(c: Category): string[] {
  return c.parent_links.map(l => l.parent_id)
}

// Charge les catégories et leurs liens de parenté. Si la table category_parents
// n'existe pas encore (script SQL non exécuté), toutes les catégories sont de premier niveau.
export async function loadCategories(activeOnly: boolean): Promise<{ data: Category[]; error: string | null }> {
  let query = supabase.from('categories').select('*').order('display_order').order('name_fr')
  if (activeOnly) query = query.eq('is_active', true)
  const [{ data, error }, { data: links }] = await Promise.all([
    query,
    supabase.from('category_parents').select('category_id,parent_id,display_order'),
  ])
  if (error) return { data: [], error: error.message }

  const byChild = new Map<string, CategoryParentLink[]>()
  for (const l of (links ?? []) as { category_id: string; parent_id: string; display_order: number }[]) {
    const list = byChild.get(l.category_id) ?? []
    list.push({ parent_id: l.parent_id, display_order: l.display_order })
    byChild.set(l.category_id, list)
  }
  const all = ((data ?? []) as Category[]).map(c => ({
    ...c,
    show_at_root: c.show_at_root ?? false,
    parent_links: byChild.get(c.id) ?? [],
  }))
  return { data: all, error: null }
}

// Premier niveau : sans parent, ou explicitement affichée au premier niveau.
export function isRoot(c: Category): boolean {
  return c.parent_links.length === 0 || c.show_at_root
}

export function getTopLevel(categories: Category[]): Category[] {
  return categories.filter(isRoot).sort(bySiblingOrder)
}

// Sous-catégories directes, dans l'ordre défini sous ce parent.
export function getChildren(categories: Category[], parentId: string): Category[] {
  const orderUnder = (c: Category) => c.parent_links.find(l => l.parent_id === parentId)?.display_order ?? 0
  return categories
    .filter(c => c.parent_links.some(l => l.parent_id === parentId))
    .sort((a, b) => orderUnder(a) - orderUnder(b) || a.name_fr.localeCompare(b.name_fr))
}

// La catégorie et toutes ses sous-catégories, à n'importe quelle profondeur.
export function getDescendantIds(categories: Category[], id: string): Set<string> {
  const out = new Set<string>([id])
  const stack = [id]
  while (stack.length) {
    const cur = stack.pop()!
    for (const child of getChildren(categories, cur)) {
      if (!out.has(child.id)) {
        out.add(child.id)
        stack.push(child.id)
      }
    }
  }
  return out
}

// Liste à plat dans l'ordre d'affichage : chaque catégorie suivie de ses sous-catégories.
// Une catégorie à plusieurs parents apparaît sous chacun d'eux (`treeKey` identifie l'occurrence),
// sauf avec `unique` où seule la première occurrence est gardée (listes déroulantes).
export function flattenCategoryTree(categories: Category[], unique = false): CategoryWithDepth[] {
  const out: CategoryWithDepth[] = []
  const seen = new Set<string>()
  const visit = (cat: Category, depth: number, path: string[], treeKey: string) => {
    if (unique && seen.has(cat.id)) return
    seen.add(cat.id)
    out.push({ ...cat, depth, treeKey })
    for (const child of getChildren(categories, cat.id)) {
      if (path.includes(child.id)) continue
      visit(child, depth + 1, [...path, child.id], `${treeKey}>${child.id}`)
    }
  }
  for (const root of getTopLevel(categories)) visit(root, 0, [root.id], root.id)
  return out
}

// Libellé d'option de liste déroulante, indenté selon la profondeur.
export function categoryOptionLabel(c: CategoryWithDepth, lang: 'fr' | 'ar' | 'both' = 'fr'): string {
  const name = lang === 'ar' ? c.name_ar : lang === 'both' ? `${c.name_fr} / ${c.name_ar}` : c.name_fr
  return c.depth > 0 ? `${'— '.repeat(c.depth)}${name}` : name
}
