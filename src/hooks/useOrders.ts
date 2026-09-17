import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Order, OrderStatus, OrderChannel } from '../types'

export function validateMoroccanPhone(phone: string): boolean {
  const cleaned = phone.replace(/\s+/g, '')
  return /^(0[67]\d{8}|\+212[67]\d{8}|00212[67]\d{8})$/.test(cleaned)
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, '')
}

// ─── Création commande publique (depuis le site) ───────────────

interface CreateOrderParams {
  productId: string
  firstName: string
  lastName: string
  phone: string
  email?: string
  deliveryCity?: string
  deliveryAddress?: string
  deliveryDistrict?: string
  deliveryLandmark?: string
}

export function useCreateOrder() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const createOrder = useCallback(async (params: CreateOrderParams) => {
    setLoading(true)
    setError(null)
    setSuccess(false)

    const { data: product, error: productErr } = await supabase
      .from('products')
      .select('id, name_fr, price, is_active')
      .eq('id', params.productId)
      .eq('is_active', true)
      .single()

    if (productErr || !product) {
      setError('Produit introuvable ou inactif.')
      setLoading(false)
      return false
    }

    const { error: insertErr } = await supabase.from('orders').insert({
      product_id:           product.id,
      product_name:         product.name_fr,
      product_price:        product.price,
      customer_first_name:  params.firstName.trim(),
      customer_last_name:   params.lastName.trim(),
      customer_phone:       normalizePhone(params.phone),
      customer_email:       params.email?.trim() || null,
      channel:              'site',
      status:               'new',
      delivery_city:        params.deliveryCity?.trim() || null,
      delivery_address:     params.deliveryAddress?.trim() || null,
      delivery_district:    params.deliveryDistrict?.trim() || null,
      delivery_landmark:    params.deliveryLandmark?.trim() || null,
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

  const reset = useCallback(() => { setError(null); setSuccess(false) }, [])

  return { createOrder, loading, error, success, reset }
}

// ─── Création commande admin (multi-canal, via RPC) ───────────

interface CreateOrderAdminParams {
  productId: string
  channel: OrderChannel
  firstName: string
  lastName: string
  phone: string
  email?: string
  deliveryCity?: string
  deliveryAddress?: string
  deliveryDistrict?: string
  deliveryLandmark?: string
  notes?: string
  callbackAt?: string
}

export function useCreateOrderAdmin() {
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const createOrder = useCallback(async (params: CreateOrderAdminParams): Promise<Order | null> => {
    setLoading(true)
    setError(null)

    const { data, error: rpcErr } = await supabase.rpc('create_order_admin', {
      p_product_id:        params.productId,
      p_channel:           params.channel,
      p_first_name:        params.firstName.trim(),
      p_last_name:         params.lastName.trim(),
      p_phone:             normalizePhone(params.phone),
      p_email:             params.email?.trim() || null,
      p_delivery_city:     params.deliveryCity?.trim() || null,
      p_delivery_address:  params.deliveryAddress?.trim() || null,
      p_delivery_district: params.deliveryDistrict?.trim() || null,
      p_delivery_landmark: params.deliveryLandmark?.trim() || null,
      p_notes:             params.notes?.trim() || null,
      p_callback_at:       params.callbackAt || null,
    })

    if (rpcErr) {
      setError(rpcErr.message)
      setLoading(false)
      return null
    }

    setLoading(false)
    return (data as Order[] | null)?.[0] ?? null
  }, [])

  return { createOrder, loading, error }
}

// ─── Liste commandes admin ────────────────────────────────────

interface OrderFilters {
  status?:   OrderStatus | ''
  channel?:  OrderChannel | ''
  agentId?:  string
  search?:   string
  city?:     string
  dateFrom?: string
  dateTo?:   string
}

export function useOrders(filters: OrderFilters = {}) {
  const [orders, setOrders]   = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError(null)

    let query = supabase
      .from('orders')
      .select('*, product:products(id,slug,name_fr,name_ar,images:product_images(image_url,display_order))')
      .order('created_at', { ascending: false })

    if (filters.status)  query = query.eq('status',  filters.status)
    if (filters.channel) query = query.eq('channel', filters.channel)
    if (filters.agentId) query = query.eq('assigned_agent_id', filters.agentId)
    if (filters.city?.trim()) query = query.ilike('delivery_city', `%${filters.city.trim()}%`)

    if (filters.search?.trim()) {
      const s = `%${filters.search.trim()}%`
      query = query.or(
        `customer_first_name.ilike.${s},customer_last_name.ilike.${s},customer_phone.ilike.${s},product_name.ilike.${s}`
      )
    }

    if (filters.dateFrom) {
      query = query.gte('created_at', new Date(filters.dateFrom + 'T00:00:00').toISOString())
    }
    if (filters.dateTo) {
      query = query.lte('created_at', new Date(filters.dateTo + 'T23:59:59.999').toISOString())
    }

    const { data, error: err } = await query
    if (err) {
      setError(err.message)
    } else {
      setOrders((data ?? []) as Order[])
    }
    setLoading(false)
  }, [filters.status, filters.channel, filters.agentId, filters.search, filters.city, filters.dateFrom, filters.dateTo])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  const updateStatus = async (id: string, status: OrderStatus) => {
    const { error: err } = await supabase.from('orders').update({ status }).eq('id', id)
    if (!err) setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o))
    return !err
  }

  const updateNotes = async (id: string, notes: string) => {
    const { error: err } = await supabase.from('orders').update({ notes }).eq('id', id)
    if (!err) setOrders(prev => prev.map(o => o.id === id ? { ...o, notes } : o))
    return !err
  }

  return { orders, loading, error, updateStatus, updateNotes, refetch: fetchOrders }
}

// ─── Stats dashboard ──────────────────────────────────────────

export function useOrderStats() {
  const [stats, setStats] = useState({
    new: 0, pending: 0, confirmed: 0, delivered: 0, cancelled: 0,
    // Legacy keys gardés pour compatibilité dashboard existant
    contacted: 0, completed: 0,
  })
  const [recent, setRecent]   = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('orders')
        .select('status, customer_first_name, customer_last_name, customer_phone, product_name, created_at, id')
        .order('created_at', { ascending: false })

      const all = (data ?? []) as Order[]
      setStats({
        new:       all.filter(o => o.status === 'new').length,
        pending:   all.filter(o => ['assigned','contacted','unreachable','callback','on_hold'].includes(o.status)).length,
        confirmed: all.filter(o => ['confirmed','processing','shipped'].includes(o.status)).length,
        delivered: all.filter(o => o.status === 'delivered').length,
        cancelled: all.filter(o => ['cancelled','returned'].includes(o.status)).length,
        // Legacy
        contacted: all.filter(o => o.status === 'contacted').length,
        completed: all.filter(o => o.status === 'delivered').length,
      })
      setRecent(all.slice(0, 5))
      setLoading(false)
    }
    fetch()
  }, [])

  return { stats, recent, loading }
}
