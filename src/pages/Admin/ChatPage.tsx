import { useState, useEffect, useRef } from 'react'
import { MessageSquare, User, Phone, Clock, CheckCircle, AlertCircle, ArrowLeftRight } from 'lucide-react'
import { AdminLayout } from './AdminLayout'
import { useI18n } from '../../context/LanguageContext'
import { useAuth } from '../../hooks/useAuth'
import { useAgentCtx } from '../../context/AgentContext'
import { useAdminConversations } from '../../hooks/useChatPresence'
import { useChatMessages } from '../../hooks/useChatMessages'
import { useQuickReplies } from '../../hooks/useQuickReplies'
import { useNotifications } from '../../hooks/useNotifications'
import { claimConversation, closeConversationWithWrapup, formatConversationDate } from '../../lib/chat'
import { ChatMessage } from '../../components/chat/ChatMessage'
import { AdminChatInput } from '../../components/chat/admin/AdminChatInput'
import { PauseModal } from '../../components/chat/admin/PauseModal'
import { WrapUpModal } from '../../components/chat/admin/WrapUpModal'
import { TransferModal } from '../../components/chat/admin/TransferModal'
import { ClientCard360 } from '../../components/chat/admin/ClientCard360'
import type { ChatConversation, ChatAgentStatus } from '../../types/chat'

type AdminChatTab = 'queue' | 'mine' | 'history'

