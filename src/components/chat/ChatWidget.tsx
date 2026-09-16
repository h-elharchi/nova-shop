import { useI18n } from '../../context/LanguageContext'
import { ChatHeader } from './ChatHeader'
import { ChatCustomerForm } from './ChatCustomerForm'
import { ChatQueueStatus } from './ChatQueueStatus'
import { ChatClosedMessage } from './ChatClosedMessage'
import { ChatWindow } from './ChatWindow'
import type { ChatWidgetState, ChatConversation } from '../../types/chat'
import type { CustomerFormData } from '../../hooks/useChat'

interface ChatWidgetProps {
  widgetState: ChatWidgetState
  conversation: ChatConversation | null
  queuePosition: number | null
  countdown: number
  onSubmitForm: (data: CustomerFormData) => Promise<string | null>
  onClose: () => void
  onMinimize: () => void
  onNewConversation: () => void
  onResetToIdle: () => void
}

export function ChatWidget({
  widgetState,
  conversation,
  queuePosition,
  countdown,
  onSubmitForm,
  onClose,
  onMinimize,
  onNewConversation,
  onResetToIdle,
}: ChatWidgetProps) {
  const { } = useI18n()

  const statusDot = widgetState === 'active' ? 'green'
    : widgetState === 'waiting' || widgetState === 'searching' ? 'orange'
    : 'gray'

  return (
    <div
      className="flex flex-col bg-white dark:bg-dark-surface rounded-2xl shadow-2xl border border-gray-100 dark:border-dark-border overflow-hidden"
      style={{ width: 'min(340px, calc(100vw - 24px))', height: 'min(520px, calc(100vh - 120px))' }}
    >
      <ChatHeader
        onClose={onResetToIdle}
        onMinimize={onMinimize}
        statusDot={statusDot}
      />

      {widgetState === 'form' && (
        <ChatCustomerForm
          onSubmit={onSubmitForm}
          loading={false}
        />
      )}

      {widgetState === 'connecting' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {(widgetState === 'searching' || widgetState === 'waiting') && (
        <ChatQueueStatus
          state={widgetState}
          queuePosition={queuePosition}
          countdown={countdown}
        />
      )}

      {widgetState === 'active' && conversation && (
        <ChatWindow conversation={conversation} />
      )}

      {(widgetState === 'closed' || widgetState === 'timeout') && (
        <ChatClosedMessage
          state={widgetState}
          onNewConversation={onNewConversation}
          onClose={onClose}
        />
      )}

      {widgetState === 'error' && (
        <div className="flex-1 flex items-center justify-center p-4 text-center">
          <p className="text-sm text-red-500">Une erreur est survenue. Veuillez réessayer.</p>
        </div>
      )}
    </div>
  )
}
