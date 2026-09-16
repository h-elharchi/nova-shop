import { supabase } from './supabase'
import type { StaffProfile, StaffRole } from '../types'

const EDGE_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users`

async function call(action: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const res = await fetch(EDGE_FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action, ...params }),
  })

  const json = await res.json() as { data?: unknown; error?: string }
  if (!res.ok || json.error) throw new Error(json.error ?? 'Unknown error')
  return json.data
}

export async function listStaffUsers(): Promise<StaffProfile[]> {
  return call('list') as Promise<StaffProfile[]>
}

export async function inviteStaffUser(params: {
  email: string
  role: StaffRole
  first_name?: string
  last_name?: string
}): Promise<{ id: string }> {
  return call('invite', params) as Promise<{ id: string }>
}

export async function updateStaffUser(params: {
  user_id: string
  role?: StaffRole
  is_active?: boolean
  first_name?: string | null
  last_name?: string | null
}): Promise<void> {
  await call('update', params)
}

export async function resetStaffPassword(email: string): Promise<void> {
  await call('reset-password', { email })
}
