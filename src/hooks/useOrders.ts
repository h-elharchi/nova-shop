import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Order, OrderStatus } from '../types'

// Validation numéro marocain
export function validateMoroccanPhone(phone: string): boolean {
  const cleaned = phone.replace(/\s+/g, '')
  return /^(0[67]\d{8}|\+212[67]\d{8}|00212[67]\d{8})$/.test(cleaned)
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, '')
}

interface CreateOrderParams {
  productId: string
  firstName: string
  lastName: string
  phone: string
}

export function useCreateOrder() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const createOrder = useCallback(async (params: CreateOrderParams) => {
    setLoading(true)
    setError(null)
    setSuccess(false)

    // Récupérer le produit depuis Supabase pour avoir le vrai prix/nom
    const { data: product, error: productErr } = await supabase
      .from('products')
      .select('id, name_fr, name_ar, price, is_active')
      .eq('id', params.productId)
      .eq('is_active', true)
      .single()

    if (productErr || !product) {
      setError('Produit introuvable ou inactif.')
      setLoading(false)
      return false
    }

    const { error: insertErr } = await supabase.from('orders').insert({
      product_id: product.id,
      product_name: product.name_fr,
      product_price: product.price,
      customer_first_name: params.firstName.trim(),
      customer_last_name: params.lastName.trim(),
      customer_phone: normalizePhone(params.phone),
      status: 'new',
    })

    if (insertErr) {
      setError(insertErr.message)
      setLoading(false)
      return false
    }

    setSuccess(true)
    setLoading(false)
    return true
  }, [])

  const reset = useCallback(() => {
    setError(null)
    setSuccess(false)
  }, [])

  return { createOrder, loading, error, success, reset }
}

// Hook admin — liste des commandes
interface OrderFilters {
  status?: OrderStatus | ''
  search?: string
  dateFrom?: string  // 'YYYY-MM-DD', local timezone
  dateTo?: string    // 'YYYY-MM-DD', local timezone
}

export function useOrders(filters: OrderFilters = {}) {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError(null)

    let query = supabase
      .from('orders')
      .select('*, product:products(id,slug,name_fr,name_ar,images:product_images(image_url,display_order))')
      .order('created_at', { ascending: false })

    if (filters.status) {
      query = query.eq('status', filters.status)
    }

    if (filters.search && filters.search.trim()) {
      const s = `%${filters.search.trim()}%`
      query = query.or(
        `customer_first_name.ilike.${s},customer_last_name.ilike.${s},customer_phone.ilike.${s},product_name.ilike.${s}`
      )
    }

    if (filters.dateFrom) {
      const start = new Date(filters.dateFrom + 'T00:00:00')
      query = query.gte('created_at', start.toISOString())
    }

    if (filters.dateTo) {
      const end = new Date(filters.dateTo + 'T23:59:59.999')
      query = query.lte('created_at', end.toISOString())
    }

    const { data, error: err } = await query
    if (err) {
      setError(err.message)
    } else {
      setOrders(data ?? [])
    }
    setLoading(false)
  }, [filters.status, filters.search, filters.dateFrom, filters.dateTo])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  const updateStatus = async (id: string, status: OrderStatus) => {
    const { error: err } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id)
    if (!err) {
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o))
    }
    return !err
  }

  return { orders, loading, error, updateStatus, refetch: fetchOrders }
}

// Hook dashboard — stats commandes
export function useOrderStats() {
  const [stats, setStats] = useState({ new: 0, contacted: 0, confirmed: 0, completed: 0, cancelled: 0 })
  const [recent, setRecent] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('orders')
        .select('status, customer_first_name, customer_last_name, customer_phone, product_name, created_at, id')
        .order('created_at', { ascending: false })

      const all = (data ?? []) as Order[]
      setStats({
        new: all.filter(o => o.status === 'new').length,
        contacted: all.filter(o => o.status === 'contacted').length,
        confirmed: all.filter(o => o.status === 'confirmed').length,
        completed: all.filter(o => o.status === 'completed').length,
        cancelled: all.filter(o => o.status === 'cancelled').length,
      })
      setRecent(all.slice(0, 5))
      setLoading(false)
    }
    fetch()
  }, [])

  return { stats, recent, loading }
}
