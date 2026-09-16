import { useEffect, useRef } from 'react'
import { useI18n } from '../../context/LanguageContext'
import { useAuth } from '../../hooks/useAuth'
import { useChatMessages } from '../../hooks/useChatMessages'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import type { ChatConversation } from '../../types/chat'

interface ChatWindowProps {
  conversation: ChatConversation
}

export function ChatWindow({ conversation }: ChatWindowProps) {
  const { t } = useI18n()
  const { user } = useAuth()
  const { messages, loading, sending, send } = useChatMessages(conversation.id)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (text: string) => {
    const senderType = user ? 'admin' : 'customer'
    await send(text, senderType, user?.id)
  }

  const isActive = conversation.status === 'active'

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
        {loading ? (
          <div className="flex justify-center pt-8">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <div className="text-3xl mb-2">💬</div>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {t('chat.searching_subtitle')}
            </p>
          </div>
        ) : (
          messages.map(msg => (
            <ChatMessage key={msg.id} message={msg} />
          ))
        )}

        {/* Typing indicator placeholder area */}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        disabled={!isActive}
        sending={sending}
      />
    </div>
  )
}
