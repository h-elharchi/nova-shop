import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { loadAgentsDashboard, loadSupervisionKpis, type SupervisionPeriod } from '../lib/supervision'
import type { AgentDashboardEntry, SupervisionKpi } from '../types/chat'

interface UseSupervisionOptions {
  period?: SupervisionPeriod
  dateFrom?: string | null
  dateTo?: string | null
  agentId?: string | null
}

interface UseSupervisionResult {
  agents: AgentDashboardEntry[]
  kpis: SupervisionKpi | null
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useSupervision(opts: UseSupervisionOptions = {}): UseSupervisionResult {
  const [agents, setAgents] = useState<AgentDashboardEntry[]>([])
  const [kpis, setKpis] = useState<SupervisionKpi | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const instanceId = useRef(`${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      const [agentsData, kpisData] = await Promise.all([
        loadAgentsDashboard(),
        loadSupervisionKpis({
          period:   opts.period   ?? 'today',
          dateFrom: opts.dateFrom ?? null,
          dateTo:   opts.dateTo   ?? null,
          agentId:  opts.agentId  ?? null,
        }),
      ])
      setAgents(agentsData)
      setKpis(kpisData)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [opts.period, opts.dateFrom, opts.dateTo, opts.agentId])

  useEffect(() => {
    setLoading(true)
    fetchAll()

    const channel = supabase
      .channel(`supervision-${instanceId.current}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_agents' }, () => {
        fetchAll()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'interactions' }, () => {
        fetchAll()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'interactions' }, () => {
        fetchAll()
      })
      .subscribe()
    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [fetchAll])

  return { agents, kpis, loading, error, refresh: fetchAll }
}
