import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { CallbackRequest, CallbackAttempt, CallbackAttemptResult } from '../types/interactions'

export function useCallbacks() {
  const [callbacks, setCallbacks] = useState<CallbackRequest[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const instanceId = useRef(`${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
  const mounted    = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [])

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('callback_requests')
      .select('*')
      .order('created_at', { ascending: false })

    if (!mounted.current) return
    if (err) { setError(err.message) } else { setCallbacks((data ?? []) as CallbackRequest[]) }
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  useEffect(() => {
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    const channel = supabase
      .channel(`callbacks-list-${instanceId.current}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'callback_requests' }, () => {
        if (mounted.current) fetch()
      })
      .subscribe()
    channelRef.current = channel
    return () => {
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null }
    }
  }, [fetch])

  const loadAttempts = useCallback(async (callbackId: string): Promise<CallbackAttempt[]> => {
    const { data } = await supabase
      .from('callback_attempts')
      .select('*')
      .eq('callback_request_id', callbackId)
      .order('attempted_at', { ascending: false })
    return (data ?? []) as CallbackAttempt[]
  }, [])

  const recordAttempt = useCallback(async (
    callbackId: string,
    result: CallbackAttemptResult,
    comment?: string,
    nextAttemptAt?: string | null,
  ): Promise<boolean> => {
    const { error: err } = await supabase.rpc('record_callback_attempt', {
      p_callback_id:    callbackId,
      p_result:         result,
      p_comment:        comment ?? null,
      p_next_attempt_at: nextAttemptAt ?? null,
    })
    if (!err) await fetch()
    return !err
  }, [fetch])

  return {
    callbacks,
    loading,
    error,
    refetch: fetch,
    loadAttempts,
    recordAttempt,
  }
}

// Hook pour un rappel unique (panneau workspace)
export function useCallbackDetail(callbackId: string | null) {
  const [callback, setCallback]   = useState<CallbackRequest | null>(null)
  const [attempts, setAttempts]   = useState<CallbackAttempt[]>([])
  const [loading, setLoading]     = useState(false)

  const fetch = useCallback(async () => {
    if (!callbackId) return
    setLoading(true)
    const [cbRes, attRes] = await Promise.all([
      supabase.from('callback_requests').select('*').eq('id', callbackId).single(),
      supabase.from('callback_attempts').select('*').eq('callback_request_id', callbackId)
        .order('attempted_at', { ascending: false }),
    ])
    setCallback((cbRes.data ?? null) as CallbackRequest | null)
    setAttempts((attRes.data ?? []) as CallbackAttempt[])
    setLoading(false)
  }, [callbackId])

  useEffect(() => { fetch() }, [fetch])

  return { callback, attempts, loading, refetch: fetch }
}