export function AdminChatPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const { myStatus, myActiveCount, agents, waitingCount, statusDuration, setStatus } = useAgentCtx()
  const [activeTab, setActiveTab] = useState<AdminChatTab>('queue')
  const [selectedConv, setSelectedConv] = useState<ChatConversation | null>(null)
  const [claimError, setClaimError] = useState<string | null>(null)
  const [claiming, setClaiming] = useState<string | null>(null)

  // Modals
  const [showPause, setShowPause] = useState(false)
  const [showWrapUp, setShowWrapUp] = useState(false)
  const [wrapUpConv, setWrapUpConv] = useState<ChatConversation | null>(null)
  const [wrapUpStartTime, setWrapUpStartTime] = useState(0)
  const [showTransfer, setShowTransfer] = useState(false)

  const { quickReplies } = useQuickReplies()
  useNotifications(waitingCount, true)

  const { conversations: queueConvs, loading: queueLoading } = useAdminConversations('waiting')
  const { conversations: mineConvs, loading: mineLoading } = useAdminConversations('mine-active', user?.id)
  const { conversations: historyConvs, loading: historyLoading } = useAdminConversations('closed_timeout')

  const conversations = activeTab === 'queue' ? queueConvs
    : activeTab === 'mine' ? mineConvs
    : historyConvs
  const loading = activeTab === 'queue' ? queueLoading
    : activeTab === 'mine' ? mineLoading
    : historyLoading

  const { messages, loading: msgsLoading, sending, send } = useChatMessages(selectedConv?.id ?? null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Sync selectedConv with realtime updates
  useEffect(() => {
    if (!selectedConv) return
    const all = [...queueConvs, ...mineConvs, ...historyConvs]
    const found = all.find(c => c.id === selectedConv.id)
    if (found) setSelectedConv(found)
  }, [queueConvs, mineConvs, historyConvs, selectedConv?.id])

  const handleClaim = async (conv: ChatConversation) => {
    setClaiming(conv.id)
    setClaimError(null)
    const result = await claimConversation(conv.id)
    setClaiming(null)
    if (!result) {
      setClaimError(t('chat.admin_already_taken'))
      setTimeout(() => setClaimError(null), 4000)
    } else {
      setSelectedConv(result)
      setActiveTab('mine')
    }
  }

  const handleEndConversation = () => {
    if (!selectedConv) return
    const startTime = selectedConv.assigned_at ? new Date(selectedConv.assigned_at).getTime() : Date.now()
    setWrapUpStartTime(Math.floor((Date.now() - startTime) / 1000))
    setWrapUpConv(selectedConv)
    setShowWrapUp(true)
  }

  const handleWrapUpSubmit = async (dispositionId: string | null, notes: string) => {
    if (!wrapUpConv) return
    await closeConversationWithWrapup({
      conversationId: wrapUpConv.id,
      dispositionId,
      notes,
      wrapUpSeconds: wrapUpStartTime,
    })
    setShowWrapUp(false)
    setWrapUpConv(null)
    if (selectedConv?.id === wrapUpConv.id) setSelectedConv(null)
  }

  const handleWrapUpSkip = async () => {
    if (!wrapUpConv) return
    await closeConversationWithWrapup({
      conversationId: wrapUpConv.id,
      dispositionId: null,
      notes: '',
      wrapUpSeconds: wrapUpStartTime,
    })
    setShowWrapUp(false)
    setWrapUpConv(null)
    if (selectedConv?.id === wrapUpConv.id) setSelectedConv(null)
  }

  const handleStatusClick = (s: ChatAgentStatus) => {
    if (s === 'pause') {
      setShowPause(true)
    } else {
      setStatus(s)
    }
  }

  const handlePauseConfirm = (reasonId: string) => {
    setShowPause(false)
    setStatus('pause', reasonId)
  }

  const handleSend = async (text: string) => {
    if (!selectedConv || !user) return
    await send(text, 'admin', user.id)
  }

  const handleTransferSuccess = () => {
    setShowTransfer(false)
    setSelectedConv(null)
  }

  const statusConfig: Record<ChatAgentStatus, { label: string; ring: string; dot: string }> = {
    available: { label: t('chat.admin_available'), ring: 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300', dot: 'bg-green-500' },
    busy:      { label: t('chat.admin_busy'),      ring: 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300', dot: 'bg-orange-500' },
    pause:     { label: t('chat.admin_pause'),     ring: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300', dot: 'bg-yellow-500' },
    offline:   { label: t('chat.admin_offline'),   ring: 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300', dot: 'bg-gray-400' },
  }

  const tabClass = (tab: AdminChatTab) =>
    `flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors shrink-0 ${
      activeTab === tab
        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
    }`

  const convStatusBadge = (status: ChatConversation['status']) => {
    switch (status) {
      case 'waiting': return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">⏳</span>
      case 'active':  return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">🟢</span>
      case 'closed':  return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">✓</span>
      case 'timeout': return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">⏰</span>
    }
  }

  const formatDuration = (secs: number) => {
    if (secs < 60) return `${secs}s`
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}m${s > 0 ? String(s).padStart(2, '0') : ''}`
  }

  const showRightPanel = selectedConv && selectedConv.status === 'active'

  return (
    <AdminLayout>
      <div className="h-[calc(100vh-7rem)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('chat.admin_title')}</h1>
            {waitingCount > 0 && (
              <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-red-500 rounded-full animate-pulse">
                {waitingCount}
              </span>
            )}
            {myStatus !== 'offline' && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {myActiveCount}/{agents.find(a => a.user_id === user?.id)?.capacity ?? 3} · {formatDuration(statusDuration)}
              </span>
            )}
          </div>

          {/* Status selector */}
          <div className="flex items-center gap-1">
            {(['available', 'busy', 'pause', 'offline'] as ChatAgentStatus[]).map(s => (
              <button
                key={s}
                onClick={() => handleStatusClick(s)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  myStatus === s ? statusConfig[s].ring : 'text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${myStatus === s ? statusConfig[s].dot : 'bg-gray-300 dark:bg-gray-600'}`} />
                <span className="hidden sm:inline">{statusConfig[s].label}</span>
              </button>
            ))}
          </div>
        </div>

        {claimError && (
          <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {claimError}
          </div>
        )}

        {/* 3-zone layout */}
        <div className="flex-1 flex gap-3 overflow-hidden min-h-0">

          {/* LEFT — conversation list */}
          <div className="w-72 shrink-0 flex flex-col bg-white dark:bg-dark-surface rounded-2xl border border-gray-100 dark:border-dark-border overflow-hidden">
            <div className="flex gap-1 p-2 border-b border-gray-100 dark:border-dark-border overflow-x-auto">
              <button className={tabClass('queue')} onClick={() => setActiveTab('queue')}>
                <Clock className="w-3.5 h-3.5" />
                {t('chat.admin_queue')}
                {queueConvs.length > 0 && (
                  <span className="ml-1 w-4 h-4 flex items-center justify-center text-xs bg-red-500 text-white rounded-full">
                    {queueConvs.length}
                  </span>
                )}
              </button>
              <button className={tabClass('mine')} onClick={() => setActiveTab('mine')}>
                <MessageSquare className="w-3.5 h-3.5" />
                {t('chat.admin_mine_active')}
                {mineConvs.length > 0 && (
                  <span className="ml-1 w-4 h-4 flex items-center justify-center text-xs bg-green-500 text-white rounded-full">
                    {mineConvs.length}
                  </span>
                )}
              </button>
              <button className={tabClass('history')} onClick={() => setActiveTab('history')}>
                <CheckCircle className="w-3.5 h-3.5" />
                {t('chat.admin_history')}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {activeTab === 'queue' ? t('chat.admin_no_queue')
                      : activeTab === 'mine' ? t('chat.admin_no_active')
                      : t('chat.admin_no_history')}
                  </p>
                </div>
              ) : (
                conversations.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConv(conv)}
                    className={`w-full text-left px-3 py-3 border-b border-gray-50 dark:border-dark-border transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 ${
                      selectedConv?.id === conv.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center shrink-0">
                          <User className="w-3.5 h-3.5 text-gray-500 dark:text-gray-300" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-gray-900 dark:text-white truncate">
                            {conv.customer_first_name} {conv.customer_last_name}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                            <Phone className="w-3 h-3" />
                            {conv.customer_phone}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1">
                        {convStatusBadge(conv.status)}
                        <div className="text-xs text-gray-400 dark:text-gray-500">
                          {formatConversationDate(conv.created_at, t)}
                        </div>
                      </div>
                    </div>

                    {activeTab === 'queue' && (
                      <div className="mt-2">
                        <button
                          onClick={e => { e.stopPropagation(); handleClaim(conv) }}
                          disabled={claiming === conv.id || myStatus !== 'available'}
                          className="w-full py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
                        >
                          {claiming === conv.id ? '…'
                            : myStatus !== 'available' ? t('chat.admin_busy')
                            : t('chat.admin_take')}
                        </button>
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* CENTER — conversation messages */}
          <div className={`flex flex-col bg-white dark:bg-dark-surface rounded-2xl border border-gray-100 dark:border-dark-border overflow-hidden min-w-0 transition-all ${showRightPanel ? 'flex-1' : 'flex-1'}`}>
            {selectedConv ? (
              <>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-dark-border shrink-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-gray-500 dark:text-gray-300" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                        {selectedConv.customer_first_name} {selectedConv.customer_last_name}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                          <Phone className="w-3 h-3" />{selectedConv.customer_phone}
                        </span>
                        {convStatusBadge(selectedConv.status)}
                      </div>
                    </div>
                  </div>
                  {selectedConv.status === 'active' && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setShowTransfer(true)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{t('chat.admin_transfer')}</span>
                      </button>
                      <button
                        onClick={handleEndConversation}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{t('chat.admin_end')}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
                  {msgsLoading ? (
                    <div className="flex justify-center pt-8">
                      <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-sm text-gray-400 dark:text-gray-500">{t('chat.admin_no_active')}</p>
                    </div>
                  ) : (
                    messages.map(msg => <ChatMessage key={msg.id} message={msg} />)
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {selectedConv.status === 'active' && (
                  <AdminChatInput
                    onSend={handleSend}
                    sending={sending}
                    quickReplies={quickReplies}
                  />
                )}
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <MessageSquare className="w-12 h-12 text-gray-200 dark:text-gray-600 mb-4" />
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  Sélectionnez une conversation
                </p>
              </div>
            )}
          </div>

          {/* RIGHT — 360° client card (active conversations only) */}
          {showRightPanel && (
            <div className="w-64 shrink-0 flex flex-col bg-white dark:bg-dark-surface rounded-2xl border border-gray-100 dark:border-dark-border overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-dark-border shrink-0">
                <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                  {t('chat.admin_card_title')}
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto">
                <ClientCard360
                  phone={selectedConv!.customer_phone}
                  firstName={selectedConv!.customer_first_name}
                  lastName={selectedConv!.customer_last_name}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showPause && (
        <PauseModal onConfirm={handlePauseConfirm} onCancel={() => setShowPause(false)} />
      )}
      {showWrapUp && wrapUpConv && (
        <WrapUpModal
          wrapUpSeconds={wrapUpStartTime}
          onSubmit={handleWrapUpSubmit}
          onSkip={handleWrapUpSkip}
        />
      )}
      {showTransfer && selectedConv && user && (
        <TransferModal
          conversationId={selectedConv.id}
          agents={agents}
          currentAdminId={user.id}
          onSuccess={handleTransferSuccess}
          onCancel={() => setShowTransfer(false)}
        />
      )}
    </AdminLayout>
  )
}
