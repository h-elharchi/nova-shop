import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  createConversation,
  saveChatSession,
  loadChatSession,
  clearChatSession,
  checkAgentsOnline,
  assignToAvailableAdmin,
  timeoutConversation,
  getConversation,
} from '../lib/chat'
import { validateMoroccanPhone, normalizePhone } from './useOrders'
import type { ChatConversation, ChatWidgetState } from '../types/chat'

const TIMEOUT_SECONDS = 30

export interface CustomerFormData {
  firstName: string
  lastName: string
  phone: string
  email?: string
}

export function useChat() {
  const [widgetState, setWidgetState] = useState<ChatWidgetState>('idle')
  const [isOpen, setIsOpen] = useState(false)
  const [conversation, setConversation] = useState<ChatConversation | null>(null)
  const [queuePosition, setQueuePosition] = useState<number | null>(null)
  const [countdown, setCountdown] = useState(TIMEOUT_SECONDS)
  const [error, setError] = useState<string | null>(null)

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const agentWatchChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const convSubscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    // Restore active session on mount
    const saved = loadChatSession()
    if (saved) {
      getConversation(saved).then(conv => {
        if (!conv || !mounted.current) return
        if (conv.status === 'active') {
          setConversation(conv)
          setWidgetState('active')
          setIsOpen(true)
          subscribeToConversation(conv.id)
        } else if (conv.status === 'waiting') {
          setConversation(conv)
          setQueuePosition(conv.queue_position)
          setWidgetState('waiting')
          setIsOpen(true)
          subscribeToConversation(conv.id)
        } else {
          clearChatSession()
        }
      })
    }
    return () => {
      mounted.current = false
      stopCountdown()
      cleanupSubscription()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stopCountdown = useCallback(() => {
    if (countdownRef.current !== null) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
    if (agentWatchChannelRef.current) {
      supabase.removeChannel(agentWatchChannelRef.current)
      agentWatchChannelRef.current = null
    }
  }, [])

  const cleanupSubscription = useCallback(() => {
    if (convSubscriptionRef.current) {
      supabase.removeChannel(convSubscriptionRef.current)
      convSubscriptionRef.current = null
    }
  }, [])

  const subscribeToConversation = useCallback((convId: string) => {
    if (convSubscriptionRef.current) {
      supabase.removeChannel(convSubscriptionRef.current)
    }

    const channel = supabase
      .channel(`conv:${convId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_conversations',
          filter: `id=eq.${convId}`,
        },
        (payload) => {
          if (!mounted.current) return
          const updated = payload.new as ChatConversation
          setConversation(updated)
          setQueuePosition(updated.queue_position)

          if (updated.status === 'active') {
            stopCountdown()
            setWidgetState('active')
          } else if (updated.status === 'closed') {
            setWidgetState('closed')
            clearChatSession()
          } else if (updated.status === 'timeout') {
            setWidgetState('timeout')
            clearChatSession()
          }
        }
      )
      .subscribe()

    convSubscriptionRef.current = channel
  }, [stopCountdown])

  const openWidget = useCallback(() => {
    setIsOpen(true)
    if (widgetState === 'idle') {
      setWidgetState('form')
    }
  }, [widgetState])

  const closeWidget = useCallback(() => {
    setIsOpen(false)
  }, [])

  const startChat = useCallback(async (formData: CustomerFormData): Promise<string | null> => {
    if (!formData.firstName.trim()) return 'chat.error_name'
    if (!formData.lastName.trim()) return 'chat.error_lastname'
    if (!validateMoroccanPhone(formData.phone)) return 'chat.error_phone'

    setWidgetState('connecting')
    setError(null)

    const conv = await createConversation({
      firstName: formData.firstName,
      lastName: formData.lastName,
      phone: normalizePhone(formData.phone),
    })

    if (!conv || !mounted.current) {
      setWidgetState('form')
      setError('chat.error_create')
      return 'chat.error_create'
    }

    saveChatSession(conv.id)
    setConversation(conv)
    subscribeToConversation(conv.id)

    // Essayer d'assigner immédiatement à un admin disponible
    const assigned = await assignToAvailableAdmin(conv.id)
    if (!mounted.current) return null

    if (assigned) {
      const updated = await getConversation(conv.id)
      if (updated && mounted.current) {
        setConversation(updated)
        setWidgetState('active')
      }
      return null
    }

    // Vérifier si des admins sont en ligne
    const agentStatus = await checkAgentsOnline()
    if (!mounted.current) return null

    if (agentStatus.available_count > 0 || agentStatus.busy_count > 0) {
      // Agents présents (disponibles ou occupés) → file d'attente workspace
      setQueuePosition(conv.queue_position)
      setWidgetState('waiting')
    } else {
      // Aucun agent en ligne → 30s countdown
      setCountdown(TIMEOUT_SECONDS)
      setWidgetState('searching')
      startCountdown(conv.id)
    }

    return null
  }, [subscribeToConversation])

  const startCountdown = useCallback((convId: string) => {
    stopCountdown()
    let remaining = TIMEOUT_SECONDS

    // Subscribe to agent changes during countdown
    const agentChannel = supabase
      .channel(`agents-watch:${convId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_agents' },
        async () => {
          if (!mounted.current) return
          const status = await checkAgentsOnline()
          if (status.available_count > 0) {
            await assignToAvailableAdmin(convId)
            // Conversation subscription handles the status → active transition
          }
        }
      )
      .subscribe()

    agentWatchChannelRef.current = agentChannel

    countdownRef.current = setInterval(async () => {
      remaining -= 1
      if (!mounted.current) return
      setCountdown(remaining)

      if (remaining <= 0) {
        stopCountdown()
        if (!mounted.current) return
        await timeoutConversation(convId)
        clearChatSession()
        setWidgetState('timeout')
      }
    }, 1000)
  }, [stopCountdown])

  const resetToIdle = useCallback(() => {
    stopCountdown()
    cleanupSubscription()
    clearChatSession()
    setConversation(null)
    setQueuePosition(null)
    setCountdown(TIMEOUT_SECONDS)
    setError(null)
    setWidgetState('idle')
    setIsOpen(false)
  }, [stopCountdown, cleanupSubscription])

  const startNewConversation = useCallback(() => {
    stopCountdown()
    cleanupSubscription()
    clearChatSession()
    setConversation(null)
    setQueuePosition(null)
    setCountdown(TIMEOUT_SECONDS)
    setError(null)
    setWidgetState('form')
  }, [stopCountdown, cleanupSubscription])

  return {
    widgetState,
    isOpen,
    conversation,
    queuePosition,
    countdown,
    error,
    openWidget,
    closeWidget,
    startChat,
    resetToIdle,
    startNewConversation,
  }
}
