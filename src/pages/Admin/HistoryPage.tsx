import { useEffect, useState } from 'react'
import { Search, RotateCcw, Download, ChevronLeft, ChevronRight, X, MessageSquare } from 'lucide-react'
import { AdminLayout } from './AdminLayout'
import { useConversationHistory } from '../../hooks/useConversationHistory'
import { useI18n } from '../../context/LanguageContext'
import { loadDispositionCodes } from '../../lib/chat'
import { useChatMessages } from '../../hooks/useChatMessages'
import { exportConversationsToExcel } from '../../lib/exportExcel'
import type { CrcDispositionCode, ConversationHistoryItem } from '../../types/chat'

const STATUS_BADGE: Record<string, string> = {
  waiting: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
  active:  'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  closed:  'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  timeout: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
}

function fmtSeconds(s: number | null | undefined): string {
  if (s == null) return '—'
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function MessagesModal({ conv, onClose, t }: {
  conv: ConversationHistoryItem
  onClose: () => void
  t: (k: string) => string
}) {
  const { messages, loading } = useChatMessages(conv.id)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-lg bg-white dark:bg-dark-surface rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-dark-border">
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">
              {conv.customer_first_name} {conv.customer_last_name}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{conv.customer_phone}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <p className="text-center text-sm text-gray-400 py-8">{t('common.loading')}</p>
          ) : messages.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">—</p>
          ) : messages.map(m => {
            if (m.sender_type === 'system') {
              return (
                <div key={m.id} className="flex justify-center">
                  <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 rounded-full px-3 py-1">
                    {m.message}
                  </span>
                </div>
              )
            }
            const isAdmin = m.sender_type === 'admin'
            return (
              <div key={m.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                  isAdmin
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-sm'
                }`}>
                  <p className="whitespace-pre-wrap">{m.message}</p>
                  <p className={`text-[10px] mt-1 ${isAdmin ? 'text-blue-200' : 'text-gray-400 dark:text-gray-500'}`}>
                    {fmtDate(m.created_at)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 dark:border-dark-border">
          <button onClick={onClose} className="w-full py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
            {t('history.modal_close')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function HistoryPage() {
  const { t } = useI18n()
  const history = useConversationHistory()
  const [dispositions, setDispositions] = useState<CrcDispositionCode[]>([])
  const [selectedConv, setSelectedConv] = useState<ConversationHistoryItem | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    loadDispositionCodes().then(setDispositions).catch(() => {})
  }, [])

  useEffect(() => {
    history.fetchHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSearch() {
    history.fetchHistory()
  }

  function handleReset() {
    history.resetFilters()
    history.fetchHistory({ ...history.filters, ...{
      status: '', agentId: '', dispositionId: '', dateFrom: '', dateTo: '', phone: '', page: 1
    }})
  }

  async function handleExport() {
    if (exporting) return
    setExporting(true)
    try {
      exportConversationsToExcel(history.rows, {
        date:             t('history.col_date'),
        client:           t('history.col_client'),
        phone:            t('history.col_phone'),
        status:           t('history.col_status'),
        agent:            t('history.col_agent'),
        disposition:      t('history.col_disposition'),
        wait_seconds:     t('history.col_wait'),
        duration_seconds: t('history.col_duration'),
        notes:            t('chat.admin_wrapup_notes'),
      }, `historique-${new Date().toISOString().slice(0, 10)}.xlsx`)
    } finally {
      setExporting(false)
    }
  }

  function handlePageChange(newPage: number) {
    history.setFilters({ page: newPage })
    history.fetchHistory({ page: newPage })
  }

  const totalPages = Math.ceil(history.total / history.pageSize)

  const statusOptions = ['', 'waiting', 'active', 'closed', 'timeout']

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('history.title')}</h1>
          <button
            onClick={handleExport}
            disabled={exporting || history.rows.length === 0}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white transition-colors"
          >
            <Download className="w-4 h-4" />
            {t('history.export')}
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-dark-border p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Status */}
            <select
              value={history.filters.status}
              onChange={e => history.setFilters({ status: e.target.value })}
              className="px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
            >
              {statusOptions.map(s => (
                <option key={s} value={s}>
                  {s === '' ? t('history.filter_all') : t(`history.status_${s}`)}
                </option>
              ))}
            </select>

            {/* Disposition */}
            <select
              value={history.filters.dispositionId}
              onChange={e => history.setFilters({ dispositionId: e.target.value })}
              className="px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
            >
              <option value="">{t('history.filter_all')}</option>
              {dispositions.filter(d => d.is_active).map(d => (
                <option key={d.id} value={d.id}>{d.code} — {d.name_fr}</option>
              ))}
            </select>

            {/* Phone */}
            <input
              type="text"
              value={history.filters.phone}
              onChange={e => history.setFilters({ phone: e.target.value })}
              placeholder={t('history.filter_phone')}
              className="px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />

            {/* Date range */}
            <div className="flex gap-2">
              <input
                type="date"
                value={history.filters.dateFrom}
                onChange={e => history.setFilters({ dateFrom: e.target.value })}
                className="flex-1 min-w-0 px-2 py-2 text-xs rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
              />
              <input
                type="date"
                value={history.filters.dateTo}
                onChange={e => history.setFilters({ dateTo: e.target.value })}
                className="flex-1 min-w-0 px-2 py-2 text-xs rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div className="flex gap-2 mt-3">
            <button
              onClick={handleSearch}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              <Search className="w-4 h-4" />
              {t('history.search')}
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              {t('history.reset')}
            </button>
            {history.total > 0 && (
              <span className="ml-auto self-center text-sm text-gray-500 dark:text-gray-400">
                {t('history.total').replace('{n}', String(history.total))}
              </span>
            )}
          </div>
        </div>

        {history.error && (
          <p className="text-red-600 dark:text-red-400 text-sm">{history.error}</p>
        )}

        {/* Table */}
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-dark-border overflow-hidden">
          {history.loading ? (
            <div className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">{t('common.loading')}</div>
          ) : history.rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400 dark:text-gray-500">{t('history.no_results')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-dark-border text-left">
                    {[
                      t('history.col_date'),
                      t('history.col_client'),
                      t('history.col_phone'),
                      t('history.col_status'),
                      t('history.col_agent'),
                      t('history.col_disposition'),
                      t('history.col_wait'),
                      t('history.col_duration'),
                      '',
                    ].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-dark-border">
                  {history.rows.map(row => {
                    const waitSecs = row.assigned_at && row.created_at
                      ? Math.round((new Date(row.assigned_at).getTime() - new Date(row.created_at).getTime()) / 1000)
                      : null
                    return (
                      <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap text-xs">{fmtDate(row.created_at)}</td>
                        <td className="px-4 py-3 text-gray-900 dark:text-white whitespace-nowrap font-medium">
                          {row.customer_first_name} {row.customer_last_name}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{row.customer_phone}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[row.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {t(`history.status_${row.status}`)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {row.agent_first_name ? `${row.agent_first_name} ${row.agent_last_name ?? ''}`.trim() : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                          {row.disposition_code ? `${row.disposition_code} — ${row.disposition_name_fr ?? ''}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap text-xs">{fmtSeconds(waitSecs)}</td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap text-xs">{fmtSeconds(row.wrap_up_seconds)}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setSelectedConv(row)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                            title={t('history.view_messages')}
                          >
                            <MessageSquare className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <button
              onClick={() => handlePageChange(history.page - 1)}
              disabled={history.page <= 1}
              className="flex items-center gap-1 px-3 py-2 text-sm rounded-xl bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              {t('history.prev')}
            </button>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t('history.page')} {history.page} / {totalPages}
            </span>
            <button
              onClick={() => handlePageChange(history.page + 1)}
              disabled={history.page >= totalPages}
              className="flex items-center gap-1 px-3 py-2 text-sm rounded-xl bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
            >
              {t('history.next')}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {selectedConv && (
        <MessagesModal
          conv={selectedConv}
          onClose={() => setSelectedConv(null)}
          t={t}
        />
      )}
    </AdminLayout>
  )
}
