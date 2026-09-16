import { useI18n } from '../../context/LanguageContext'

interface ChatQueueStatusProps {
  state: 'searching' | 'waiting'
  queuePosition: number | null
  countdown?: number
}

export function ChatQueueStatus({ state, queuePosition, countdown }: ChatQueueStatusProps) {
  const { t } = useI18n()

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      {state === 'searching' ? (
        <>
          <div className="relative w-16 h-16 mb-4">
            <div className="w-16 h-16 rounded-full border-4 border-blue-100 dark:border-blue-900/40" />
            <div className="absolute inset-0 w-16 h-16 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {countdown}
              </span>
            </div>
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
            {t('chat.searching')}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {t('chat.searching_subtitle')}
          </p>
        </>
      ) : (
        <>
          <div className="w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mb-4">
            <span className="text-2xl">⏳</span>
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
            {t('chat.waiting')}
          </p>
          {queuePosition !== null && (
            <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm font-medium px-4 py-2 rounded-xl">
              {t('chat.queue_position').replace('{n}', String(queuePosition))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
