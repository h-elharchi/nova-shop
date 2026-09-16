import { useState } from 'react'
import { RefreshCw, X, Send, ShoppingCart, Archive, ChevronDown } from 'lucide-react'
import { AdminLayout } from './AdminLayout'
import { useEmailMessages } from '../../hooks/useEmailMessages'
import { useEmailAccounts } from '../../hooks/useEmailAccounts'
import { sendEmail } from '../../lib/email'
import { OrderCreateModal } from '../../components/orders/OrderCreateModal'
import { useI18n } from '../../context/LanguageContext'
import type { EmailMessage, EmailStatus, Customer } from '../../types'

const STATUS_BADGE: Record<EmailStatus, string> = {
  new:      'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  read:     'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  replied:  'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  archived: 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500',
}

function fmtDate(iso: string): string {
  const d   = new Date(iso)
  const now = new Date()
  const diffH = (now.getTime() - d.getTime()) / 3600000

  if (diffH < 1)  return `il y a ${Math.floor(diffH * 60)} min`
  if (diffH < 24) return `il y a ${Math.floor(diffH)}h`
  return d.toLocaleDateString('fr-MA', { dateStyle: 'short' })
}

function extractSenderName(from: string): string {
  const match = from.match(/^([^<]+)</)
  return match ? match[1].trim() : from
}

function extractSenderEmail(from: string): string {
  const match = from.match(/<([^>]+)>/)
  return match ? match[1] : from
}

interface ThreadPanelProps {
  message: EmailMessage
  onClose: () => void
  accounts: { id: string; gmail_address: string; label: string }[]
  onReplied: (id: string) => void
  onArchived: (id: string) => void
  t: (k: string) => string
}

