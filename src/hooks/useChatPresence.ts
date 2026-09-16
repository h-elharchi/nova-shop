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
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const convChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      cleanup()
    }
  }, [])

  const cleanup = useCallback(() => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    if (convChannelRef.current) supabase.removeChannel(convChannelRef.current)
  }, [])

  // Subscribe to agents and waiting conversations count
  useEffect(() => {
    if (!adminId) return

    ensureChatAgent().then(() => {
      if (!mounted.current) return

      // Load current agent status
      supabase
        .from('chat_agents')
        .select('*')
        .then(({ data }) => {
          if (!mounted.current || !data) return
          setAgents(data as ChatAgent[])
          const mine = (data as ChatAgent[]).find(a => a.user_id === adminId)
          if (mine) setMyStatus(mine.status)
        })

      // Subscribe to agent changes
      const agentChannel = supabase
        .channel('admin-agents')
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

      channelRef.current = agentChannel

      // Subscribe to waiting conversations for badge count
      const convChannel = supabase
        .channel('admin-waiting-conv')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'chat_conversations' },
          () => {
            if (!mounted.current) return
            loadWaitingCount()
          }
        )
        .subscribe()

      convChannelRef.current = convChannel

      loadWaitingCount()
    })
  }, [adminId])

  const loadWaitingCount = useCallback(async () => {
    const { count } = await supabase
      .from('chat_conversations')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'waiting')
    if (mounted.current) setWaitingCount(count ?? 0)
  }, [])

  const setStatus = useCallback(async (status: ChatAgentStatus) => {
    if (!adminId) return
    setMyStatus(status)
    await updateAgentHeartbeat(status)

    // Start/stop heartbeat
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    if (status !== 'offline') {
      heartbeatRef.current = setInterval(() => {
        if (mounted.current) updateAgentHeartbeat()
      }, HEARTBEAT_MS)
    }
  }, [adminId])

  // Set offline on unmount
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
  }, [fetchConversations, filter])

  return { conversations, loading, refetch: fetchConversations }
}
