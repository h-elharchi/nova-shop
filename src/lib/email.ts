import { supabase } from './supabase'
import type { EmailAccount, EmailMessage, EmailStatus } from '../types'

// ─── Comptes email ─────────────────────────────────────────────

export async function loadEmailAccounts(): Promise<EmailAccount[]> {
  const { data, error } = await supabase
    .from('email_accounts')
    .select('id, label, gmail_address, is_active, last_sync_at, created_at')
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as EmailAccount[]
}

export async function disconnectEmailAccount(accountId: string): Promise<void> {
  const { error } = await supabase
    .from('email_accounts')
    .update({ is_active: false, vault_refresh_token: null })
    .eq('id', accountId)
  if (error) throw new Error(error.message)
}

// ─── OAuth2 — récupérer l'URL de connexion ────────────────────

export async function getGmailAuthUrl(label: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated')

  const { data, error } = await supabase.functions.invoke('gmail-oauth-callback', {
    body: { action: 'get_auth_url', label },
    headers: { Authorization: `Bearer ${session.access_token}` },
  })

  if (error) throw new Error(error.message)
  return (data as { url: string }).url
}

// ─── Sync manuelle ────────────────────────────────────────────

export async function triggerEmailSync(): Promise<{ synced: number; accounts: number }> {
  const { data: { session } } = await supabase.auth.getSession()
  const { data, error } = await supabase.functions.invoke('gmail-sync', {
    body: {},
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
  })
  if (error) throw new Error(error.message)
  return data as { synced: number; accounts: number }
}

// ─── Messages ─────────────────────────────────────────────────

export interface EmailFilters {
  status?: EmailStatus | ''
  accountId?: string
  search?: string
}

export async function loadEmailMessages(filters: EmailFilters = {}): Promise<EmailMessage[]> {
  let query = supabase
    .from('email_messages_view')
    .select('*')
    .eq('direction', 'in')
    .order('received_at', { ascending: false })
    .limit(200)

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.accountId) query = query.eq('email_account_id', filters.accountId)
  if (filters.search?.trim()) {
    const s = `%${filters.search.trim()}%`
    query = query.or(`from_address.ilike.${s},subject.ilike.${s}`)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as EmailMessage[]
}

export async function updateEmailStatus(messageId: string, status: EmailStatus): Promise<void> {
  const { error } = await supabase
    .from('email_messages')
    .update({ status })
    .eq('id', messageId)
  if (error) throw new Error(error.message)
}

export async function linkEmailToCustomer(messageId: string, customerId: string): Promise<void> {
  const { error } = await supabase
    .from('email_messages')
    .update({ customer_id: customerId })
    .eq('id', messageId)
  if (error) throw new Error(error.message)
}

// ─── Envoi d'email ────────────────────────────────────────────

export interface SendEmailParams {
  email_account_id: string
  to: string
  subject: string
  body_text: string
  reply_to_message_id?: string
  gmail_thread_id?: string
  order_id?: string
  customer_id?: string
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  const { error } = await supabase.functions.invoke('gmail-send', {
    body: params,
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
  })
  if (error) throw new Error(error.message)
}
