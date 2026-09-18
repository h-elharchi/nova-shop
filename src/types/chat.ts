export type ChatConversationStatus = 'waiting' | 'active' | 'closed' | 'timeout'
export type ChatAgentStatus = 'offline' | 'available' | 'busy' | 'pause'
export type ChatSenderType = 'customer' | 'admin' | 'system'

export type ChatWidgetState =
  | 'idle'
  | 'form'
  | 'connecting'
  | 'searching'
  | 'waiting'
  | 'active'
  | 'closed'
  | 'timeout'
  | 'error'

export interface ChatConversation {
  id: string
  customer_user_id: string | null
  customer_first_name: string
  customer_last_name: string
  customer_phone: string
  customer_email: string | null
  status: ChatConversationStatus
  assigned_admin_id: string | null
  queue_position: number | null
  last_message_at: string | null
  created_at: string
  updated_at: string
  assigned_at: string | null
  closed_at: string | null
  closed_by: string | null
  disposition_code_id: string | null
  wrap_up_seconds: number | null
  internal_notes: string | null
  transferred_from_id: string | null
}

export interface ChatMessage {
  id: string
  conversation_id: string
  sender_type: ChatSenderType
  sender_id: string | null
  message: string
  created_at: string
}

export interface ChatAgent {
  id: string
  user_id: string
  status: ChatAgentStatus
  last_seen_at: string | null
  created_at: string
  updated_at: string
  capacity: number
  active_conversations_count: number
  pause_reason_id: string | null
  status_changed_at: string | null
}

export interface AgentsOnlineStatus {
  available_count: number
  busy_count: number
  has_capacity?: boolean
}

// ── CRC types ─────────────────────────────────────────────────────────────────

export interface CrcPauseReason {
  id: string
  name_fr: string
  name_ar: string
  is_active: boolean
  display_order: number
  created_at: string
}

export interface CrcDispositionCode {
  id: string
  code: string
  name_fr: string
  name_ar: string
  is_active: boolean
  display_order: number
  created_at: string
}

export interface CrcQuickReply {
  id: string
  title_fr: string
  title_ar: string
  message_fr: string
  message_ar: string
  shortcut: string | null
  is_active: boolean
  display_order: number
  created_at: string
}

export interface CrcSetting {
  id: string
  key: string
  value: unknown
  description: string | null
}

export interface WrapUpData {
  dispositionId: string | null
  notes: string
  wrapUpSeconds: number
}

// ── Supervision types ─────────────────────────────────────────────────────────

export interface AgentDashboardEntry {
  id: string
  user_id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  avatar_url: string | null
  status: ChatAgentStatus
  active_conversations_count: number
  capacity: number
  last_seen_at: string | null
  status_changed_at: string | null
  pause_reason_fr: string | null
  pause_reason_ar: string | null
  seconds_in_status: number
}

export interface DispositionStat {
  code: string
  name_fr: string
  name_ar: string
  cnt: number
}

export interface SupervisionKpi {
  total_received: number
  total_taken: number
  total_closed: number
  total_timeout: number
  total_waiting: number
  take_rate_pct: number | null
  avg_wait_seconds: number | null
  avg_handle_seconds: number | null
  service_level_pct: number | null
  service_level_threshold: number
  dispositions: DispositionStat[]
}

export interface ConversationHistoryItem {
  id: string
  customer_first_name: string
  customer_last_name: string
  customer_phone: string
  status: ChatConversationStatus
  assigned_admin_id: string | null
  created_at: string
  assigned_at: string | null
  closed_at: string | null
  wrap_up_seconds: number | null
  internal_notes: string | null
  disposition_code_id: string | null
  transferred_from_id: string | null
  agent_first_name: string | null
  agent_last_name: string | null
  disposition_code: string | null
  disposition_name_fr: string | null
  disposition_name_ar: string | null
}

export interface ConversationHistoryResult {
  total: number
  page: number
  page_size: number
  rows: ConversationHistoryItem[]
}

export interface ClientCard360 {
  conversations: Array<{
    id: string
    customer_first_name: string
    customer_last_name: string
    status: ChatConversationStatus
    assigned_admin_id: string | null
    created_at: string
    assigned_at: string | null
    closed_at: string | null
    disposition_code_id: string | null
    internal_notes: string | null
  }>
  orders: Array<{
    id: string
    product_name: string
    product_price: number
    status: string
    created_at: string
    updated_at: string
  }>
}
