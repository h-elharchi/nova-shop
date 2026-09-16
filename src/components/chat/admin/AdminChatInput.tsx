import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, Zap } from 'lucide-react'
import { useI18n } from '../../../context/LanguageContext'
import { QuickReplyPicker } from './QuickReplyPicker'
import type { CrcQuickReply } from '../../../types/chat'

interface AdminChatInputProps {
  onSend: (text: string) => Promise<void>
  sending: boolean
  disabled?: boolean
  quickReplies: CrcQuickReply[]
}

export function AdminChatInput({ onSend, sending, disabled = false, quickReplies }: AdminChatInputProps) {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }, [text])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setText(val)
    // Trigger picker when last token starts with /
    const lastToken = val.split(/\s/).pop() ?? ''
    if (lastToken.startsWith('/')) {
      setPickerQuery(lastToken.slice(1))
      setShowPicker(true)
    } else {
      setShowPicker(false)
      setPickerQuery('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showPicker && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Escape')) {
      // Let QuickReplyPicker handle these
      return
    }
    if (showPicker && e.key === 'Enter') {
      // Prevent newline, let picker handle selection
      e.preventDefault()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const submit = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed || sending || disabled) return
    setText('')
    setShowPicker(false)
    await onSend(trimmed)
  }, [text, sending, disabled, onSend])

  const handleSelectReply = (message: string) => {
    // Replace the trailing /xxx token with the message
    const tokens = text.split(/\s/)
    tokens.pop()
    const prefix = tokens.length ? tokens.join(' ') + ' ' : ''
    setText(prefix + message)
    setShowPicker(false)
    setPickerQuery('')
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  const togglePicker = () => {
    if (showPicker) {
      setShowPicker(false)
      setPickerQuery('')
    } else {
      setPickerQuery('')
      setShowPicker(true)
    }
    textareaRef.current?.focus()
  }

  return (
    <div className="border-t border-gray-100 dark:border-dark-border p-3">
      <div className="relative flex items-end gap-2 bg-gray-50 dark:bg-gray-700 rounded-xl px-3 py-2">
        {showPicker && (
          <QuickReplyPicker
            replies={quickReplies}
            query={pickerQuery}
            onSelect={handleSelectReply}
            onClose={() => { setShowPicker(false); setPickerQuery('') }}
          />
        )}
        <button
          type="button"
          onClick={togglePicker}
          title="Réponses rapides (/)"
          className={`shrink-0 p-1 transition-colors mb-0.5 ${showPicker ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 hover:text-blue-500 dark:hover:text-blue-400'}`}
        >
          <Zap className="w-4 h-4" />
        </button>
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled || sending}
          placeholder={t('chat.admin_quick_placeholder')}
          className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none focus:outline-none min-h-[24px] max-h-[120px] overflow-y-auto"
        />
        <button
          onClick={submit}
          disabled={!text.trim() || sending || disabled}
          className="shrink-0 p-1.5 text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg transition-colors mb-0.5"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
