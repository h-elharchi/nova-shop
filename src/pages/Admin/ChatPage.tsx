import { useState, useEffect } from 'react'
import { MessageSquare, User, Phone, Clock, CheckCircle, AlertCircle } from 'lucide-react'
import { AdminLayout } from './AdminLayout'
import { useI18n } from '../../context/LanguageContext'
import { useAuth } from '../../hooks/useAuth'
import { useChatPresence, useAdminConversations } from '../../hooks/useChatPresence'
import { useChatMessages } from '../../hooks/useChatMessages'
import { claimConversation, closeConversation, formatConversationDate } from '../../lib/chat'
import { ChatMessage } from '../../components/chat/ChatMessage'
import { ChatInput } from '../../components/chat/ChatInput'
import type { ChatConversation, ChatAgentStatus } from '../../types/chat'

type AdminChatTab = 'queue' | 'active' | 'history'

export function AdminChatPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const { myStatus, waitingCount, setStatus } = useChatPresence(user?.id ?? null)
  const [activeTab, setActiveTab] = useState<AdminChatTab>('queue')
  const [selectedConv, setSelectedConv] = useState<ChatConversation | null>(null)
  const [claimError, setClaimError] = useState<string | null>(null)
  const [claiming, setClaiming] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)

  const { conversations: queueConvs, loading: queueLoading } = useAdminConversations('waiting')
  const { conversations: activeConvs, loading: activeLoading } = useAdminConversations('active')
  const { conversations: historyConvs, loading: historyLoading } = useAdminConversations('closed_timeout')

  const conversations = activeTab === 'queue' ? queueConvs
    : activeTab === 'active' ? activeConvs
    : historyConvs
  const loading = activeTab === 'queue' ? queueLoading
    : activeTab === 'active' ? activeLoading
    : historyLoading

  const { messages, loading: msgsLoading, sending, send } = useChatMessages(
    selectedConv?.status === 'active' ? selectedConv.id : null
  )

  // Also load messages for history/closed conv
  const { messages: histMsgs, loading: histMsgsLoading } = useChatMessages(
    selectedConv && selectedConv.status !== 'active' ? selectedConv.id : null
  )

  const displayMessages = selectedConv?.status === 'active' ? messages : histMsgs
  const displayMsgsLoading = selectedConv?.status === 'active' ? msgsLoading : histMsgsLoading

  // Update selected conv when conversations list updates
  useEffect(() => {
    if (!selectedConv) return
    const found = [...queueConvs, ...activeConvs, ...historyConvs].find(c => c.id === selectedConv.id)
    if (found) setSelectedConv(found)
  }, [queueConvs, activeConvs, historyConvs, selectedConv?.id])

  const handleClaim = async (conv: ChatConversation) => {
    setClaiming(conv.id)
    setClaimError(null)
    const result = await claimConversation(conv.id)
    setClaiming(null)
    if (!result) {
      setClaimError(t('chat.admin_already_taken'))
      setTimeout(() => setClaimError(null), 3000)
    } else {
      setSelectedConv(result)
      setActiveTab('active')
    }
  }

  const handleClose = async () => {
    if (!selectedConv) return
    setClosing(true)
    await closeConversation(selectedConv.id)
    setClosing(false)
    setSelectedConv(null)
  }

  const handleSend = async (text: string) => {
    if (!selectedConv || !user) return
    await send(text, 'admin', user.id)
  }

  const statusConfig: Record<ChatAgentStatus, { label: string; color: string; dotColor: string }> = {
    available: {
      label: t('chat.admin_available'),
      color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
      dotColor: 'bg-green-500',
    },
    busy: {
      label: t('chat.admin_busy'),
      color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
      dotColor: 'bg-orange-500',
    },
    offline: {
      label: t('chat.admin_offline'),
      color: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600',
      dotColor: 'bg-gray-400',
    },
  }

  const tabClass = (tab: AdminChatTab) =>
    `flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
      activeTab === tab
        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
    }`

  const getStatusLabel = (status: ChatConversation['status']) => {
    switch (status) {
      case 'waiting': return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">⏳ {t('chat.admin_waiting_count')}</span>
      case 'active': return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">🟢 {t('chat.admin_active_count')}</span>
      case 'closed': return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">✓ {t('order.status_completed')}</span>
      case 'timeout': return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">⏰ Timeout</span>
    }
  }

  return (
    <AdminLayout>
      <div className="h-[calc(100vh-7rem)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {t('chat.admin_title')}
            </h1>
            {waitingCount > 0 && (
              <span className="inline-flex items-center justify-center w-6 h-6 text-xs font-bold text-white bg-red-500 rounded-full">
                {waitingCount}
              </span>
            )}
          </div>

          {/* Status selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 dark:text-gray-400 hidden sm:inline">
              {t('chat.admin_my_status')} :
            </span>
            <div className="flex gap-1">
              {(['available', 'busy', 'offline'] as ChatAgentStatus[]).map(s => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    myStatus === s
                      ? statusConfig[s].color
                      : 'text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${myStatus === s ? statusConfig[s].dotColor : 'bg-gray-300'}`} />
                  <span className="hidden sm:inline">{statusConfig[s].label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {claimError && (
          <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {claimError}
          </div>
        )}

        {/* Main layout */}
        <div className="flex-1 flex gap-4 overflow-hidden min-h-0">
          {/* Left panel */}
          <div className="w-80 shrink-0 flex flex-col bg-white dark:bg-dark-surface rounded-2xl border border-gray-100 dark:border-dark-border overflow-hidden">
            {/* Tabs */}
            <div className="flex gap-1 p-2 border-b border-gray-100 dark:border-dark-border">
              <button className={tabClass('queue')} onClick={() => setActiveTab('queue')}>
                <Clock className="w-3.5 h-3.5" />
                {t('chat.admin_queue')}
                {queueConvs.length > 0 && (
                  <span className="ml-auto w-5 h-5 flex items-center justify-center text-xs bg-red-500 text-white rounded-full">
                    {queueConvs.length}
                  </span>
                )}
              </button>
              <button className={tabClass('active')} onClick={() => setActiveTab('active')}>
                <MessageSquare className="w-3.5 h-3.5" />
                {t('chat.admin_active')}
                {activeConvs.length > 0 && (
                  <span className="ml-auto w-5 h-5 flex items-center justify-center text-xs bg-green-500 text-white rounded-full">
                    {activeConvs.length}
                  </span>
                )}
              </button>
              <button className={tabClass('history')} onClick={() => setActiveTab('history')}>
                <CheckCircle className="w-3.5 h-3.5" />
                {t('chat.admin_history')}
              </button>
            </div>

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : conversations.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-gray-400 dark:text-gray-500">
                    {activeTab === 'queue' ? t('chat.admin_no_queue')
                      : activeTab === 'active' ? t('chat.admin_no_active')
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
                        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-500 dark:text-gray-300 shrink-0">
                          <User className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {conv.customer_first_name} {conv.customer_last_name}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                            <Phone className="w-3 h-3" />
                            {conv.customer_phone}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">
                          {formatConversationDate(conv.created_at, t)}
                        </div>
                        {conv.queue_position && (
                          <div className="text-xs font-bold text-orange-500">#{conv.queue_position}</div>
                        )}
                      </div>
                    </div>

                    {activeTab === 'queue' && (
                      <div className="mt-2">
                        <button
                          onClick={e => { e.stopPropagation(); handleClaim(conv) }}
                          disabled={claiming === conv.id || myStatus !== 'available'}
                          className="w-full py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
                        >
                          {claiming === conv.id
                            ? '...'
                            : myStatus !== 'available'
                            ? t('chat.admin_busy')
                            : t('chat.admin_take')}
                        </button>
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right panel — chat detail */}
          <div className="flex-1 flex flex-col bg-white dark:bg-dark-surface rounded-2xl border border-gray-100 dark:border-dark-border overflow-hidden min-w-0">
            {selectedConv ? (
              <>
                {/* Conv header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-dark-border">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
                      <User className="w-5 h-5 text-gray-500 dark:text-gray-300" />
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900 dark:text-white text-sm">
                        {selectedConv.customer_first_name} {selectedConv.customer_last_name}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {selectedConv.customer_phone}
                        </span>
                        {getStatusLabel(selectedConv.status)}
                      </div>
                    </div>
                  </div>
                  {selectedConv.status === 'active' && (
                    <button
                      onClick={handleClose}
                      disabled={closing}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      {closing ? '...' : t('chat.admin_end')}
                    </button>
                  )}
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
                  {displayMsgsLoading ? (
                    <div className="flex justify-center pt-8">
                      <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : displayMessages.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-sm text-gray-400 dark:text-gray-500">{t('chat.admin_no_active')}</p>
                    </div>
                  ) : (
                    displayMessages.map(msg => (
                      <ChatMessage key={msg.id} message={msg} />
                    ))
                  )}
                </div>

                {/* Input (only for active) */}
                {selectedConv.status === 'active' && (
                  <ChatInput
                    onSend={handleSend}
                    disabled={false}
                    sending={sending}
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
        </div>
      </div>
    </AdminLayout>
  )
}
