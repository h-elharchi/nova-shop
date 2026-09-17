import { X, Minus } from 'lucide-react'
import { useI18n } from '../../context/LanguageContext'

interface ChatHeaderProps {
  onClose: () => void
  onMinimize: () => void
  statusDot?: 'green' | 'orange' | 'gray'
}

export function ChatHeader({ onClose, onMinimize, statusDot = 'green' }: ChatHeaderProps) {
  const { t } = useI18n()

  const dotColor = {
    green: 'bg-green-400',
    orange: 'bg-orange-400',
    gray: 'bg-gray-400',
  }[statusDot]

  return (
    /*
     * Mobile : padding-top avec safe-area-inset (notch iOS) + padding latéral généreux
     * Desktop : padding standard
     */
    <div
      className="flex items-center justify-between px-4 py-3 bg-blue-600 dark:bg-blue-700 sm:rounded-t-2xl shrink-0"
      style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-full bg-blue-500 dark:bg-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
          NS
        </div>
        <div>
          <div className="text-white font-semibold text-sm leading-tight">{t('chat.title')}</div>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${dotColor} animate-pulse`} />
            <span className="text-blue-100 text-xs">{t('chat.subtitle')}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onMinimize}
          aria-label="Minimiser"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-blue-100 hover:bg-blue-500 dark:hover:bg-blue-600 transition-colors"
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          onClick={onClose}
          aria-label="Fermer"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-blue-100 hover:bg-blue-500 dark:hover:bg-blue-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
