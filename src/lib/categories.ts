import type { Category } from '../types'

export type CategoryWithDepth = Category & { depth: 0 | 1 }

function bySiblingOrder(a: Category, b: Category) {
  return a.display_order - b.display_order || a.name_fr.localeCompare(b.name_fr)
}

export function getTopLevel(categories: Category[]): Category[] {
  return categories.filter(c => !c.parent_id).sort(bySiblingOrder)
}

export function getChildren(categories: Category[], parentId: string): Category[] {
  return categories.filter(c => c.parent_id === parentId).sort(bySiblingOrder)
}

// Liste à plat dans l'ordre d'affichage : chaque catégorie suivie de ses sous-catégories.
export function flattenCategoryTree(categories: Category[]): CategoryWithDepth[] {
  const out: CategoryWithDepth[] = []
  for (const parent of getTopLevel(categories)) {
    out.push({ ...parent, depth: 0 })
    for (const child of getChildren(categories, parent.id)) {
      out.push({ ...child, depth: 1 })
    }
  }
  return out
}

// Libellé d'option de liste déroulante, indenté pour les sous-catégories.
export function categoryOptionLabel(c: CategoryWithDepth, lang: 'fr' | 'ar' | 'both' = 'fr'): string {
  const name = lang === 'ar' ? c.name_ar : lang === 'both' ? `${c.name_fr} / ${c.name_ar}` : c.name_fr
  return c.depth === 1 ? `— ${name}` : name
}
