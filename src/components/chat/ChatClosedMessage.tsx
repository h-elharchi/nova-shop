import { useI18n } from '../../context/LanguageContext'
import type { ChatWidgetState } from '../../types/chat'

interface ChatClosedMessageProps {
  state: ChatWidgetState
  onNewConversation: () => void
  onClose: () => void
}

export function ChatClosedMessage({ state, onNewConversation, onClose }: ChatClosedMessageProps) {
  const { t } = useI18n()

  const isTimeout = state === 'timeout'

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-4">
      <div className="text-4xl">{isTimeout ? '⏰' : '✅'}</div>

      <div>
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">
          {isTimeout ? t('chat.no_advisor') : t('chat.conversation_closed')}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {isTimeout ? t('chat.retry_later') : t('chat.thank_you')}
        </p>
      </div>

      <div className="flex flex-col gap-2 w-full sm:max-w-[200px]">
        {!isTimeout && (
          <button
            onClick={onNewConversation}
            className="w-full py-3 sm:py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl transition-colors"
          >
            {t('chat.new_conversation')}
          </button>
        )}
        <button
          onClick={onClose}
          className="w-full py-3 sm:py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 active:bg-gray-300 dark:active:bg-gray-500 rounded-xl transition-colors"
        >
          {t('chat.close')}
        </button>
      </div>
    </div>
  )
}
