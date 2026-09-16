import { supabase } from './supabase'
import type { AgentDashboardEntry, SupervisionKpi, ConversationHistoryResult } from '../types/chat'

export type SupervisionPeriod = 'today' | '7days' | '30days' | 'custom'

export async function loadAgentsDashboard(): Promise<AgentDashboardEntry[]> {
  const { data, error } = await supabase.rpc('get_agents_dashboard')
  if (error) throw error
  return (data as AgentDashboardEntry[]) ?? []
}

export async function loadSupervisionKpis(params: {
  period?: SupervisionPeriod
  dateFrom?: string | null
  dateTo?: string | null
  agentId?: string | null
}): Promise<SupervisionKpi | null> {
  const { data, error } = await supabase.rpc('get_supervision_kpis', {
    p_period:    params.period    ?? 'today',
    p_date_from: params.dateFrom  ?? null,
    p_date_to:   params.dateTo    ?? null,
    p_agent_id:  params.agentId   ?? null,
  })
  if (error) throw error
  return (data as SupervisionKpi) ?? null
}

export async function loadConversationHistory(params: {
  status?:        string | null
  agentId?:       string | null
  dispositionId?: string | null
  dateFrom?:      string | null
  dateTo?:        string | null
  phone?:         string | null
  page?:          number
  pageSize?:      number
}): Promise<ConversationHistoryResult | null> {
  const { data, error } = await supabase.rpc('get_conversation_history', {
    p_status:          params.status         ?? null,
    p_agent_id:        params.agentId        ?? null,
    p_disposition_id:  params.dispositionId  ?? null,
    p_date_from:       params.dateFrom       ?? null,
    p_date_to:         params.dateTo         ?? null,
    p_phone:           params.phone          ?? null,
    p_page:            params.page           ?? 1,
    p_page_size:       params.pageSize       ?? 20,
  })
  if (error) throw error
  return (data as ConversationHistoryResult) ?? null
}
