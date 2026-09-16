import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { StaffProfile } from '../types'

export function useProfile(userId: string | null) {
  const [profile, setProfile] = useState<StaffProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async (id: string) => {
    setLoading(true)

    // select('*') évite les erreurs "column does not exist" si supabase-accounts.sql
    // n'a pas encore été exécuté. Les nouvelles colonnes seront undefined → on les
    // normalise ci-dessous.
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      setProfile(null)
      setLoading(false)
      return
    }

    const raw = data as Record<string, unknown>
    const normalized: StaffProfile = {
      id:            raw.id            as string,
      email:         (raw.email        as string) ?? '',
      role:          (raw.role         as StaffProfile['role']) ?? 'user',
      first_name:    (raw.first_name   as string | null)  ?? null,
      last_name:     (raw.last_name    as string | null)  ?? null,
      avatar_url:    (raw.avatar_url   as string | null)  ?? null,
      // Si la colonne is_active n'existe pas encore (migration non exécutée)
      // on la traite comme true pour ne pas bloquer les admins existants.
      is_active:     raw.is_active !== undefined ? Boolean(raw.is_active) : true,
      last_login_at: (raw.last_login_at as string | null) ?? null,
      created_at:    (raw.created_at   as string) ?? '',
    }

    setProfile(normalized)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setLoading(false)
      return
    }
    fetchProfile(userId)
  }, [userId, fetchProfile])

  const updateProfile = useCallback(async (
    updates: Partial<Pick<StaffProfile, 'first_name' | 'last_name' | 'avatar_url'>>
  ) => {
    if (!userId) return false
    const { error } = await supabase.from('profiles').update(updates).eq('id', userId)
    if (!error) setProfile(prev => prev ? { ...prev, ...updates } : null)
    return !error
  }, [userId])

  return {
    profile,
    loading,
    updateProfile,
    refetch: () => { if (userId) fetchProfile(userId) },
  }
}
