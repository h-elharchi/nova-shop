import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useI18n } from '../../../context/LanguageContext'
import { loadDispositionCodes } from '../../../lib/chat'
import type { CrcDispositionCode } from '../../../types/chat'

interface WrapUpModalProps {
  wrapUpSeconds: number
  onSubmit: (dispositionId: string | null, notes: string) => void
  onSkip: () => void
}

export function WrapUpModal({ wrapUpSeconds, onSubmit, onSkip }: WrapUpModalProps) {
  const { t, lang } = useI18n()
  const [dispositions, setDispositions] = useState<CrcDispositionCode[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    loadDispositionCodes().then(setDispositions)
  }, [])

  const mins = Math.floor(wrapUpSeconds / 60)
  const secs = String(wrapUpSeconds % 60).padStart(2, '0')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-dark-card rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">{t('chat.admin_wrapup_title')}</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Durée : {mins}:{secs}
            </p>
          </div>
          <button onClick={onSkip} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
            {t('chat.admin_wrapup_disposition')}
          </label>
          <select
            value={selectedId ?? ''}
            onChange={e => setSelectedId(e.target.value || null)}
            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{t('chat.admin_wrapup_select_disposition')}</option>
            {dispositions.map(d => (
              <option key={d.id} value={d.id}>
                [{d.code}] {lang === 'ar' ? d.name_ar : d.name_fr}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-5">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
            {t('chat.admin_wrapup_notes')}
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder={t('chat.admin_wrapup_placeholder')}
            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={onSkip}
            className="px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl transition-colors"
          >
            {t('chat.admin_wrapup_skip')}
          </button>
          <button
            onClick={() => onSubmit(selectedId, notes)}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
          >
            {t('chat.admin_wrapup_submit')}
          </button>
        </div>
      </div>
    </div>
  )
}
