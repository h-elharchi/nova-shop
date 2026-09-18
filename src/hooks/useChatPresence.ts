import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { ensureChatAgent, updateAgentHeartbeat } from '../lib/chat'
import type { ChatAgent, ChatAgentStatus, ChatConversation } from '../types/chat'

const HEARTBEAT_MS = 20000

export function useChatPresence(adminId: string | null) {
  const [myStatus, setMyStatusState]   = useState<ChatAgentStatus>('offline')
  const [myPauseReasonId, setMyPauseReasonId] = useState<string | null>(null)
  const [myActiveCount, setMyActiveCount]     = useState(0)
  const [agents, setAgents]            = useState<ChatAgent[]>([])
  const [waitingCount, setWaitingCount] = useState(0)
  const [statusDuration, setStatusDuration]   = useState(0) // seconds

  const heartbeatRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const durationRef       = useRef<ReturnType<typeof setInterval> | null>(null)
  const agentChannelRef   = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const convChannelRef    = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const mounted           = useRef(true)
  const statusChangedAt   = useRef<number>(Date.now())
  const instanceId        = useRef(`${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null }
  }, [])

  // Démarre (ou redémarre) le battement toutes les HEARTBEAT_MS pour maintenir
  // last_seen_at frais — sans ça route_interactions() ignore l'agent après 2 min.
  const restartHeartbeat = useCallback((status: ChatAgentStatus) => {
    stopHeartbeat()
    if (status !== 'offline') {
      heartbeatRef.current = setInterval(() => {
        if (mounted.current) updateAgentHeartbeat()
      }, HEARTBEAT_MS)
    }
  }, [stopHeartbeat])

  const stopDuration = useCallback(() => {
    if (durationRef.current) { clearInterval(durationRef.current); durationRef.current = null }
  }, [])

  const removeChannels = useCallback(() => {
    if (agentChannelRef.current) { supabase.removeChannel(agentChannelRef.current); agentChannelRef.current = null }
    if (convChannelRef.current)  { supabase.removeChannel(convChannelRef.current);  convChannelRef.current  = null }
  }, [])

  const startDurationTimer = useCallback((fromTimestamp?: number) => {
    stopDuration()
    statusChangedAt.current = fromTimestamp ?? Date.now()
    setStatusDuration(Math.floor((Date.now() - statusChangedAt.current) / 1000))
    durationRef.current = setInterval(() => {
      if (mounted.current) {
        setStatusDuration(Math.floor((Date.now() - statusChangedAt.current) / 1000))
      }
    }, 1000)
  }, [stopDuration])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      stopHeartbeat()
      stopDuration()
      removeChannels()
    }
  }, [stopHeartbeat, stopDuration, removeChannels])

  const loadWaitingCount = useCallback(async () => {
    const { count } = await supabase
      .from('interactions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'queued')
    if (mounted.current) setWaitingCount(count ?? 0)
  }, [])

  useEffect(() => {
    if (!adminId) return

    const id = instanceId.current
    let cancelled = false

    ensureChatAgent().then(() => {
      if (cancelled || !mounted.current) return

      supabase.from('chat_agents').select('*').then(({ data }) => {
        if (cancelled || !mounted.current || !data) return
        const agentData = data as ChatAgent[]
        setAgents(agentData)
        const mine = agentData.find(a => a.user_id === adminId)
        if (mine) {
          setMyStatusState(mine.status)
          setMyPauseReasonId(mine.pause_reason_id)
          setMyActiveCount(mine.active_conversations_count ?? 0)
          const ts = mine.status_changed_at ? new Date(mine.status_changed_at).getTime() : undefined
          startDurationTimer(ts)
          // Reprendre le battement immédiatement si l'agent était déjà en ligne
          // (ex. rechargement de page) — sinon last_seen_at ne se rafraîchit plus jamais.
          if (mine.status !== 'offline') updateAgentHeartbeat()
          restartHeartbeat(mine.status)
        }
      })

      if (agentChannelRef.current) supabase.removeChannel(agentChannelRef.current)
      const agentChannel = supabase
        .channel(`agents-${id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_agents' }, (payload) => {
          if (!mounted.current) return
          if (payload.eventType === 'INSERT') {
            setAgents(prev => [...prev, payload.new as ChatAgent])
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as ChatAgent
            setAgents(prev => prev.map(a => a.id === updated.id ? updated : a))
            if (updated.user_id === adminId) {
              setMyStatusState(updated.status)
              setMyPauseReasonId(updated.pause_reason_id)
              setMyActiveCount(updated.active_conversations_count ?? 0)
            }
          }
        })
        .subscribe()
      agentChannelRef.current = agentChannel

      if (convChannelRef.current) supabase.removeChannel(convChannelRef.current)
      const convChannel = supabase
        .channel(`waiting-conv-${id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'interactions' }, () => {
          if (mounted.current) loadWaitingCount()
        })
        .subscribe()
      convChannelRef.current = convChannel

      loadWaitingCount()
    })

    return () => {
      cancelled = true
      removeChannels()
    }
  }, [adminId, loadWaitingCount, removeChannels, startDurationTimer, restartHeartbeat])

  const setStatus = useCallback(async (status: ChatAgentStatus, pauseReasonId?: string | null) => {
    if (!adminId) return
    setMyStatusState(status)
    setMyPauseReasonId(pauseReasonId ?? null)
    startDurationTimer()
    await updateAgentHeartbeat(status, pauseReasonId)
    restartHeartbeat(status)
    // Je viens de devenir disponible : tenter la distribution tout de suite
    // plutôt que d'attendre le prochain tick du cron ou du filet de sécurité.
    if (status === 'available') supabase.rpc('route_interactions')
  }, [adminId, restartHeartbeat, startDurationTimer])

  // Ref toujours à jour, pour éviter de dépendre de myStatus dans l'effet ci-dessous
  // (une dépendance sur myStatus ferait tourner le cleanup — donc passer offline —
  // à chaque changement de statut, pas seulement à la fermeture réelle de l'onglet)
  const myStatusRef = useRef<ChatAgentStatus>('offline')
  useEffect(() => { myStatusRef.current = myStatus }, [myStatus])

  // Aller offline proprement à la fermeture de l'onglet (ou au démontage réel)
  useEffect(() => {
    if (!adminId) return
    const goOffline = () => {
      if (myStatusRef.current !== 'offline') updateAgentHeartbeat('offline')
    }
    window.addEventListener('pagehide', goOffline)
    return () => {
      window.removeEventListener('pagehide', goOffline)
      goOffline()
    }
  }, [adminId])

  return {
    myStatus,
    myPauseReasonId,
    myActiveCount,
    agents,
    waitingCount,
    statusDuration,
    setStatus,
  }
}

// Hook pour lister les conversations admin avec filtre
export function useAdminConversations(
  filter: 'waiting' | 'active' | 'closed_timeout' | 'mine-active' | 'all' = 'all',
  userId?: string | null,
) {
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [loading, setLoading] = useState(true)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const mounted = useRef(true)
  const instanceId = useRef(`${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)

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

    if (filter === 'waiting')        query = query.eq('status', 'waiting')
    else if (filter === 'active')    query = query.eq('status', 'active')
    else if (filter === 'closed_timeout') query = query.in('status', ['closed', 'timeout'])
    else if (filter === 'mine-active' && userId) {
      query = query.eq('status', 'active').eq('assigned_admin_id', userId)
    }

    const { data, error } = await query
    if (!mounted.current) return
    if (!error && data) setConversations(data as ChatConversation[])
    setLoading(false)
  }, [filter, userId])

  useEffect(() => {
    fetchConversations()

    if (channelRef.current) supabase.removeChannel(channelRef.current)
    const id = instanceId.current
    const channel = supabase
      .channel(`admin-conv-${filter}-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_conversations' }, () => {
        if (mounted.current) fetchConversations()
      })
      .subscribe()
    channelRef.current = channel

    return () => {
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null }
    }
  }, [fetchConversations, filter])

  return { conversations, loading, refetch: fetchConversations }
}
