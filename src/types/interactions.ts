// ─── Interactions unifiées ────────────────────────────────────

export type InteractionChannel = 'chat' | 'email' | 'callback'

export type InteractionStatus =
  | 'queued'
  | 'offered'
  | 'assigned'
  | 'active'
  | 'pending_customer'
  | 'scheduled'
  | 'wrap_up'
  | 'closed'
  | 'abandoned'
  | 'timeout'
  | 'failed'

export type InteractionOutcome = 'treated' | 'not_treated'

export interface Interaction {
  id: string
  interaction_number: string
  channel: InteractionChannel
  origin_channel: string | null
  customer_id: string | null
  subject: string | null
  priority: number
  status: InteractionStatus
  queued_at: string
  due_at: string | null
  offered_to: string | null
  offered_at: string | null
  offer_expires_at: string | null
  assigned_agent_id: string | null
  assigned_at: string | null
  first_response_at: string | null
  closed_at: string | null
  closed_by: string | null
  outcome: InteractionOutcome | null
  disposition_code_id: string | null
  wrap_up_notes: string | null
  wrap_up_started_at: string | null
  wrap_up_seconds: number | null
  created_at: string
  updated_at: string
}

export interface InteractionWithDetails extends Interaction {
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

export interface InteractionEvent {
  id: string
  interaction_id: string
  event_type: string
  actor_id: string | null
  data: Record<string, unknown> | null
  created_at: string
}

// ─── Email threads ────────────────────────────────────────────

export interface EmailThread {
  id: string
  gmail_thread_id: string
  email_account_id: string | null
  subject: string | null
  from_address: string | null
  last_message_at: string | null
  created_at: string
}

// ─── Rappels ──────────────────────────────────────────────────

export type CallbackPreferredSlot = 'asap' | 'scheduled'
export type CallbackAttemptResult =
  | 'reached'
  | 'no_answer'
  | 'busy'
  | 'voicemail'
  | 'wrong_number'
  | 'callback_later'

export interface CallbackRequest {
  id: string
  interaction_id: string | null
  customer_id: string | null
  first_name: string
  last_name: string
  phone: string
  email: string | null
  city: string | null
  district: string | null
  address: string | null
  landmark: string | null
  message: string | null
  preferred_slot: CallbackPreferredSlot
  preferred_datetime: string | null
  origin_conversation_id: string | null
  attempts_count: number
  max_attempts: number
  created_at: string
}

export interface CallbackAttempt {
  id: string
  callback_request_id: string
  agent_id: string | null
  attempted_at: string
  result: CallbackAttemptResult
  next_attempt_at: string | null
  comment: string | null
}

// ─── Capacités agent ──────────────────────────────────────────

export interface AgentChannelCapacity {
  id: string
  agent_id: string
  channel: InteractionChannel
  max_capacity: number
  is_enabled: boolean
  created_at: string
}

// ─── Clients étendus ──────────────────────────────────────────

export type CustomerStatus = 'active' | 'archived' | 'blocked' | 'merged' | 'anonymized'

export interface CustomerV2 {
  id: string
  phone: string
  first_name: string
  last_name: string
  email: string | null
  notes: string | null
  source: string
  // v2 fields
  status: CustomerStatus
  customer_number: string | null
  phone2: string | null
  whatsapp_phone: string | null
  email2: string | null
  preferred_lang: 'fr' | 'ar'
  tags: string[]
  archived_at: string | null
  archived_by: string | null
  archive_reason: string | null
  anonymized_at: string | null
  merged_into: string | null
  version: number
  created_at: string
  updated_at: string
}

export interface CustomerView extends CustomerV2 {
  order_count: number
  interaction_count: number
  last_order_at: string | null
  last_interaction_at: string | null
  default_city: string | null
}

export interface CustomerAddress {
  id: string
  customer_id: string
  label: string
  city: string | null
  district: string | null
  address: string | null
  landmark: string | null
  is_default: boolean
  created_at: string
  updated_at: string
}

// ─── Audit log ────────────────────────────────────────────────

export interface AuditLogEntry {
  action: string
  actor_email: string | null
  reason: string | null
  created_at: string
}

// ─── Workspace Agent ──────────────────────────────────────────

export interface WorkspaceInteraction extends InteractionWithDetails {
  // Chat-specific
  chat_conversation_id?: string | null
  chat_conversation_status?: string | null
  // Email-specific
  email_thread_id?: string | null
  email_thread_from?: string | null
  latest_message_preview?: string | null
  unread_count?: number
  // Callback-specific
  callback_request_id?: string | null
  callback_phone?: string | null
  callback_city?: string | null
}

export interface AgentWithCapacity {
  agent_id: string
  user_id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  avatar_url: string | null
  status: string
  chat_active: number
  chat_capacity: number
  email_active: number
  email_capacity: number
  callback_active: number
  callback_capacity: number
  last_seen_at: string | null
}

export interface Interaction360 {
  interaction: Interaction
  customer: CustomerV2 | null
  events: InteractionEvent[]
  chat_messages: Array<{
    id: string
    sender_type: string
    message: string
    created_at: string
  }>
  email_messages: Array<{
    id: string
    direction: string
    subject: string | null
    from_address: string
    body_text: string | null
    received_at: string
  }>
  callback_request: CallbackRequest | null
  callback_attempts: CallbackAttempt[]
}

// ─── WrapUp unifié ────────────────────────────────────────────

export type WrapUpContinuation = 'reschedule' | 'requeue' | 'close'

export interface UnifiedWrapUpData {
  outcome: InteractionOutcome
  dispositionId: string | null
  notes: string
  continuation: WrapUpContinuation
  rescheduleAt: string | null
}
