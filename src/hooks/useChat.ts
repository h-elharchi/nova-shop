import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  createConversation,
  saveChatSession,
  loadChatSession,
  clearChatSession,
  checkAgentsOnline,
  assignToAvailableAdmin,
  getConversation,
  closeConversationByCustomer,
} from '../lib/chat'
import { validateMoroccanPhone, normalizePhone } from './useOrders'
import type { ChatConversation, ChatWidgetState } from '../types/chat'

const SEARCHING_TIMEOUT_SECONDS = 60  // délai avant timeout si aucun agent en ligne
const WAITING_TIMEOUT_SECONDS   = 60  // délai avant timeout en file d'attente

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
  const [countdown, setCountdown] = useState(SEARCHING_TIMEOUT_SECONDS)
  const [error, setError] = useState<string | null>(null)

  const countdownRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const waitingTimerRef   = useRef<ReturnType<typeof setTimeout>  | null>(null)
  const agentWatchChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const convSubscriptionRef  = useRef<ReturnType<typeof supabase.channel> | null>(null)
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
      stopWaitingTimer()
      cleanupSubscription()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stopWaitingTimer = useCallback(() => {
    if (waitingTimerRef.current !== null) {
      clearTimeout(waitingTimerRef.current)
      waitingTimerRef.current = null
    }
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
            stopWaitingTimer()
            setWidgetState('active')
          } else if (updated.status === 'closed') {
            stopWaitingTimer()
            setWidgetState('closed')
            clearChatSession()
          } else if (updated.status === 'timeout') {
            stopWaitingTimer()
            stopCountdown()
            setWidgetState('timeout')
            clearChatSession()
          }
        }
      )
      .subscribe()

    convSubscriptionRef.current = channel
  }, [stopCountdown, stopWaitingTimer])

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
      // Timer client 60 s : si aucun agent ne prend la conv, fermer la session
      stopWaitingTimer()
      waitingTimerRef.current = setTimeout(() => {
        if (!mounted.current) return
        stopWaitingTimer()
        setWidgetState('timeout')
        clearChatSession()
        setConversation(null)
      }, WAITING_TIMEOUT_SECONDS * 1000)
    } else {
      // Aucun agent en ligne → countdown 60 s
      setCountdown(SEARCHING_TIMEOUT_SECONDS)
      setWidgetState('searching')
      startCountdown(conv.id)
    }

    return null
  }, [subscribeToConversation])

  const startCountdown = useCallback((convId: string) => {
    stopCountdown()
    let remaining = SEARCHING_TIMEOUT_SECONDS

    // Surveiller les agents pendant le décompte : si un agent devient disponible, assigner
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
            // Le Realtime sur chat_conversations gère la transition → active
          }
        }
      )
      .subscribe()

    agentWatchChannelRef.current = agentChannel

    countdownRef.current = setInterval(() => {
      remaining -= 1
      if (!mounted.current) return
      setCountdown(remaining)

      if (remaining <= 0) {
        stopCountdown()
        if (!mounted.current) return
        // Aucun agent trouvé dans le délai → timeout client
        setWidgetState('timeout')
        clearChatSession()
        setConversation(null)
      }
    }, 1000)
  }, [stopCountdown])

  const resetToIdle = useCallback(() => {
    // Le client ferme le chat : prévenir l'agent (message système), sans clôturer
    // l'interaction — c'est à lui de la terminer via le wrap-up.
    if (conversation && (conversation.status === 'waiting' || conversation.status === 'active')) {
      closeConversationByCustomer(conversation.id)
    }
    stopCountdown()
    stopWaitingTimer()
    cleanupSubscription()
    clearChatSession()
    setConversation(null)
    setQueuePosition(null)
    setCountdown(SEARCHING_TIMEOUT_SECONDS)
    setError(null)
    setWidgetState('idle')
    setIsOpen(false)
  }, [conversation, stopCountdown, stopWaitingTimer, cleanupSubscription])

  const startNewConversation = useCallback(() => {
    stopCountdown()
    stopWaitingTimer()
    cleanupSubscription()
    clearChatSession()
    setConversation(null)
    setQueuePosition(null)
    setCountdown(SEARCHING_TIMEOUT_SECONDS)
    setError(null)
    setWidgetState('form')
  }, [stopCountdown, stopWaitingTimer, cleanupSubscription])

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
