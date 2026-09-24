import { useState, useEffect } from 'react'
import { loadCategories, flattenCategoryTree } from '../lib/categories'
import type { Category } from '../types'

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchCategories() {
      setLoading(true)
      setError(null)
      const { data, error: err } = await loadCategories(true)
      if (cancelled) return
      if (err) {
        setError(err)
      } else {
        // Seules les catégories joignables depuis le premier niveau via des parents actifs
        // restent visibles : une sous-catégorie dont tous les parents sont inactifs est masquée.
        const reachable = new Set(flattenCategoryTree(data, true).map(c => c.id))
        setCategories(data.filter(c => reachable.has(c.id)))
      }
      setLoading(false)
    }
    fetchCategories()
    return () => { cancelled = true }
  }, [])

  return { categories, loading, error }
}
