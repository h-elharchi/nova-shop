import { useState, useEffect, useRef, useCallback } from 'react'
import {
  MessageSquare, Mail, Phone, Clock, X, ArrowLeftRight,
  ChevronRight, User, Inbox, AlertCircle, Copy, ExternalLink, RefreshCw, ShoppingBag, Plus,
} from 'lucide-react'
import { AdminLayout } from './AdminLayout'
import { useI18n } from '../../context/LanguageContext'
import { useAuth } from '../../hooks/useAuth'
import { useAgentCtx } from '../../context/AgentContext'
import { useWorkspace } from '../../hooks/useWorkspace'
import { useCallbackDetail } from '../../hooks/useCallbacks'
import { useChatMessages } from '../../hooks/useChatMessages'
import { useQuickReplies } from '../../hooks/useQuickReplies'
import { useNotifications } from '../../hooks/useNotifications'
import { ChatMessage } from '../../components/chat/ChatMessage'
import { AdminChatInput } from '../../components/chat/admin/AdminChatInput'
import { CustomerOrdersPanel } from '../../components/orders/CustomerOrdersPanel'
import { OrderCreateModal } from '../../components/orders/OrderCreateModal'
import { PauseModal } from '../../components/chat/admin/PauseModal'
import { supabase } from '../../lib/supabase'
import { loadDispositionCodes } from '../../lib/chat'
import { sendEmail, triggerEmailSync } from '../../lib/email'
import type { InteractionWithDetails, InteractionChannel, UnifiedWrapUpData, CallbackAttemptResult } from '../../types/interactions'
import type { CrcDispositionCode } from '../../types/chat'
import type { EmailMessage } from '../../types'

// ─── Channel badge ────────────────────────────────────────────

function ChannelBadge({ channel }: { channel: InteractionChannel }) {
  const colors: Record<InteractionChannel, string> = {
    chat:     'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    email:    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    callback: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  }
  const icons: Record<InteractionChannel, React.ReactNode> = {
    chat:     <MessageSquare className="w-3 h-3" />,
    email:    <Mail className="w-3 h-3" />,
    callback: <Phone className="w-3 h-3" />,
  }
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium ${colors[channel]}`}>
      {icons[channel]}
    </span>
  )
}

// ─── Duration counter ─────────────────────────────────────────

function Duration({ since }: { since: string }) {
  const [s, setS] = useState(Math.floor((Date.now() - new Date(since).getTime()) / 1000))
  useEffect(() => {
    const id = setInterval(() => setS(Math.floor((Date.now() - new Date(since).getTime()) / 1000)), 10000)
    return () => clearInterval(id)
  }, [since])
  const m = Math.floor(s / 60)
  return <span className="text-xs text-gray-400 dark:text-gray-500">{m}m</span>
}

// ─── Unified WrapUp Modal ─────────────────────────────────────

function UnifiedWrapUpModal({
  interaction,
  onClose,
  onSubmit,
}: {
  interaction: InteractionWithDetails
  onClose: () => void
  onSubmit: (data: UnifiedWrapUpData) => void
}) {
  const { t, lang } = useI18n()
  const [dispositions, setDispositions] = useState<CrcDispositionCode[]>([])
  const [outcome, setOutcome] = useState<'treated' | 'not_treated'>('treated')
  const [dispositionId, setDispositionId] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [continuation, setContinuation] = useState<'reschedule' | 'requeue' | 'close'>('close')
  const [rescheduleAt, setRescheduleAt] = useState('')

  const elapsed = interaction.wrap_up_started_at
    ? Math.floor((Date.now() - new Date(interaction.wrap_up_started_at).getTime()) / 1000)
    : 0
  const mins = Math.floor(elapsed / 60)
  const secs = String(elapsed % 60).padStart(2, '0')

  useEffect(() => { loadDispositionCodes().then(setDispositions) }, [])

  function handleSubmit() {
    onSubmit({
      outcome,
      dispositionId,
      notes,
      continuation: outcome === 'not_treated' ? continuation : 'close',
      rescheduleAt: continuation === 'reschedule' ? rescheduleAt || null : null,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-dark-card rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {t('interactions.wrap_up_title')} — <ChannelBadge channel={interaction.channel} />
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">Durée : {mins}:{secs}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Outcome */}
        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1.5 uppercase tracking-wide">
            {t('interactions.wrap_up_outcome')}
          </label>
          <div className="flex gap-2">
            {(['treated', 'not_treated'] as const).map(o => (
              <button key={o} onClick={() => setOutcome(o)}
                className={`flex-1 py-2 text-sm font-medium rounded-xl border transition-colors ${outcome === o ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300'}`}>
                {t(`interactions.outcome_${o}`)}
              </button>
            ))}
          </div>
        </div>

        {/* Disposition */}
        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1.5 uppercase tracking-wide">
            {t('interactions.wrap_up_code')}
          </label>
          <select value={dispositionId ?? ''} onChange={e => setDispositionId(e.target.value || null)}
            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-dark-surface text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">—</option>
            {dispositions.map(d => (
              <option key={d.id} value={d.id}>[{d.code}] {lang === 'ar' ? d.name_ar : d.name_fr}</option>
            ))}
          </select>
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1.5 uppercase tracking-wide">
            {t('interactions.wrap_up_notes')}
          </label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-dark-surface text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
        </div>

        {/* Continuation (if not treated) */}
        {outcome === 'not_treated' && (
          <div>
            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1.5 uppercase tracking-wide">
              {t('interactions.wrap_up_continuation')}
            </label>
            <div className="space-y-1.5">
              {(['reschedule', 'requeue', 'close'] as const).map(c => (
                <label key={c} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" checked={continuation === c} onChange={() => setContinuation(c)}
                    className="accent-blue-600" />
                  <span className="text-gray-700 dark:text-gray-300">{t(`interactions.wrap_up_${c}`)}</span>
                </label>
              ))}
            </div>
            {continuation === 'reschedule' && (
              <input type="datetime-local" value={rescheduleAt} onChange={e => setRescheduleAt(e.target.value)}
                className="mt-2 w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-dark-surface text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            )}
          </div>
        )}

        <button onClick={handleSubmit}
          className="w-full py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors">
          {t('interactions.wrap_up_validate')}
        </button>
      </div>
    </div>
  )
}

