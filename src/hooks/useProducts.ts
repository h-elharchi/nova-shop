import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Product, ProductFilters } from '../types'

export function useProducts(filters: ProductFilters = {}) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { categorySlug, search, sortByPrice, onlyAvailable } = filters

  useEffect(() => {
    let cancelled = false
    async function fetchProducts() {
      setLoading(true)
      setError(null)

      let query = supabase
        .from('products')
        .select(`
          *,
          category:categories(*),
          images:product_images(*)
        `)
        .eq('is_active', true)
        .order('display_order', { ascending: true })

      if (onlyAvailable) {
        query = query.eq('stock_available', true)
      }

      if (search && search.trim()) {
        const s = `%${search.trim()}%`
        query = query.or(`name_fr.ilike.${s},name_ar.ilike.${s}`)
      }

      if (sortByPrice) {
        query = query.order('price', { ascending: sortByPrice === 'asc' })
      }

      const { data, error: err } = await query

      if (cancelled) return

      if (err) {
        console.error('[useProducts] Supabase error:', err)
        setError(`${err.message} (code: ${err.code})`)
        setLoading(false)
        return
      }

      let result: Product[] = (data ?? []).map((p: Product) => ({
        ...p,
        images: Array.isArray(p.images)
          ? [...p.images].sort((a, b) => a.display_order - b.display_order)
          : [],
      }))

      if (categorySlug) {
        // Une catégorie parente inclut aussi les produits de ses sous-catégories.
        const { data: cats } = await supabase.from('categories').select('*')
        if (cancelled) return
        const all = (cats ?? []) as { id: string; slug: string; parent_id: string | null }[]
        const selected = all.find(c => c.slug === categorySlug)
        const allowed = new Set<string>([categorySlug])
        if (selected) all.filter(c => c.parent_id === selected.id).forEach(c => allowed.add(c.slug))
        result = result.filter((p) => p.category?.slug && allowed.has(p.category.slug))
      }

      setProducts(result)
      setLoading(false)
    }

    fetchProducts()
    return () => { cancelled = true }
  }, [categorySlug, search, sortByPrice, onlyAvailable])

  return { products, loading, error }
}