function ThreadPanel({ message, onClose, accounts, onReplied, onArchived, t }: ThreadPanelProps) {
  const [reply, setReply]         = useState('')
  const [sending, setSending]     = useState(false)
  const [sendMsg, setSendMsg]     = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [accountId, setAccountId] = useState(message.email_account_id)

  const senderEmail = extractSenderEmail(message.from_address)

  async function handleSend() {
    if (!reply.trim() || !accountId) return
    setSending(true)
    setSendMsg(null)
    try {
      await sendEmail({
        email_account_id: accountId,
        to:               senderEmail,
        subject:          message.subject ? `Re: ${message.subject}` : 'Re:',
        body_text:        reply.trim(),
        reply_to_message_id: message.id,
        gmail_thread_id:  message.gmail_thread_id,
        customer_id:      message.customer_id ?? undefined,
      })
      setSendMsg(t('email.sent'))
      onReplied(message.id)
      setReply('')
    } catch (err) {
      setSendMsg(err instanceof Error ? err.message : t('email.send_error'))
    } finally {
      setSending(false)
      setTimeout(() => setSendMsg(null), 4000)
    }
  }

  const prefillCustomer: Pick<Customer, 'first_name' | 'last_name' | 'phone'> | undefined =
    message.customer_first_name
      ? { first_name: message.customer_first_name ?? '', last_name: message.customer_last_name ?? '', phone: message.customer_phone ?? '' }
      : undefined

  return (
    <div className="flex flex-col h-full border-l border-gray-100 dark:border-dark-border overflow-hidden">
      {/* Header panneau */}
      <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 dark:border-dark-border shrink-0">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">
            {message.subject ?? '(sans objet)'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {extractSenderName(message.from_address)} &lt;{senderEmail}&gt;
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">{fmtDate(message.received_at)}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 shrink-0 ml-2">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Corps email */}
      <div className="flex-1 overflow-y-auto p-5">
        {message.body_html ? (
          <div
            className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300"
            dangerouslySetInnerHTML={{ __html: message.body_html }}
          />
        ) : (
          <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-sans">
            {message.body_text ?? '(aucun contenu)'}
          </pre>
        )}
      </div>

      {/* Actions */}
      <div className="px-5 pb-2 flex gap-2 shrink-0">
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors font-medium"
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          {t('email.create_order')}
        </button>
        <button
          onClick={() => { onArchived(message.id) }}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors font-medium"
        >
          <Archive className="w-3.5 h-3.5" />
          {t('email.archive')}
        </button>
      </div>

      {/* Zone de réponse */}
      <div className="p-5 border-t border-gray-100 dark:border-dark-border shrink-0 space-y-3">
        {accounts.length > 1 && (
          <div className="relative">
            <select
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 transition appearance-none"
            >
              {accounts.map(a => <option key={a.id} value={a.id}>{a.label} ({a.gmail_address})</option>)}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
          </div>
        )}
        <textarea
          value={reply}
          onChange={e => setReply(e.target.value)}
          rows={4}
          placeholder={t('email.reply_placeholder')}
          className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none placeholder:text-gray-400"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={handleSend}
            disabled={sending || !reply.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            {sending ? t('email.sending') : t('email.send')}
          </button>
          {sendMsg && <span className="text-xs text-gray-500 dark:text-gray-400">{sendMsg}</span>}
        </div>
      </div>

      {showCreate && (
        <OrderCreateModal
          onClose={() => setShowCreate(false)}
          prefillCustomer={prefillCustomer}
          defaultChannel="email"
        />
      )}
    </div>
  )
}

const FILTER_TABS: { key: string; statusKey: EmailStatus | '' }[] = [
  { key: 'email.filter_all',     statusKey: ''         },
  { key: 'email.filter_new',     statusKey: 'new'      },
  { key: 'email.filter_replied', statusKey: 'replied'  },
  { key: 'email.filter_archived',statusKey: 'archived' },
]

export function EmailPage() {
  const { t } = useI18n()
  const [activeStatus, setActiveStatus] = useState<EmailStatus | ''>('')
  const [selected, setSelected]         = useState<EmailMessage | null>(null)

  const { messages, loading, error, unreadCount, refetch, markAsRead, markAsArchived, markAsReplied } =
    useEmailMessages({ status: activeStatus })

  const { accounts, syncing, syncNow } = useEmailAccounts()

  function handleSelect(msg: EmailMessage) {
    setSelected(msg)
    if (msg.status === 'new') markAsRead(msg.id)
  }

  function handleArchived(id: string) {
    markAsArchived(id)
    if (selected?.id === id) setSelected(null)
  }

  return (
    <AdminLayout>
      <div className="flex flex-col" style={{ height: 'calc(100vh - 3.5rem)' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('email.title')}</h1>
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <button
            onClick={syncNow}
            disabled={syncing}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-xl bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? t('email.syncing') : t('email.sync')}
          </button>
        </div>

        {/* Onglets filtre */}
        <div className="flex gap-1 mb-4 shrink-0">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveStatus(tab.statusKey); setSelected(null) }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeStatus === tab.statusKey
                  ? 'bg-blue-600 text-white'
                  : 'bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {t(tab.key)}
            </button>
          ))}
        </div>

        {/* Contenu : liste + panneau */}
        <div className="flex flex-1 min-h-0 gap-0 bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-dark-border overflow-hidden">
          {/* Liste emails */}
          <div className={`flex flex-col ${selected ? 'w-1/2 border-r border-gray-100 dark:border-dark-border' : 'w-full'}`}>
            {loading && (
              <div className="flex justify-center items-center py-16 flex-1">
                <div className="w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {!loading && error && <p className="p-4 text-red-500 text-sm">{error}</p>}
            {!loading && !error && messages.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
                {t('email.no_messages')}
              </div>
            )}
            {!loading && messages.length > 0 && (
              <div className="overflow-y-auto flex-1">
                {messages.map(msg => (
                  <button
                    key={msg.id}
                    onClick={() => handleSelect(msg)}
                    className={`w-full text-left px-4 py-3.5 border-b border-gray-50 dark:border-dark-border transition-colors ${
                      selected?.id === msg.id
                        ? 'bg-blue-50 dark:bg-blue-900/20'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className={`text-sm font-medium truncate ${msg.status === 'new' ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                        {msg.status === 'new' && <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-2 mb-0.5" />}
                        {extractSenderName(msg.from_address)}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{fmtDate(msg.received_at)}</span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 font-medium truncate mb-0.5">
                      {msg.subject ?? '(sans objet)'}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                      {msg.body_text?.slice(0, 100) ?? ''}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[msg.status]}`}>
                        {t(`email.status_${msg.status}`)}
                      </span>
                      {msg.account_label && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">{msg.account_label}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Panneau thread */}
          {selected && (
            <div className="w-1/2 flex flex-col min-h-0">
              <ThreadPanel
                message={selected}
                accounts={accounts}
                onClose={() => setSelected(null)}
                onReplied={(id) => { markAsReplied(id); refetch() }}
                onArchived={handleArchived}
                t={t}
              />
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
