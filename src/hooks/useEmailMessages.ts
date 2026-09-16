import { useState, useCallback, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { loadEmailMessages, updateEmailStatus, type EmailFilters } from '../lib/email'
import type { EmailMessage, EmailStatus } from '../types'

export function useEmailMessages(filters: EmailFilters = {}) {
  const [messages, setMessages]   = useState<EmailMessage[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const channelRef                = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const instanceId                = useRef(`${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)

  const fetchMessages = useCallback(async (f?: EmailFilters) => {
    setLoading(true)
    setError(null)
    try {
      const data = await loadEmailMessages(f ?? filters)
      setMessages(data)
      setUnreadCount(data.filter(m => m.status === 'new').length)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [filters.status, filters.accountId, filters.search]) // eslint-disable-line

  useEffect(() => { fetchMessages() }, [fetchMessages])

  // Realtime : nouveaux emails entrants
  useEffect(() => {
    const channel = supabase
      .channel(`email-messages-${instanceId.current}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'email_messages', filter: 'direction=eq.in' },
        () => { fetchMessages() }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'email_messages' },
        (payload) => {
          setMessages(prev =>
            prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new as EmailMessage } : m)
          )
        }
      )
      .subscribe()

    channelRef.current = channel
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, []) // eslint-disable-line

  const markAsRead = useCallback(async (messageId: string) => {
    await updateEmailStatus(messageId, 'read')
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, status: 'read' as EmailStatus } : m))
  }, [])

  const markAsArchived = useCallback(async (messageId: string) => {
    await updateEmailStatus(messageId, 'archived')
    setMessages(prev => prev.filter(m => m.id !== messageId))
  }, [])

  const markAsReplied = useCallback((messageId: string) => {
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, status: 'replied' as EmailStatus } : m))
  }, [])

  return {
    messages,
    loading,
    error,
    unreadCount,
    refetch: fetchMessages,
    markAsRead,
    markAsArchived,
    markAsReplied,
  }
}
