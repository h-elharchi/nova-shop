import { useState, useCallback } from 'react'
import { loadConversationHistory } from '../lib/supervision'
import type { ConversationHistoryItem, ConversationHistoryResult } from '../types/chat'

export interface HistoryFilters {
  status:        string
  agentId:       string
  dispositionId: string
  dateFrom:      string
  dateTo:        string
  phone:         string
  page:          number
  pageSize:      number
}

const DEFAULT_FILTERS: HistoryFilters = {
  status:        '',
  agentId:       '',
  dispositionId: '',
  dateFrom:      '',
  dateTo:        '',
  phone:         '',
  page:          1,
  pageSize:      20,
}

interface UseConversationHistoryResult {
  rows: ConversationHistoryItem[]
  total: number
  page: number
  pageSize: number
  filters: HistoryFilters
  loading: boolean
  error: string | null
  setFilters: (f: Partial<HistoryFilters>) => void
  resetFilters: () => void
  fetchHistory: (f?: Partial<HistoryFilters>) => void
}

export function useConversationHistory(): UseConversationHistoryResult {
  const [filters, setFiltersState] = useState<HistoryFilters>(DEFAULT_FILTERS)
  const [result, setResult] = useState<ConversationHistoryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchHistory = useCallback(async (overrides?: Partial<HistoryFilters>) => {
    const f = overrides ? { ...filters, ...overrides } : filters
    setLoading(true)
    setError(null)
    try {
      const data = await loadConversationHistory({
        status:        f.status        || null,
        agentId:       f.agentId       || null,
        dispositionId: f.dispositionId || null,
        dateFrom:      f.dateFrom      || null,
        dateTo:        f.dateTo        || null,
        phone:         f.phone         || null,
        page:          f.page,
        pageSize:      f.pageSize,
      })
      setResult(data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [filters])

  const setFilters = useCallback((partial: Partial<HistoryFilters>) => {
    setFiltersState(prev => {
      const next = { ...prev, ...partial }
      if (!('page' in partial)) next.page = 1
      return next
    })
  }, [])

  const resetFilters = useCallback(() => {
    setFiltersState(DEFAULT_FILTERS)
  }, [])

  return {
    rows:     result?.rows      ?? [],
    total:    result?.total     ?? 0,
    page:     result?.page      ?? 1,
    pageSize: result?.page_size ?? 20,
    filters,
    loading,
    error,
    setFilters,
    resetFilters,
    fetchHistory,
  }
}
