import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { InteractionChannel } from '../types/interactions'
import type { CrcDispositionCode } from '../types/chat'

export interface InteractionHistoryFilters {
  channel:       string
  status:        string
  agentId:       string
  dispositionId: string
  dateFrom:      string
  dateTo:        string
  phone:         string
  page:          number
  pageSize:      number
}

export interface InteractionHistoryItem {
  id: string
  channel: InteractionChannel
  status: string
  subject: string | null
  source_id: string | null
  queued_at: string
  assigned_at: string | null
  closed_at: string | null
  wrap_up_seconds: number | null
  internal_notes: string | null
  outcome: string | null
  customer_first_name: string | null
  customer_last_name: string | null
  customer_phone: string | null
  customer_email: string | null
  customer_number: string | null
  agent_first_name: string | null
  agent_last_name: string | null
  disposition_code: string | null
  disposition_name_fr: string | null
  disposition_name_ar: string | null
}

const DEFAULT_FILTERS: InteractionHistoryFilters = {
  channel: '', status: '', agentId: '', dispositionId: '',
  dateFrom: '', dateTo: '', phone: '', page: 1, pageSize: 20,
}

export function useInteractionHistory() {
  const [filters, setFiltersState] = useState<InteractionHistoryFilters>(DEFAULT_FILTERS)
  const [rows, setRows] = useState<InteractionHistoryItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchHistory = useCallback(async (overrides?: Partial<InteractionHistoryFilters>) => {
    const f = overrides ? { ...filters, ...overrides } : filters
    setLoading(true)
    setError(null)
    try {
      let q = supabase
        .from('interactions')
        .select(
          `id, channel, status, subject, source_id, queued_at, assigned_at, closed_at,
           wrap_up_seconds, internal_notes, outcome,
           customers!customer_id(first_name, last_name, phone, email, customer_number),
           profiles!assigned_agent_id(first_name, last_name),
           crc_disposition_codes!disposition_code_id(code, name_fr, name_ar)`,
          { count: 'exact' }
        )
        .in('status', ['closed', 'wrap_up', 'active', 'assigned', 'queued', 'offered'])
        .order('queued_at', { ascending: false })
        .range((f.page - 1) * f.pageSize, f.page * f.pageSize - 1)

      if (f.channel)       q = q.eq('channel', f.channel)
      if (f.status)        q = q.eq('status', f.status)
      if (f.agentId)       q = q.eq('assigned_agent_id', f.agentId)
      if (f.dispositionId) q = q.eq('disposition_code_id', f.dispositionId)
      if (f.dateFrom)      q = q.gte('queued_at', f.dateFrom)
      if (f.dateTo)        q = q.lte('queued_at', f.dateTo + 'T23:59:59')
      if (f.phone) {
        q = q.filter('customers.phone', 'ilike', `%${f.phone}%`)
      }

      const { data, error: err, count } = await q
      if (err) throw err

      const mapped: InteractionHistoryItem[] = (data ?? []).map((row: Record<string, unknown>) => {
        const c = row.customers as Record<string, string | null> | null
        const a = row.profiles  as Record<string, string | null> | null
        const d = row.crc_disposition_codes as Record<string, string | null> | null
        return {
          id:                   row.id as string,
          channel:              row.channel as InteractionChannel,
          status:               row.status as string,
          subject:              row.subject as string | null,
          source_id:            row.source_id as string | null,
          queued_at:            row.queued_at as string,
          assigned_at:          row.assigned_at as string | null,
          closed_at:            row.closed_at as string | null,
          wrap_up_seconds:      row.wrap_up_seconds as number | null,
          internal_notes:       row.internal_notes as string | null,
          outcome:              row.outcome as string | null,
          customer_first_name:  c?.first_name ?? null,
          customer_last_name:   c?.last_name  ?? null,
          customer_phone:       c?.phone      ?? null,
          customer_email:       c?.email      ?? null,
          customer_number:      c?.customer_number ?? null,
          agent_first_name:     a?.first_name ?? null,
          agent_last_name:      a?.last_name  ?? null,
          disposition_code:     d?.code        ?? null,
          disposition_name_fr:  d?.name_fr     ?? null,
          disposition_name_ar:  d?.name_ar     ?? null,
        }
      })

      setRows(mapped)
      setTotal(count ?? 0)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [filters])

  const setFilters = useCallback((partial: Partial<InteractionHistoryFilters>) => {
    setFiltersState(prev => {
      const next = { ...prev, ...partial }
      if (!('page' in partial)) next.page = 1
      return next
    })
  }, [])

  const resetFilters = useCallback(() => setFiltersState(DEFAULT_FILTERS), [])

  return { rows, total, filters, loading, error, setFilters, resetFilters, fetchHistory,
           pageSize: filters.pageSize }
}

export type { CrcDispositionCode }
