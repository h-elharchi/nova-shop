import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { InteractionWithDetails, InteractionChannel, InteractionStatus } from '../types/interactions'

export interface InteractionFilters {
  channel?: InteractionChannel | 'all'
  status?: InteractionStatus | 'open' | 'closed'
  agentId?: string | null
  customerId?: string | null
  search?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}

const OPEN_STATUSES: InteractionStatus[] = [
  'queued', 'offered', 'assigned', 'active', 'pending_customer', 'scheduled', 'wrap_up'
]
const CLOSED_STATUSES: InteractionStatus[] = ['closed', 'abandoned', 'timeout', 'failed']

export function useInteractions(filters: InteractionFilters = {}) {
  const [interactions, setInteractions] = useState<InteractionWithDetails[]>([])
  const [total, setTotal]               = useState(0)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const instanceId = useRef(`${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
  const mounted    = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [])

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)

    const page     = filters.page     ?? 1
    const pageSize = filters.pageSize ?? 25
    const from     = (page - 1) * pageSize
    const to       = from + pageSize - 1

    let query = supabase
      .from('interactions')
      .select(`
        *,
        customers!customer_id (
          first_name, last_name, phone, email, customer_number
        ),
        profiles!assigned_agent_id (
          first_name, last_name
        ),
        crc_disposition_codes!disposition_code_id (
          code, name_fr, name_ar
        )
      `, { count: 'exact' })
      .order('queued_at', { ascending: false })
      .range(from, to)

    if (filters.channel && filters.channel !== 'all') {
      query = query.eq('channel', filters.channel)
    }
    if (filters.status === 'open') {
      query = query.in('status', OPEN_STATUSES)
    } else if (filters.status === 'closed') {
      query = query.in('status', CLOSED_STATUSES)
    } else if (filters.status) {
      query = query.eq('status', filters.status)
    }
    if (filters.agentId) {
      query = query.eq('assigned_agent_id', filters.agentId)
    }
    if (filters.customerId) {
      query = query.eq('customer_id', filters.customerId)
    }
    if (filters.dateFrom) {
      query = query.gte('queued_at', filters.dateFrom)
    }
    if (filters.dateTo) {
      query = query.lte('queued_at', filters.dateTo)
    }

    const { data, error: err, count } = await query

    if (!mounted.current) return
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    const mapped: InteractionWithDetails[] = (data ?? []).map((row: Record<string, unknown>) => {
      const customer = row.customers as Record<string, string | null> | null
      const agent    = row.profiles as Record<string, string | null> | null
      const disp     = row.crc_disposition_codes as Record<string, string | null> | null
      return {
        ...(row as unknown as InteractionWithDetails),
        customer_first_name: customer?.first_name ?? null,
        customer_last_name:  customer?.last_name  ?? null,
        customer_phone:      customer?.phone       ?? null,
        customer_email:      customer?.email       ?? null,
        customer_number:     customer?.customer_number ?? null,
        agent_first_name:    agent?.first_name     ?? null,
        agent_last_name:     agent?.last_name      ?? null,
        disposition_code:    disp?.code            ?? null,
        disposition_name_fr: disp?.name_fr         ?? null,
        disposition_name_ar: disp?.name_ar         ?? null,
      }
    })

    setInteractions(mapped)
    setTotal(count ?? 0)
    setLoading(false)
  }, [
    filters.channel,
    filters.status,
    filters.agentId,
    filters.customerId,
    filters.search,
    filters.dateFrom,
    filters.dateTo,
    filters.page,
    filters.pageSize,
  ])

  useEffect(() => { fetch() }, [fetch])

  // Realtime
  useEffect(() => {
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    const channel = supabase
      .channel(`interactions-list-${instanceId.current}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interactions' }, () => {
        if (mounted.current) fetch()
      })
      .subscribe()
    channelRef.current = channel
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [fetch])

  const acceptOffer = useCallback(async (interactionId: string) => {
    const { error: err } = await supabase.rpc('accept_interaction_offer', {
      p_interaction_id: interactionId,
    })
    if (!err) await fetch()
    return !err
  }, [fetch])

  const rejectOffer = useCallback(async (interactionId: string) => {
    const { error: err } = await supabase.rpc('reject_interaction_offer', {
      p_interaction_id: interactionId,
    })
    if (!err) await fetch()
    return !err
  }, [fetch])

  const takeNext = useCallback(async (channel?: InteractionChannel) => {
    const { error: err } = await supabase.rpc('take_next_interaction', {
      p_channel: channel ?? null,
    })
    if (!err) await fetch()
    return !err
  }, [fetch])

  return {
    interactions,
    total,
    loading,
    error,
    refetch: fetch,
    acceptOffer,
    rejectOffer,
    takeNext,
  }
}

// ─── Hook : interactions actives de l'agent connecté ─────────

export function useMyInteractions(agentId: string | null) {
  const [mine, setMine]         = useState<InteractionWithDetails[]>([])
  const [offered, setOffered]   = useState<InteractionWithDetails[]>([])
  const [loading, setLoading]   = useState(true)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const instanceId = useRef(`${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
  const mounted    = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [])

  const fetch = useCallback(async () => {
    if (!agentId) return
    setLoading(true)

    const { data: mineData } = await supabase
      .from('interactions')
      .select(`
        *,
        customers!customer_id (first_name, last_name, phone, email, customer_number),
        crc_disposition_codes!disposition_code_id (code, name_fr, name_ar)
      `)
      .eq('assigned_agent_id', agentId)
      .in('status', ['assigned', 'active', 'pending_customer', 'wrap_up'])
      .order('assigned_at', { ascending: true })

    const { data: offeredData } = await supabase
      .from('interactions')
      .select(`
        *,
        customers!customer_id (first_name, last_name, phone, email, customer_number)
      `)
      .eq('offered_to', agentId)
      .eq('status', 'offered')
      .gt('offer_expires_at', new Date().toISOString())

    if (!mounted.current) return

    const mapRow = (row: Record<string, unknown>): InteractionWithDetails => {
      const c = row.customers as Record<string, string | null> | null
      const d = row.crc_disposition_codes as Record<string, string | null> | null
      return {
        ...(row as unknown as InteractionWithDetails),
        customer_first_name: c?.first_name ?? null,
        customer_last_name:  c?.last_name  ?? null,
        customer_phone:      c?.phone       ?? null,
        customer_email:      c?.email       ?? null,
        customer_number:     c?.customer_number ?? null,
        agent_first_name:    null,
        agent_last_name:     null,
        disposition_code:    d?.code        ?? null,
        disposition_name_fr: d?.name_fr     ?? null,
        disposition_name_ar: d?.name_ar     ?? null,
      }
    }

    setMine((mineData ?? []).map(mapRow))
    setOffered((offeredData ?? []).map(mapRow))
    setLoading(false)
  }, [agentId])

  useEffect(() => { fetch() }, [fetch])

  useEffect(() => {
    if (!agentId) return
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    const channel = supabase
      .channel(`my-interactions-${instanceId.current}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interactions' }, () => {
        if (mounted.current) fetch()
      })
      .subscribe()
    channelRef.current = channel
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [agentId, fetch])

  return { mine, offered, loading, refetch: fetch }
}
