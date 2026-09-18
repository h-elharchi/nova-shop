import { formatMessageTime } from '../../lib/chat'
import { useI18n } from '../../context/LanguageContext'
import type { ChatMessage as ChatMessageType } from '../../types/chat'

interface ChatMessageProps {
  message: ChatMessageType
}

export function ChatMessage({ message }: ChatMessageProps) {
  const { t } = useI18n()

  if (message.sender_type === 'system') {
    let text: string
    if (message.message === 'conversation_started') {
      text = t('chat.system_started')
    } else if (message.message === 'conversation_closed') {
      text = t('chat.system_closed')
    } else if (message.message === 'conversation_transferred') {
      text = t('chat.system_transferred')
    } else if (message.message.startsWith('conversation_transferred:')) {
      const note = message.message.slice('conversation_transferred:'.length)
      text = `${t('chat.system_transferred')}${note ? ` — ${note}` : ''}`
    } else if (message.message === 'customer_left') {
      text = t('chat.system_customer_left')
    } else {
      text = message.message
    }

    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
          {text}
        </span>
      </div>
    )
  }

  const isCustomer = message.sender_type === 'customer'

  return (
    <div className={`flex ${isCustomer ? 'justify-end' : 'justify-start'} mb-2`}>
      <div className={`max-w-[78%] ${isCustomer ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
        <div
          className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed break-words ${
            isCustomer
              ? 'bg-blue-600 text-white rounded-br-sm'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-sm'
          }`}
        >
          {message.message}
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500 px-1">
          {formatMessageTime(message.created_at)}
        </span>
      </div>
    </div>
  )
}
