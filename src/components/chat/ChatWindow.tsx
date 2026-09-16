import { useEffect, useRef } from 'react'
import { useChatMessages } from '../../hooks/useChatMessages'
import { ChatMessage } from './ChatMessage'
import { ChatInput } from './ChatInput'
import type { ChatConversation } from '../../types/chat'

interface ChatWindowProps {
  conversation: ChatConversation
}

export function ChatWindow({ conversation }: ChatWindowProps) {
  const { messages, loading, sending, send } = useChatMessages(conversation.id)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Client-facing window: sender is always 'customer'
  const handleSend = async (text: string) => {
    await send(text, 'customer')
  }

  const isActive = conversation.status === 'active'

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex justify-center pt-8">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <div className="text-3xl mb-2">💬</div>
          </div>
        ) : (
          <div className="space-y-0.5">
            {messages.map(msg => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
          </div>
        )}
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
