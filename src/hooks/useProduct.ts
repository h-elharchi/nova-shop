import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Product } from '../types'

export function useProduct(slug: string) {
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    let cancelled = false

    async function fetchProduct() {
      setLoading(true)
      setError(null)

      const { data, error: err } = await supabase
        .from('products')
        .select(`
          *,
          category:categories(*),
          images:product_images(*),
          videos:product_videos(*)
        `)
        .eq('slug', slug)
        .eq('is_active', true)
        .single()

      if (cancelled) return

      if (err) {
        setError(err.message)
      } else {
        const p = data as Product
        if (p && Array.isArray(p.images)) {
          p.images = [...p.images].sort((a, b) => a.display_order - b.display_order)
        }
        if (p && Array.isArray(p.videos)) {
          p.videos = [...p.videos].sort((a, b) => a.display_order - b.display_order)
        }
        setProduct(p)
      }
      setLoading(false)
    }

    fetchProduct()
    return () => { cancelled = true }
  }, [slug])

  return { product, loading, error }
}
