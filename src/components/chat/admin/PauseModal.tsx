import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '../../../context/LanguageContext'
import { loadPauseReasons } from '../../../lib/chat'
import type { CrcPauseReason } from '../../../types/chat'

interface PauseModalProps {
  onConfirm: (reasonId: string) => void
  onCancel: () => void
}

export function PauseModal({ onConfirm, onCancel }: PauseModalProps) {
  const { t, lang } = useI18n()
  const [reasons, setReasons] = useState<CrcPauseReason[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPauseReasons().then(data => { setReasons(data); setLoading(false) })
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-dark-card rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white">{t('chat.admin_pause_select')}</h3>
          <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-6">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-2 mb-5">
            {reasons.map(r => (
              <button
                key={r.id}
                onClick={() => setSelected(r.id)}
                className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm transition-colors ${
                  selected === r.id
                    ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300'
                    : 'border-gray-200 dark:border-dark-border text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'
                }`}
              >
                {lang === 'ar' ? r.name_ar : r.name_fr}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl transition-colors"
          >
            {t('forms.cancel')}
          </button>
          <button
            onClick={() => selected && onConfirm(selected)}
            disabled={!selected}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 rounded-xl transition-colors"
          >
            {t('chat.admin_pause_confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
