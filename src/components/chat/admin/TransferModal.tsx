import { useState } from 'react'
import { X, User } from 'lucide-react'
import { useI18n } from '../../../context/LanguageContext'
import { transferConversation } from '../../../lib/chat'
import type { ChatAgent } from '../../../types/chat'

interface TransferModalProps {
  conversationId: string
  agents: ChatAgent[]
  currentAdminId: string
  onSuccess: () => void
  onCancel: () => void
}

export function TransferModal({ conversationId, agents, currentAdminId, onSuccess, onCancel }: TransferModalProps) {
  const { t } = useI18n()
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const availableAgents = agents.filter(a =>
    a.user_id !== currentAdminId &&
    (a.status === 'available' || a.status === 'busy') &&
    a.active_conversations_count < a.capacity
  )

  const handleTransfer = async () => {
    if (!selectedAgent) return
    setLoading(true)
    setError(null)
    try {
      await transferConversation({ conversationId, targetAdminId: selectedAgent, note: note || undefined })
      onSuccess()
    } catch {
      setError(t('chat.admin_transfer_error'))
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-dark-card rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white">{t('chat.admin_transfer_title')}</h3>
          <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {availableAgents.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
            {t('chat.admin_transfer_no_agents')}
          </p>
        ) : (
          <>
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">{t('chat.admin_transfer_agent')}</p>
              <div className="space-y-2">
                {availableAgents.map(a => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedAgent(a.user_id)}
                    className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm transition-colors ${
                      selectedAgent === a.user_id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                        : 'border-gray-200 dark:border-dark-border text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 shrink-0" />
                        <span className="font-mono text-xs">{a.user_id.slice(0, 8)}…</span>
                      </div>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {a.active_conversations_count}/{a.capacity} conv.
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                {t('chat.admin_transfer_note')}
              </label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={t('chat.admin_transfer_note_placeholder')}
                className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </>
        )}

        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl transition-colors"
          >
            {t('forms.cancel')}
          </button>
          {availableAgents.length > 0 && (
            <button
              onClick={handleTransfer}
              disabled={!selectedAgent || loading}
              className="flex-1 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors"
            >
              {loading ? '…' : t('chat.admin_transfer_submit')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
