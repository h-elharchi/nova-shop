import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { StaffProfile } from '../types'

export function useProfile(userId: string | null) {
  const [profile, setProfile] = useState<StaffProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async (id: string) => {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, email, role, first_name, last_name, avatar_url, is_active, last_login_at, created_at')
      .eq('id', id)
      .single()
    setProfile(data as StaffProfile | null)
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

  const updateProfile = useCallback(async (updates: Partial<Pick<StaffProfile, 'first_name' | 'last_name' | 'avatar_url'>>) => {
    if (!userId) return false
    const { error } = await supabase.from('profiles').update(updates).eq('id', userId)
    if (!error) {
      setProfile(prev => prev ? { ...prev, ...updates } : null)
    }
    return !error
  }, [userId])

  return { profile, loading, updateProfile, refetch: () => userId && fetchProfile(userId) }
}
