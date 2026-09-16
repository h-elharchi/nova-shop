import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { ensureChatAgent, updateAgentHeartbeat } from '../lib/chat'
import type { ChatAgent, ChatAgentStatus, ChatConversation } from '../types/chat'

const HEARTBEAT_MS = 20000

export function useChatPresence(adminId: string | null) {
  const [myStatus, setMyStatus] = useState<ChatAgentStatus>('offline')
  const [agents, setAgents] = useState<ChatAgent[]>([])
  const [waitingCount, setWaitingCount] = useState(0)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const agentChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const convChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const mounted = useRef(true)
  // Unique suffix per hook instance — prevents channel name collisions when
  // the same hook is mounted in multiple places (e.g. AdminLayout + ChatPage)
  const instanceId = useRef(`${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }
  }, [])

  const removeChannels = useCallback(() => {
    if (agentChannelRef.current) {
      supabase.removeChannel(agentChannelRef.current)
      agentChannelRef.current = null
    }
    if (convChannelRef.current) {
      supabase.removeChannel(convChannelRef.current)
      convChannelRef.current = null
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      stopHeartbeat()
      removeChannels()
    }
  }, [stopHeartbeat, removeChannels])

  const loadWaitingCount = useCallback(async () => {
    const { count } = await supabase
      .from('chat_conversations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'waiting')
    if (mounted.current) setWaitingCount(count ?? 0)
  }, [])

  useEffect(() => {
    if (!adminId) return

    const id = instanceId.current
    let cancelled = false

    ensureChatAgent().then(() => {
      if (cancelled || !mounted.current) return

      supabase
        .from('chat_agents')
        .select('*')
        .then(({ data }) => {
          if (cancelled || !mounted.current || !data) return
          setAgents(data as ChatAgent[])
          const mine = (data as ChatAgent[]).find(a => a.user_id === adminId)
          if (mine) setMyStatus(mine.status)
        })

      if (agentChannelRef.current) supabase.removeChannel(agentChannelRef.current)
      const agentChannel = supabase
        .channel(`agents-${id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'chat_agents' },
          (payload) => {
            if (!mounted.current) return
            if (payload.eventType === 'INSERT') {
              setAgents(prev => [...prev, payload.new as ChatAgent])
            } else if (payload.eventType === 'UPDATE') {
              const updated = payload.new as ChatAgent
              setAgents(prev => prev.map(a => a.id === updated.id ? updated : a))
              if (updated.user_id === adminId) setMyStatus(updated.status)
            }
          }
        )
        .subscribe()
      agentChannelRef.current = agentChannel

      if (convChannelRef.current) supabase.removeChannel(convChannelRef.current)
      const convChannel = supabase
        .channel(`waiting-conv-${id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'chat_conversations' },
          () => {
            if (mounted.current) loadWaitingCount()
          }
        )
        .subscribe()
      convChannelRef.current = convChannel

      loadWaitingCount()
    })

    return () => {
      cancelled = true
      removeChannels()
    }
  }, [adminId, loadWaitingCount, removeChannels])

  const setStatus = useCallback(async (status: ChatAgentStatus) => {
    if (!adminId) return
    setMyStatus(status)
    await updateAgentHeartbeat(status)

    stopHeartbeat()
    if (status !== 'offline') {
      heartbeatRef.current = setInterval(() => {
        if (mounted.current) updateAgentHeartbeat()
      }, HEARTBEAT_MS)
    }
  }, [adminId, stopHeartbeat])

  useEffect(() => {
    return () => {
      if (adminId && myStatus !== 'offline') {
        updateAgentHeartbeat('offline')
      }
    }
  }, [adminId, myStatus])

  return { myStatus, agents, waitingCount, setStatus }
}

// Hook for admin: list of conversations with realtime
export function useAdminConversations(filter: 'waiting' | 'active' | 'closed_timeout' | 'all' = 'all') {
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [loading, setLoading] = useState(true)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [])

  const fetchConversations = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('chat_conversations')
      .select('*')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (filter === 'waiting') query = query.eq('status', 'waiting')
    else if (filter === 'active') query = query.eq('status', 'active')
    else if (filter === 'closed_timeout') query = query.in('status', ['closed', 'timeout'])

    const { data, error } = await query
    if (!mounted.current) return
    if (!error && data) setConversations(data as ChatConversation[])
    setLoading(false)
  }, [filter])

  useEffect(() => {
    fetchConversations()

    if (channelRef.current) supabase.removeChannel(channelRef.current)

    const channel = supabase
      .channel(`admin-conversations-${filter}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_conversations' },
        () => {
          if (mounted.current) fetchConversations()
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
  }, [fetchConversations, filter])

  return { conversations, loading, refetch: fetchConversations }
}
