import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
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
      const { data, error: err } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('display_order')
        .order('name_fr')
      if (cancelled) return
      if (err) {
        setError(err.message)
      } else {
        const all = (data ?? []) as Category[]
        // Une sous-catégorie dont la catégorie parente est inactive reste masquée.
        const activeIds = new Set(all.map(c => c.id))
        setCategories(all.filter(c => !c.parent_id || activeIds.has(c.parent_id)))
      }
      setLoading(false)
    }
    fetchCategories()
    return () => { cancelled = true }
  }, [])

  return { categories, loading, error }
}
