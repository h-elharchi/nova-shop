export type ChatConversationStatus = 'waiting' | 'active' | 'closed' | 'timeout'
export type ChatAgentStatus = 'offline' | 'available' | 'busy'
export type ChatSenderType = 'customer' | 'admin' | 'system'

export type ChatWidgetState =
  | 'idle'
  | 'form'
  | 'connecting'
  | 'searching'   // 30s countdown, no admin online
  | 'waiting'     // in queue, admins busy
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
  status: ChatConversationStatus
  assigned_admin_id: string | null
  queue_position: number | null
  last_message_at: string | null
  created_at: string
  assigned_at: string | null
  closed_at: string | null
  updated_at: string
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
}

export interface AgentsOnlineStatus {
  available_count: number
  busy_count: number
}
