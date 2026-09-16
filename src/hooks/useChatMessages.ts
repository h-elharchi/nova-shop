import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { loadMessages, sendMessage } from '../lib/chat'
import type { ChatMessage } from '../types/chat'

export function useChatMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const mounted = useRef(true)

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

  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      return
    }

    let cancelled = false
    setLoading(true)

    loadMessages(conversationId).then(msgs => {
      if (cancelled || !mounted.current) return
      setMessages(msgs)
      setLoading(false)
    })

    // Remove previous channel before creating a new one
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    // Unique channel name per subscription to prevent "callbacks after subscribe" errors
    const channel = supabase
      .channel(`msgs-${conversationId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (!mounted.current) return
          const newMsg = payload.new as ChatMessage
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      cancelled = true
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [conversationId])

  const send = useCallback(async (
    message: string,
    senderType: 'customer' | 'admin',
    senderId?: string
  ): Promise<boolean> => {
    if (!conversationId || !message.trim()) return false
    setSending(true)
    setSendError(null)

    const msg = await sendMessage({ conversationId, message, senderType, senderId })
    if (!mounted.current) return false

    if (!msg) {
      setSendError('chat.error_send')
      setSending(false)
      return false
    }

    setSending(false)
    return true
  }, [conversationId])

  const clearSendError = useCallback(() => setSendError(null), [])

  return { messages, loading, sending, sendError, send, clearSendError }
}
