import { supabase } from './supabase'
import type { ChatConversation, ChatMessage, AgentsOnlineStatus } from '../types/chat'

const CHAT_SESSION_KEY = 'nova-chat-session'

// ── Session locale ────────────────────────────────────────────────────────────

export function saveChatSession(conversationId: string) {
  try { sessionStorage.setItem(CHAT_SESSION_KEY, conversationId) } catch { /* noop */ }
}

export function loadChatSession(): string | null {
  try { return sessionStorage.getItem(CHAT_SESSION_KEY) } catch { return null }
}

export function clearChatSession() {
  try { sessionStorage.removeItem(CHAT_SESSION_KEY) } catch { /* noop */ }
}

// ── Auth anonyme ──────────────────────────────────────────────────────────────

export async function ensureAnonAuth(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) return session.user.id

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error || !data.user) return null
  return data.user.id
}

// ── Conversation ──────────────────────────────────────────────────────────────

export async function createConversation(params: {
  firstName: string
  lastName: string
  phone: string
}): Promise<ChatConversation | null> {
  const userId = await ensureAnonAuth()
  if (!userId) return null

  const { data, error } = await supabase
    .from('chat_conversations')
    .insert({
      customer_user_id: userId,
      customer_first_name: params.firstName.trim(),
      customer_last_name: params.lastName.trim(),
      customer_phone: params.phone.replace(/\s+/g, ''),
      status: 'waiting',
    })
    .select()
    .single()

  if (error || !data) return null
  return data as ChatConversation
}

export async function getConversation(id: string): Promise<ChatConversation | null> {
  const { data, error } = await supabase
    .from('chat_conversations')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !data) return null
  return data as ChatConversation
}

// ── Agents en ligne ───────────────────────────────────────────────────────────

export async function checkAgentsOnline(): Promise<AgentsOnlineStatus> {
  const { data, error } = await supabase.rpc('check_agents_online')
  if (error || !data || !data[0]) return { available_count: 0, busy_count: 0 }
  return {
    available_count: data[0].available_count ?? 0,
    busy_count: data[0].busy_count ?? 0,
  }
}

// ── Assignment ────────────────────────────────────────────────────────────────

export async function assignToAvailableAdmin(conversationId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('assign_to_available_admin', {
    p_conversation_id: conversationId,
  })
  if (error) return false
  return data === true
}

export async function timeoutConversation(conversationId: string): Promise<void> {
  await supabase.rpc('timeout_conversation', { p_conversation_id: conversationId })
}

// ── Messages ──────────────────────────────────────────────────────────────────

export async function loadMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error || !data) return []
  return data as ChatMessage[]
}

export async function sendMessage(params: {
  conversationId: string
  message: string
  senderType: 'customer' | 'admin'
  senderId?: string
}): Promise<ChatMessage | null> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      conversation_id: params.conversationId,
      sender_type: params.senderType,
      sender_id: params.senderId ?? null,
      message: params.message.trim(),
    })
    .select()
    .single()
  if (error || !data) return null
  return data as ChatMessage
}

// ── Admin functions ───────────────────────────────────────────────────────────

export async function ensureChatAgent(): Promise<void> {
  await supabase.rpc('ensure_chat_agent')
}

export async function updateAgentHeartbeat(status?: 'offline' | 'available' | 'busy'): Promise<void> {
  await supabase.rpc('update_agent_heartbeat', { p_status: status ?? null })
}

export async function claimConversation(conversationId: string): Promise<ChatConversation | null> {
  const { data, error } = await supabase.rpc('claim_conversation', {
    p_conversation_id: conversationId,
  })
  if (error || !data) return null
  return data as ChatConversation
}

export async function closeConversation(conversationId: string): Promise<void> {
  await supabase.rpc('close_conversation', { p_conversation_id: conversationId })
}

export async function loadAdminConversations(filter: {
  status?: string
  dateFrom?: string
  dateTo?: string
} = {}): Promise<ChatConversation[]> {
  let query = supabase
    .from('chat_conversations')
    .select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (filter.status) query = query.eq('status', filter.status)
  if (filter.dateFrom) query = query.gte('created_at', new Date(filter.dateFrom + 'T00:00:00').toISOString())
  if (filter.dateTo)   query = query.lte('created_at', new Date(filter.dateTo + 'T23:59:59.999').toISOString())

  const { data, error } = await query
  if (error || !data) return []
  return data as ChatConversation[]
}

// ── Formatters ────────────────────────────────────────────────────────────────

export function formatMessageTime(isoString: string): string {
  const d = new Date(isoString)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function formatConversationDate(isoString: string, tFn: (k: string) => string): string {
  const d = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffH = Math.floor(diffMs / 3600000)

  if (diffMin < 1) return tFn('chat.ago_just_now')
  if (diffMin < 60) return tFn('chat.ago_minutes').replace('{n}', String(diffMin))
  if (diffH < 24) return tFn('chat.ago_hours').replace('{n}', String(diffH))

  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (d.toDateString() === today.toDateString()) return tFn('chat.today')
  if (d.toDateString() === yesterday.toDateString()) return tFn('chat.yesterday')
  return d.toLocaleDateString()
}
