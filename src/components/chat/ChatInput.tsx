import { useState, useRef, useCallback } from 'react'
import { Send } from 'lucide-react'
import { useI18n } from '../../context/LanguageContext'

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  sending?: boolean
}

export function ChatInput({ onSend, disabled = false, sending = false }: ChatInputProps) {
  const { t, isRTL } = useI18n()
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled || sending) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [value, disabled, sending, onSend])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 100) + 'px'
  }, [])

  return (
    <div className="flex items-end gap-2 px-3 py-3 border-t border-gray-100 dark:border-dark-border bg-white dark:bg-dark-surface rounded-b-2xl">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={t('chat.placeholder_message')}
        disabled={disabled || sending}
        rows={1}
        dir={isRTL ? 'rtl' : 'ltr'}
        aria-label={t('chat.placeholder_message')}
        className="flex-1 resize-none text-sm bg-gray-50 dark:bg-dark-card text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-xl px-3 py-2 border border-gray-200 dark:border-dark-border focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 disabled:opacity-50 transition-colors overflow-hidden"
        style={{ minHeight: '38px', maxHeight: '100px' }}
      />
      <button
        onClick={handleSend}
        disabled={!value.trim() || disabled || sending}
        aria-label={t('chat.send')}
        className="w-9 h-9 shrink-0 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 dark:disabled:bg-gray-700 text-white disabled:text-gray-400 rounded-xl flex items-center justify-center transition-colors"
      >
        <Send className="w-4 h-4" />
      </button>
    </div>
  )
}