// ─── Interaction list item ────────────────────────────────────

function InteractionItem({ interaction, isActive, onClick }: {
  interaction: InteractionWithDetails
  isActive: boolean
  onClick: () => void
}) {
  const name = [interaction.customer_first_name, interaction.customer_last_name].filter(Boolean).join(' ') || '—'
  const since = interaction.assigned_at ?? interaction.queued_at

  return (
    <button onClick={onClick} className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left rounded-xl transition-colors ${isActive ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}>
      <ChannelBadge channel={interaction.channel} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isActive ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'}`}>{name}</p>
        {interaction.subject && (
          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{interaction.subject}</p>
        )}
      </div>
      <Duration since={since} />
      {isActive && <ChevronRight className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
    </button>
  )
}

// ─── Chat Panel ───────────────────────────────────────────────

function ChatPanel({ interaction, agentId, onWrapUp }: {
  interaction: InteractionWithDetails
  agentId: string
  onWrapUp: () => void
}) {
  const { t } = useI18n()
  const { quickReplies } = useQuickReplies()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const [chatConvId, setChatConvId] = useState<string | null>(null)

  useEffect(() => {
    // Retrouver la conversation chat liée
    supabase
      .from('chat_conversations')
      .select('id')
      .eq('interaction_id', interaction.id)
      .single()
      .then(({ data }) => setChatConvId(data?.id ?? null))
  }, [interaction.id])

  const { messages, loading, sending, send } = useChatMessages(chatConvId)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = useCallback(async (text: string) => {
    await send(text, 'admin', agentId)
  }, [send, agentId])

  // Le client a fermé sa fenêtre de chat : la saisie n'a plus de sens côté agent,
  // qui doit clôturer via le bouton "Terminer" (déjà visible dans l'en-tête).
  const customerLeft = messages.some(m => m.sender_type === 'system' && m.message === 'customer_left')

  if (loading || !chatConvId) {
    return (
      <div className="flex items-center justify-center flex-1 text-gray-400 text-sm">
        {t('common.loading')}
      </div>
    )
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {messages.map(msg => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="border-t border-gray-100 dark:border-dark-border p-3 shrink-0">
        {interaction.status === 'wrap_up' ? (
          <div className="flex items-center justify-center">
            <button onClick={onWrapUp}
              className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-xl">
              {t('interactions.wrap_up_title')}
            </button>
          </div>
        ) : customerLeft ? (
          <p className="flex items-center gap-1.5 text-xs text-orange-600 dark:text-orange-400 px-1 py-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {t('chat.customer_left_notice')}
          </p>
        ) : (
          <AdminChatInput
            onSend={handleSend}
            sending={sending}
            disabled={interaction.status === 'closed'}
            quickReplies={quickReplies}
          />
        )}
      </div>
    </>
  )
}

// ─── Email Panel ──────────────────────────────────────────────

function EmailPanel({ interaction, onWrapUp }: {
  interaction: InteractionWithDetails
  onWrapUp: () => void
}) {
  const { t } = useI18n()
  const [thread, setThread] = useState<EmailMessage[]>([])
  const [replyBody, setReplyBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sentMsg, setSentMsg] = useState('')
  const [emailAccountId, setEmailAccountId] = useState<string | null>(null)
  const [showCreateCustomer, setShowCreateCustomer] = useState(false)

  useEffect(() => {
    supabase
      .from('email_messages')
      .select('*, email_threads!thread_id(gmail_thread_id, email_account_id)')
      .eq('direction', 'in')
      .order('received_at', { ascending: true })
      .then(async ({ data }) => {
        if (!data) return
        // Trouver les messages du thread lié à cette interaction
        const { data: threadRow } = await supabase
          .from('interactions')
          .select('email_threads!inner(gmail_thread_id, email_account_id, id)')
          .eq('id', interaction.id)
          .single()

        if (threadRow) {
          const thrRaw = (threadRow as unknown as { email_threads: { gmail_thread_id: string; email_account_id: string } | { gmail_thread_id: string; email_account_id: string }[] }).email_threads
          const thr = Array.isArray(thrRaw) ? thrRaw[0] : thrRaw
          setEmailAccountId(thr.email_account_id)
          const filtered = (data as EmailMessage[]).filter(m => {
            const mt = m as EmailMessage & { email_threads?: { gmail_thread_id: string } }
            return mt.email_threads?.gmail_thread_id === thr.gmail_thread_id ||
              m.gmail_thread_id === thr.gmail_thread_id
          })
          setThread(filtered)
        } else {
          // Pas de thread lié — afficher les messages liés via customer_id
          const msgs = data.filter(m =>
            interaction.customer_id && (m as EmailMessage).customer_id === interaction.customer_id
          ) as EmailMessage[]
          setThread(msgs)
        }
      })
  }, [interaction.id, interaction.customer_id])

  const firstIn = thread.find(m => m.direction === 'in')

  async function handleSendReply() {
    if (!replyBody.trim() || !emailAccountId || !firstIn) return
    setSending(true)
    try {
      await sendEmail({
        email_account_id: emailAccountId,
        to: firstIn.from_address,
        subject: `Re: ${firstIn.subject ?? ''}`,
        body_text: replyBody,
        gmail_thread_id: firstIn.gmail_thread_id,
        customer_id: interaction.customer_id ?? undefined,
      })
      setSentMsg(t('email.sent'))
      setReplyBody('')
      setTimeout(() => setSentMsg(''), 3000)
    } catch {
      setSentMsg(t('email.send_error'))
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {!interaction.customer_id && firstIn && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 bg-orange-50 dark:bg-orange-900/20 border-b border-orange-100 dark:border-orange-900/40 shrink-0">
          <span className="text-xs text-orange-700 dark:text-orange-400">{t('interactions.create_customer_banner')}</span>
          <button onClick={() => setShowCreateCustomer(true)}
            className="text-xs font-medium text-orange-700 dark:text-orange-400 hover:underline shrink-0">
            {t('interactions.create_customer_btn')}
          </button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {thread.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">{t('email.no_messages')}</p>
        )}
        {thread.map(msg => (
          <div key={msg.id} className={`rounded-xl p-3 text-sm ${msg.direction === 'out' ? 'bg-blue-50 dark:bg-blue-900/20 ml-8' : 'bg-gray-50 dark:bg-gray-800 mr-8'}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{msg.from_address}</span>
              <span className="text-xs text-gray-400">{new Date(msg.received_at).toLocaleDateString('fr-MA')}</span>
            </div>
            {msg.subject && <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-medium">{msg.subject}</p>}
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap text-xs">{msg.body_text ?? ''}</p>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-100 dark:border-dark-border p-3 shrink-0 space-y-2">
        {sentMsg && <p className="text-xs text-green-600 dark:text-green-400">{sentMsg}</p>}
        {interaction.status === 'wrap_up' ? (
          <div className="flex justify-center">
            <button onClick={onWrapUp}
              className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-xl">
              {t('interactions.wrap_up_title')}
            </button>
          </div>
        ) : (
          <>
            <textarea
              value={replyBody}
              onChange={e => setReplyBody(e.target.value)}
              rows={3}
              placeholder={t('email.reply_placeholder')}
              className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <button onClick={handleSendReply} disabled={sending || !replyBody.trim()}
              className="w-full py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-50">
              {sending ? t('email.sending') : t('email.send')}
            </button>
          </>
        )}
      </div>
      {showCreateCustomer && firstIn && (
        <CreateCustomerModal
          interactionId={interaction.id}
          defaultFirstName={parseSenderAddress(firstIn.from_address).firstName}
          defaultLastName={parseSenderAddress(firstIn.from_address).lastName}
          defaultEmail={parseSenderAddress(firstIn.from_address).email}
          onClose={() => setShowCreateCustomer(false)}
        />
      )}
    </>
  )
}

// ─── Callback Panel ───────────────────────────────────────────

function CallbackPanel({ interaction, onWrapUp }: {
  interaction: InteractionWithDetails
  onWrapUp: () => void
}) {
  const { t } = useI18n()
  const [callbackId, setCallbackId] = useState<string | null>(null)
  const [result, setResult] = useState<CallbackAttemptResult | ''>('')
  const [comment, setComment] = useState('')
  const [nextAt, setNextAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgIsError, setMsgIsError] = useState(false)

  useEffect(() => {
    supabase
      .from('callback_requests')
      .select('id')
      .eq('interaction_id', interaction.id)
      .single()
      .then(({ data }) => setCallbackId(data?.id ?? null))
  }, [interaction.id])

  const { callback, attempts, refetch } = useCallbackDetail(callbackId)

  const phone = callback?.phone ?? interaction.customer_phone ?? ''
  const tel   = phone ? (phone.startsWith('+') ? phone : '+212' + phone.slice(1)) : ''
  const waMsg = encodeURIComponent(`Bonjour ${callback?.first_name ?? interaction.customer_first_name ?? ''}`)

  async function handleRecordAttempt() {
    if (!callbackId || !result) return
    setSubmitting(true)
    const { error } = await supabase.rpc('record_callback_attempt', {
      p_callback_request_id: callbackId,
      p_result:              result,
      p_comment:             comment || null,
      p_next_attempt_at:     nextAt || null,
    })
    if (!error) {
      setMsgIsError(false)
      setMsg(t('callback.record_attempt'))
      setResult('')
      setComment('')
      setNextAt('')
      refetch()
      setTimeout(() => setMsg(''), 2000)
    } else {
      setMsgIsError(true)
      setMsg(error.message)
      setTimeout(() => setMsg(''), 4000)
    }
    setSubmitting(false)
  }

  const ATTEMPT_RESULTS: CallbackAttemptResult[] = [
    'reached', 'no_answer', 'busy', 'voicemail', 'wrong_number', 'callback_later',
  ]

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Client info */}
      <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            {callback?.first_name ?? interaction.customer_first_name} {callback?.last_name ?? interaction.customer_last_name}
          </h3>
          <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">
            {t('callback.attempts')} {(callback?.attempts_count ?? 0) + 1}/{callback?.max_attempts ?? 3}
          </span>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <a href={`tel:${tel}`}
            className="flex items-center gap-1.5 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-medium transition-colors">
            <Phone className="w-4 h-4" />{phone}
          </a>
          <button onClick={() => { navigator.clipboard.writeText(phone) }}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <Copy className="w-4 h-4" />
          </button>
          {tel && (
            <a href={`https://wa.me/${tel.replace('+', '')}?text=${waMsg}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm">
              <ExternalLink className="w-3.5 h-3.5" />WA
            </a>
          )}
        </div>

        {callback?.email && (
          <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
            <Mail className="w-3.5 h-3.5" />{callback.email}
          </p>
        )}
        {(callback?.city || callback?.district) && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            📍 {[callback.city, callback.district, callback.address].filter(Boolean).join(' · ')}
          </p>
        )}
        {callback?.message && (
          <div className="mt-1 p-2 bg-white dark:bg-gray-800 rounded-lg">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">{t('callback.message')}</p>
            <p className="text-sm text-gray-700 dark:text-gray-300">{callback.message}</p>
          </div>
        )}
      </div>

      {/* Attempts history */}
      {attempts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('callback.attempts')}</p>
          {attempts.map(a => (
            <div key={a.id} className="flex items-start gap-2 text-xs bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
              <span className="text-gray-400 shrink-0">{new Date(a.attempted_at).toLocaleDateString('fr-MA')}</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">{t(`callback.result_${a.result}`)}</span>
              {a.comment && <span className="text-gray-500 dark:text-gray-400">— {a.comment}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Record attempt */}
      {interaction.status !== 'wrap_up' && (
        <div className="space-y-2 border border-gray-200 dark:border-gray-600 rounded-xl p-3">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('callback.attempt_result')}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {ATTEMPT_RESULTS.map(r => (
              <button key={r} onClick={() => setResult(r)}
                className={`text-xs py-1.5 px-2 rounded-lg border transition-colors ${result === r ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300'}`}>
                {t(`callback.result_${r}`)}
              </button>
            ))}
          </div>
          <input value={comment} onChange={e => setComment(e.target.value)} placeholder={t('callback.comment')}
            className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100" />
          {result === 'callback_later' && (
            <input type="datetime-local" value={nextAt} onChange={e => setNextAt(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100" />
          )}
          {msg && <p className={`text-xs ${msgIsError ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{msg}</p>}
          <button onClick={handleRecordAttempt} disabled={!result || submitting}
            className="w-full py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-50">
            {t('callback.record_attempt')}
          </button>
        </div>
      )}

      {interaction.status === 'wrap_up' && (
        <div className="flex justify-center">
          <button onClick={onWrapUp}
            className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-xl">
            {t('interactions.wrap_up_title')}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Customer 360 sidebar ─────────────────────────────────────

function Customer360({ interaction }: { interaction: InteractionWithDetails }) {
  const { t } = useI18n()
  const [tab, setTab] = useState<'orders' | 'interactions'>('orders')
  const [interactions, setInteractions] = useState<{ id: string; channel: string; status: string; created_at: string }[]>([])
  const [showCreateOrder, setShowCreateOrder] = useState(false)

  useEffect(() => {
    if (!interaction.customer_id) return
    supabase.from('interactions').select('id, channel, status, created_at')
      .eq('customer_id', interaction.customer_id).order('created_at', { ascending: false }).limit(5)
      .then(({ data }) => setInteractions(data ?? []))
  }, [interaction.customer_id])

  const phone = interaction.customer_phone ?? ''
  const tel   = phone ? (phone.startsWith('+') ? phone : '+212' + phone.slice(1)) : ''

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Client info */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm">
            {(interaction.customer_first_name?.[0] ?? '?').toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-gray-900 dark:text-white text-sm">
              {interaction.customer_first_name} {interaction.customer_last_name}
            </p>
            {interaction.customer_number && (
              <p className="text-xs text-gray-400">{interaction.customer_number}</p>
            )}
          </div>
        </div>
        <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
          {phone && (
            <a href={`tel:${tel}`} className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400">
              <Phone className="w-3.5 h-3.5" />{phone}
            </a>
          )}
          {interaction.customer_email && (
            <div className="flex items-center gap-1">
              <Mail className="w-3.5 h-3.5" />{interaction.customer_email}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-100 dark:border-gray-700">
        <button
          onClick={() => setTab('orders')}
          className={`flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-t transition-colors ${tab === 'orders' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
        >
          <ShoppingBag className="w-3 h-3" />{t('customers.orders_tab')}
        </button>
        <button
          onClick={() => setTab('interactions')}
          className={`flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-t transition-colors ${tab === 'interactions' ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
        >
          <MessageSquare className="w-3 h-3" />{t('customers_v2.interactions_tab')}
        </button>
      </div>

      {/* Orders tab */}
      {tab === 'orders' && interaction.customer_id && (
        <CustomerOrdersPanel
          customerId={interaction.customer_id}
          prefillCustomer={{
            first_name: interaction.customer_first_name ?? '',
            last_name:  interaction.customer_last_name  ?? '',
            phone:      interaction.customer_phone       ?? '',
          }}
          compact
        />
      )}
      {tab === 'orders' && !interaction.customer_id && (
        <div className="space-y-2">
          <div className="flex justify-end">
            <button
              onClick={() => setShowCreateOrder(true)}
              className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              <Plus className="w-3 h-3" />{t('customers.add_order')}
            </button>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-3">{t('order.no_orders')}</p>
        </div>
      )}

      {showCreateOrder && (
        <OrderCreateModal
          onClose={() => setShowCreateOrder(false)}
          defaultChannel={interaction.channel === 'email' ? 'email' : interaction.channel === 'callback' ? 'phone' : 'phone'}
          prefillCustomer={{
            first_name: interaction.customer_first_name ?? '',
            last_name:  interaction.customer_last_name  ?? '',
            phone:      interaction.customer_phone       ?? '',
          }}
        />
      )}

      {/* Interactions tab */}
      {tab === 'interactions' && (
        <div className="space-y-1.5">
          {interactions.length === 0 ? (
            <p className="text-xs text-gray-400">{t('interactions.no_active')}</p>
          ) : (
            interactions.map(i => (
              <div key={i.id} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-2 py-1.5">
                <ChannelBadge channel={i.channel as InteractionChannel} />
                <span className="text-xs text-gray-600 dark:text-gray-400">{new Date(i.created_at).toLocaleDateString('fr-MA')}</span>
                <span className="text-xs text-gray-400 ml-auto">{t(`interactions.status_${i.status}`) || i.status}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── Inline Transfer Modal ────────────────────────────────────

interface InlineTransferModalProps {
  onTransfer: (targetAgentId: string, note: string) => Promise<void>
  onClose: () => void
  currentAgentId: string | null
}

function InlineTransferModal({ onTransfer, onClose, currentAgentId }: InlineTransferModalProps) {
  const { t } = useI18n()
  const [agents, setAgents] = useState<{ user_id: string; active_conversations_count: number; capacity: number }[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase
      .from('chat_agents')
      .select('user_id, active_conversations_count, capacity, status')
      .in('status', ['available', 'busy'])
      .then(({ data }) => {
        setAgents((data ?? []).filter((a: { user_id: string; active_conversations_count: number; capacity: number; status: string }) =>
          a.user_id !== currentAgentId && a.active_conversations_count < a.capacity
        ))
      })
  }, [currentAgentId])

  async function handleSubmit() {
    if (!selected) return
    setLoading(true)
    await onTransfer(selected, note)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-dark-card rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white">{t('chat.admin_transfer_title')}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        {agents.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">{t('chat.admin_transfer_no_agents')}</p>
        ) : (
          <div className="space-y-2 mb-4">
            {agents.map(a => (
              <button key={a.user_id} onClick={() => setSelected(a.user_id)}
                className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm transition-colors ${selected === a.user_id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' : 'border-gray-200 dark:border-dark-border text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'}`}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs">{a.user_id.slice(0, 8)}…</span>
                  <span className="text-xs text-gray-400">{a.active_conversations_count}/{a.capacity}</span>
                </div>
              </button>
            ))}
          </div>
        )}
        <input
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={t('chat.admin_transfer_note_placeholder')}
          className="w-full mb-4 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 rounded-xl transition-colors">
            {t('forms.cancel')}
          </button>
          {agents.length > 0 && (
            <button onClick={handleSubmit} disabled={!selected || loading}
              className="flex-1 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors">
              {loading ? '…' : t('chat.admin_transfer_submit')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Create Customer Modal ──────────────────────────────────────

function parseSenderAddress(fromAddress: string): { firstName: string; lastName: string; email: string } {
  const match = fromAddress.match(/^"?([^"<]*)"?\s*<([^>]+)>$/)
  const email = (match ? match[2] : fromAddress).trim()
  const name = (match ? match[1] : '').trim()
  const [firstName, ...rest] = name.split(/\s+/).filter(Boolean)
  return { firstName: firstName ?? '', lastName: rest.join(' '), email }
}

function CreateCustomerModal({ interactionId, defaultFirstName, defaultLastName, defaultEmail, onClose }: {
  interactionId: string
  defaultFirstName?: string
  defaultLastName?: string
  defaultEmail?: string
  onClose: () => void
}) {
  const { t } = useI18n()
  const [firstName, setFirstName] = useState(defaultFirstName ?? '')
  const [lastName, setLastName] = useState(defaultLastName ?? '')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState(defaultEmail ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!firstName.trim()) { setError(t('interactions.create_customer_error_name')); return }
    setError('')
    setSaving(true)
    const { error: err } = await supabase.rpc('create_customer_from_interaction', {
      p_interaction_id: interactionId,
      p_first_name: firstName.trim(),
      p_last_name: lastName.trim(),
      p_phone: phone.trim() || null,
      p_email: email.trim() || null,
    })
    setSaving(false)
    if (!err) onClose()
    else setError(err.message)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-dark-card rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white">{t('interactions.create_customer_title')}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t('chat.first_name')} *</label>
            <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t('chat.last_name')}</label>
            <input type="text" value={lastName} onChange={e => setLastName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t('chat.phone')}</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t('callback.form_email')}</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 rounded-xl transition-colors">
            {t('forms.cancel')}
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors">
            {saving ? '…' : t('interactions.create_customer_submit')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main WorkspacePage ───────────────────────────────────────

type ChannelFilter = 'all' | InteractionChannel

export function WorkspacePage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const { myStatus, waitingCount, setStatus, statusDuration } = useAgentCtx()

  const workspace = useWorkspace(user?.id ?? null)
  const {
    activeInteraction, myInteractions, queueCounts,
    openInteraction, closePanel,
    startWrapUp, closeInteraction, transferInteraction,
  } = workspace

  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all')
  const [activeTab, setActiveTab] = useState<'mine' | 'queue'>('mine')
  const [showPause, setShowPause] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [showWrapUp, setShowWrapUp] = useState(false)
  const [emailSyncing, setEmailSyncing] = useState(false)
  const [mobileView, setMobileView] = useState<'list' | 'panel' | 'client'>('list')

  useEffect(() => {
    if (!activeInteraction) setMobileView('list')
  }, [activeInteraction])

  function handleOpenMobile(i: InteractionWithDetails) {
    openInteraction(i)
    setMobileView('panel')
  }

  // Queue list
  const [queueList, setQueueList] = useState<InteractionWithDetails[]>([])
  const [queueLoading, setQueueLoading] = useState(false)

  useNotifications(waitingCount, true)

  // Auto-sync emails : au montage + toutes les 5 minutes
  const syncEmails = useCallback(async () => {
    setEmailSyncing(true)
    try { await triggerEmailSync() } catch { /* ignore */ }
    finally { setEmailSyncing(false) }
  }, [])

  useEffect(() => {
    syncEmails()
    const id = setInterval(syncEmails, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [syncEmails])

  const loadQueue = useCallback(async () => {
    setQueueLoading(true)
    let q = supabase
      .from('interactions')
      .select(`*, customers!customer_id(first_name,last_name,phone,email,customer_number)`)
      .eq('status', 'queued')
      .order('queued_at', { ascending: true })
      .limit(50)
    if (channelFilter !== 'all') q = q.eq('channel', channelFilter)
    const { data } = await q
    setQueueList((data ?? []).map((row: Record<string, unknown>) => {
      const c = row.customers as Record<string, string | null> | null
      return {
        ...(row as unknown as InteractionWithDetails),
        customer_first_name: c?.first_name ?? null,
        customer_last_name:  c?.last_name  ?? null,
        customer_phone:      c?.phone       ?? null,
        customer_email:      c?.email       ?? null,
        customer_number:     c?.customer_number ?? null,
        agent_first_name: null, agent_last_name: null,
        disposition_code: null, disposition_name_fr: null, disposition_name_ar: null,
      }
    }))
    setQueueLoading(false)
  }, [channelFilter])

  useEffect(() => { loadQueue() }, [loadQueue, queueCounts.chat, queueCounts.email, queueCounts.callback])

  const filteredMine = channelFilter === 'all'
    ? myInteractions
    : myInteractions.filter(i => i.channel === channelFilter)

  const statusDot: Record<string, string> = {
    available: 'bg-green-500', busy: 'bg-orange-500', pause: 'bg-yellow-500', offline: 'bg-gray-400',
  }
  const sDur = `${Math.floor(statusDuration / 60)}:${String(statusDuration % 60).padStart(2, '0')}`

  async function handleStartWrapUp() {
    if (!activeInteraction) return
    const ok = await startWrapUp(activeInteraction.id)
    if (ok) setShowWrapUp(true)
  }

  async function handleCloseInteraction(data: UnifiedWrapUpData) {
    if (!activeInteraction) return
    await closeInteraction(activeInteraction.id, data)
    setShowWrapUp(false)
  }

  async function handleTransfer(targetAgentId: string, note: string) {
    if (!activeInteraction) return
    await transferInteraction(activeInteraction.id, targetAgentId, note)
    setShowTransfer(false)
  }

  const CHANNELS: { val: ChannelFilter; label: string }[] = [
    { val: 'all',      label: t('workspace.all_channels') },
    { val: 'chat',     label: `${t('interactions.channel_chat')} (${queueCounts.chat})` },
    { val: 'email',    label: `${t('interactions.channel_email')} (${queueCounts.email})` },
    { val: 'callback', label: `${t('interactions.channel_callback')} (${queueCounts.callback})` },
  ]

  return (
    <AdminLayout>
      <div className="flex flex-col h-[calc(100vh-3rem)] md:h-[calc(100vh-5rem)] -m-6 overflow-hidden">

        {/* Top bar */}
        <div className="shrink-0 bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border">

          {/* ── Desktop top bar ── */}
          <div className="hidden md:flex items-center gap-4 flex-wrap px-4 py-2">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${statusDot[myStatus] ?? 'bg-gray-400'}`} />
              <span className="text-sm text-gray-700 dark:text-gray-300">{t(`chat.admin_${myStatus}`)}</span>
              <span className="text-xs text-gray-400">{sDur}</span>
            </div>
            <div className="flex gap-1">
              {myStatus !== 'available' && (
                <button onClick={() => setStatus('available')}
                  className="px-2.5 py-1 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50">
                  {t('chat.admin_available')}
                </button>
              )}
              {myStatus !== 'pause' && myStatus !== 'offline' && (
                <button onClick={() => setShowPause(true)}
                  className="px-2.5 py-1 text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-lg hover:bg-yellow-200">
                  {t('chat.admin_pause')}
                </button>
              )}
              {myStatus !== 'offline' && (
                <button onClick={() => setStatus('offline')}
                  className="px-2.5 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200">
                  {t('chat.admin_offline')}
                </button>
              )}
            </div>
            <div className="flex-1" />
            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
              {queueCounts.chat > 0 && <span className="flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5 text-blue-500" />{queueCounts.chat}</span>}
              {queueCounts.email > 0 && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5 text-purple-500" />{queueCounts.email}</span>}
              {queueCounts.callback > 0 && <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-orange-500" />{queueCounts.callback}</span>}
            </div>
            <button onClick={syncEmails} disabled={emailSyncing} title={t('email.sync')}
              className="p-1.5 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 disabled:opacity-40 transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${emailSyncing ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* ── Mobile top bar ── */}
          <div className="flex md:hidden flex-col px-3 py-2 gap-1.5">
            {/* Row 1 : status + counts + sync + next */}
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot[myStatus] ?? 'bg-gray-400'}`} />
              <span className="text-sm text-gray-700 dark:text-gray-300">{t(`chat.admin_${myStatus}`)}</span>
              <span className="text-xs text-gray-400">{sDur}</span>
              <div className="flex-1" />
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                {queueCounts.chat > 0 && <span className="flex items-center gap-0.5"><MessageSquare className="w-3 h-3 text-blue-500" />{queueCounts.chat}</span>}
                {queueCounts.email > 0 && <span className="flex items-center gap-0.5"><Mail className="w-3 h-3 text-purple-500" />{queueCounts.email}</span>}
                {queueCounts.callback > 0 && <span className="flex items-center gap-0.5"><Phone className="w-3 h-3 text-orange-500" />{queueCounts.callback}</span>}
              </div>
              <button onClick={syncEmails} disabled={emailSyncing} title={t('email.sync')}
                className="p-1.5 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 rounded-lg disabled:opacity-40 transition-colors">
                <RefreshCw className={`w-3.5 h-3.5 ${emailSyncing ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {/* Row 2 : status action buttons */}
            <div className="flex gap-1">
              {myStatus !== 'available' && (
                <button onClick={() => setStatus('available')}
                  className="px-2.5 py-1 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg">
                  {t('chat.admin_available')}
                </button>
              )}
              {myStatus !== 'pause' && myStatus !== 'offline' && (
                <button onClick={() => setShowPause(true)}
                  className="px-2.5 py-1 text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-lg">
                  {t('chat.admin_pause')}
                </button>
              )}
              {myStatus !== 'offline' && (
                <button onClick={() => setStatus('offline')}
                  className="px-2.5 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-lg">
                  {t('chat.admin_offline')}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Body: 3 columns — desktop only */}
        <div className="hidden md:flex flex-1 min-h-0 overflow-hidden">

          {/* Left: interaction list */}
          <div className="w-64 shrink-0 flex flex-col border-r border-gray-100 dark:border-dark-border bg-white dark:bg-dark-surface">

            {/* Channel filter chips */}
            <div className="flex gap-1 p-2 flex-wrap border-b border-gray-100 dark:border-dark-border">
              {CHANNELS.map(c => (
                <button key={c.val} onClick={() => setChannelFilter(c.val)}
                  className={`px-2 py-0.5 text-xs rounded-lg font-medium transition-colors ${channelFilter === c.val ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                  {c.label}
                </button>
              ))}
            </div>

            {/* Tabs: mine / queue */}
            <div className="flex border-b border-gray-100 dark:border-dark-border shrink-0">
              {([
                { key: 'mine',  label: `${t('workspace.my_interactions')} (${filteredMine.length})` },
                { key: 'queue', label: `${t('workspace.queue')} (${queueCounts.total})` },
              ] as const).map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${activeTab === tab.key ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {activeTab === 'mine' && (
                <>
                  {filteredMine.length === 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">{t('interactions.no_active')}</p>
                  )}
                  {filteredMine.map(i => (
                    <InteractionItem key={i.id} interaction={i}
                      isActive={activeInteraction?.id === i.id}
                      onClick={() => openInteraction(i)} />
                  ))}
                </>
              )}
              {activeTab === 'queue' && (
                <>
                  {queueLoading && (
                    <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
                  )}
                  {!queueLoading && queueList.length === 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">{t('interactions.queue_empty')}</p>
                  )}
                  {queueList.map(i => (
                    <InteractionItem key={i.id} interaction={i}
                      isActive={activeInteraction?.id === i.id}
                      onClick={() => openInteraction(i)} />
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Center: channel panel */}
          <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-dark-bg">
            {!activeInteraction ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400 dark:text-gray-500">
                <Inbox className="w-12 h-12 opacity-30" />
                <p className="text-sm">{t('workspace.no_selection')}</p>
              </div>
            ) : (
              <>
                {/* Panel header */}
                <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-dark-border bg-white dark:bg-dark-surface">
                  <ChannelBadge channel={activeInteraction.channel} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                      {activeInteraction.customer_first_name} {activeInteraction.customer_last_name}
                    </p>
                    {activeInteraction.subject && (
                      <p className="text-xs text-gray-400 truncate">{activeInteraction.subject}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {activeInteraction.status === 'active' && (
                      <>
                        <button onClick={() => setShowTransfer(true)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                          <ArrowLeftRight className="w-4 h-4" />
                        </button>
                        <button onClick={handleStartWrapUp}
                          className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-xl">
                          {t('chat.admin_end')}
                        </button>
                      </>
                    )}
                    {activeInteraction.status === 'wrap_up' && (
                      <button onClick={() => setShowWrapUp(true)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-orange-500 hover:bg-orange-600 text-white rounded-xl animate-pulse">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {t('interactions.wrap_up_title')}
                      </button>
                    )}
                    <button onClick={closePanel}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Channel-specific content */}
                {activeInteraction.channel === 'chat' && user?.id && (
                  <ChatPanel interaction={activeInteraction} agentId={user.id}
                    onWrapUp={() => setShowWrapUp(true)} />
                )}
                {activeInteraction.channel === 'email' && (
                  <EmailPanel interaction={activeInteraction} onWrapUp={() => setShowWrapUp(true)} />
                )}
                {activeInteraction.channel === 'callback' && (
                  <CallbackPanel interaction={activeInteraction} onWrapUp={() => setShowWrapUp(true)} />
                )}
              </>
            )}
          </div>

          {/* Right: 360 */}
          <div className="w-64 shrink-0 border-l border-gray-100 dark:border-dark-border bg-white dark:bg-dark-surface">
            {activeInteraction ? (
              <Customer360 interaction={activeInteraction} />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-300 dark:text-gray-600">
                <User className="w-10 h-10" />
              </div>
            )}
          </div>
        </div>

        {/* ── Mobile body ── */}
        <div className="flex flex-col flex-1 min-h-0 md:hidden overflow-hidden">

          {/* Mobile: List view */}
          {(mobileView === 'list' || !activeInteraction) && (
            <div className="flex flex-col flex-1 overflow-hidden bg-white dark:bg-dark-surface">
              {/* Channel filter chips */}
              <div className="flex gap-1.5 p-2 flex-wrap border-b border-gray-100 dark:border-dark-border shrink-0">
                {CHANNELS.map(c => (
                  <button key={c.val} onClick={() => setChannelFilter(c.val)}
                    className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors ${channelFilter === c.val ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                    {c.label}
                  </button>
                ))}
              </div>
              {/* Tabs */}
              <div className="flex border-b border-gray-100 dark:border-dark-border shrink-0">
                {([
                  { key: 'mine',  label: `${t('workspace.my_interactions')} (${filteredMine.length})` },
                  { key: 'queue', label: `${t('workspace.queue')} (${queueCounts.total})` },
                ] as const).map(tab => (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 py-2.5 text-xs font-medium border-b-2 transition-colors ${activeTab === tab.key ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                    {tab.label}
                  </button>
                ))}
              </div>
              {/* List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {activeTab === 'mine' && (
                  <>
                    {filteredMine.length === 0 && <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">{t('interactions.no_active')}</p>}
                    {filteredMine.map(i => (
                      <InteractionItem key={i.id} interaction={i}
                        isActive={activeInteraction?.id === i.id}
                        onClick={() => handleOpenMobile(i)} />
                    ))}
                  </>
                )}
                {activeTab === 'queue' && (
                  <>
                    {queueLoading && <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}
                    {!queueLoading && queueList.length === 0 && <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">{t('interactions.queue_empty')}</p>}
                    {queueList.map(i => (
                      <InteractionItem key={i.id} interaction={i}
                        isActive={activeInteraction?.id === i.id}
                        onClick={() => handleOpenMobile(i)} />
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Mobile: Panel view */}
          {mobileView === 'panel' && activeInteraction && (
            <div className="flex flex-col flex-1 overflow-hidden bg-white dark:bg-dark-bg">
              {/* Panel header */}
              <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 dark:border-dark-border bg-white dark:bg-dark-surface">
                <ChannelBadge channel={activeInteraction.channel} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                    {activeInteraction.customer_first_name} {activeInteraction.customer_last_name}
                  </p>
                  {activeInteraction.subject && <p className="text-xs text-gray-400 truncate">{activeInteraction.subject}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {activeInteraction.status === 'active' && (
                    <>
                      <button onClick={() => setShowTransfer(true)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                        <ArrowLeftRight className="w-4 h-4" />
                      </button>
                      <button onClick={handleStartWrapUp}
                        className="px-2.5 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-xl">
                        {t('chat.admin_end')}
                      </button>
                    </>
                  )}
                  {activeInteraction.status === 'wrap_up' && (
                    <button onClick={() => setShowWrapUp(true)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-orange-500 hover:bg-orange-600 text-white rounded-xl animate-pulse">
                      <AlertCircle className="w-3.5 h-3.5" />{t('interactions.wrap_up_title')}
                    </button>
                  )}
                  <button onClick={() => { closePanel(); setMobileView('list') }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {/* Channel-specific content */}
              {activeInteraction.channel === 'chat' && user?.id && (
                <ChatPanel interaction={activeInteraction} agentId={user.id} onWrapUp={() => setShowWrapUp(true)} />
              )}
              {activeInteraction.channel === 'email' && (
                <EmailPanel interaction={activeInteraction} onWrapUp={() => setShowWrapUp(true)} />
              )}
              {activeInteraction.channel === 'callback' && (
                <CallbackPanel interaction={activeInteraction} onWrapUp={() => setShowWrapUp(true)} />
              )}
            </div>
          )}

          {/* Mobile: Client 360 view */}
          {mobileView === 'client' && activeInteraction && (
            <div className="flex-1 overflow-hidden bg-white dark:bg-dark-surface">
              <Customer360 interaction={activeInteraction} />
            </div>
          )}

          {/* Mobile: bottom tab bar (only when interaction is active) */}
          {activeInteraction && (
            <div className="shrink-0 flex border-t border-gray-100 dark:border-dark-border bg-white dark:bg-dark-surface safe-area-inset-bottom">
              {([
                { view: 'list' as const,   icon: <Inbox className="w-5 h-5" />,        label: t('workspace.tab_list') },
                {
                  view: 'panel' as const,
                  icon: activeInteraction.channel === 'chat'
                    ? <MessageSquare className="w-5 h-5" />
                    : activeInteraction.channel === 'email'
                    ? <Mail className="w-5 h-5" />
                    : <Phone className="w-5 h-5" />,
                  label: t('workspace.tab_interaction'),
                },
                { view: 'client' as const, icon: <User className="w-5 h-5" />,         label: t('workspace.tab_client') },
              ]).map(item => (
                <button key={item.view} onClick={() => setMobileView(item.view)}
                  className={`flex-1 py-2.5 flex flex-col items-center gap-0.5 text-xs transition-colors ${mobileView === item.view ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}

        </div>
      </div>

      {/* Modals */}
      {showPause && (
        <PauseModal
          onConfirm={(reasonId) => { setStatus('pause', reasonId); setShowPause(false) }}
          onCancel={() => setShowPause(false)}
        />
      )}

      {showTransfer && activeInteraction && (
        <InlineTransferModal
          currentAgentId={user?.id ?? null}
          onTransfer={async (targetAgentId, note) => { await handleTransfer(targetAgentId, note) }}
          onClose={() => setShowTransfer(false)}
        />
      )}

      {showWrapUp && activeInteraction && (
        <UnifiedWrapUpModal
          interaction={activeInteraction}
          onClose={() => setShowWrapUp(false)}
          onSubmit={handleCloseInteraction}
        />
      )}

      {/* Clock icon for status duration display */}
      <div style={{ display: 'none' }}><Clock /></div>
    </AdminLayout>
  )
}
