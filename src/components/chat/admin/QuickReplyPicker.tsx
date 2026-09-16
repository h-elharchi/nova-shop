import { useState, useEffect } from 'react'
import { useI18n } from '../../../context/LanguageContext'
import type { CrcQuickReply } from '../../../types/chat'

interface QuickReplyPickerProps {
  replies: CrcQuickReply[]
  query: string
  onSelect: (message: string) => void
  onClose: () => void
}

export function QuickReplyPicker({ replies, query, onSelect, onClose }: QuickReplyPickerProps) {
  const { t, lang } = useI18n()
  const [activeIdx, setActiveIdx] = useState(0)

  const filtered = replies.filter(r => {
    const q = query.toLowerCase()
    return (
      !q ||
      r.shortcut?.toLowerCase().includes(q) ||
      r.title_fr.toLowerCase().includes(q) ||
      r.title_ar.toLowerCase().includes(q)
    )
  })

  useEffect(() => { setActiveIdx(0) }, [query])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
      if (e.key === 'Enter' && filtered[activeIdx]) {
        e.preventDefault()
        onSelect(lang === 'ar' ? filtered[activeIdx].message_ar : filtered[activeIdx].message_fr)
      }
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [filtered, activeIdx, lang, onSelect, onClose])

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl shadow-xl overflow-hidden max-h-52 overflow-y-auto z-10">
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center px-4 py-3">
          {t('chat.admin_quick_no_results')}
        </p>
      ) : (
        filtered.map((r, i) => (
          <button
            key={r.id}
            onClick={() => onSelect(lang === 'ar' ? r.message_ar : r.message_fr)}
            className={`w-full text-left px-4 py-2.5 transition-colors ${
              i === activeIdx
                ? 'bg-blue-50 dark:bg-blue-900/20'
                : 'hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            <div className="flex items-center gap-2">
              {r.shortcut && (
                <span className="text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded shrink-0">
                  /{r.shortcut}
                </span>
              )}
              <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {lang === 'ar' ? r.title_ar : r.title_fr}
              </span>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5 pl-0">
              {lang === 'ar' ? r.message_ar : r.message_fr}
            </p>
          </button>
        ))
      )}
    </div>
  )
}
