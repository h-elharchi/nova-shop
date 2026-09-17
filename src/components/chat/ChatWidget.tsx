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
  const statusDot = widgetState === 'active' ? 'green'
    : widgetState === 'waiting' || widgetState === 'searching' ? 'orange'
    : 'gray'

  return (
    /*
     * Mobile  : h-full w-full, coins non arrondis (le conteneur est inset-0)
     * Desktop : dimensions fixes, coins arrondis, ombre
     */
    <div
      className="
        flex flex-col bg-white dark:bg-dark-surface overflow-hidden
        h-full w-full
        sm:rounded-2xl sm:shadow-2xl sm:border sm:border-gray-100 sm:dark:border-dark-border
        sm:w-[340px] sm:h-[520px] sm:max-h-[calc(100vh-120px)]
      "
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
          <div className="w-8 h-8 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin" />
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
