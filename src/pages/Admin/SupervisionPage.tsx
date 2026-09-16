import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { AdminLayout } from './AdminLayout'
import { useSupervision } from '../../hooks/useSupervision'
import { useI18n } from '../../context/LanguageContext'
import type { SupervisionPeriod } from '../../lib/supervision'
import type { AgentDashboardEntry, ChatAgentStatus } from '../../types/chat'

function fmtSeconds(s: number | null): string {
  if (s == null) return '—'
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const sec = s % 60
  return sec > 0 ? `${m}m ${sec}s` : `${m}m`
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

const STATUS_DOT: Record<ChatAgentStatus, string> = {
  available: 'bg-green-500',
  busy:      'bg-orange-500',
  pause:     'bg-yellow-500',
  offline:   'bg-gray-400',
}

function AgentCard({ agent, t }: { agent: AgentDashboardEntry; t: (k: string) => string }) {
  const name = [agent.first_name, agent.last_name].filter(Boolean).join(' ') || agent.email || '—'
  const statusLabel = t(`supervision.agent_status_${agent.status}`)

  return (
    <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-dark-border p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center overflow-hidden shrink-0">
          {agent.avatar_url
            ? <img src={agent.avatar_url} alt="" className="w-full h-full object-cover" />
            : <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                {name.slice(0, 2).toUpperCase()}
              </span>
          }
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`w-2 h-2 rounded-full ${STATUS_DOT[agent.status]}`} />
            <span className="text-xs text-gray-500 dark:text-gray-400">{statusLabel}</span>
            {agent.pause_reason_fr && (
              <span className="text-xs text-yellow-600 dark:text-yellow-400">— {agent.pause_reason_fr}</span>
            )}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400">
        <div>
          <span className="font-medium text-gray-900 dark:text-white">{agent.active_conversations_count}</span>
          {' / '}{agent.capacity} {t('supervision.agent_conversations')}
        </div>
        <div className="text-right">
          {fmtDuration(agent.seconds_in_status)} {t('supervision.agent_time_in_status')}
        </div>
      </div>
    </div>
  )
}

export function SupervisionPage() {
  const { t } = useI18n()
  const [period, setPeriod] = useState<SupervisionPeriod>('today')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [agentId, setAgentId] = useState('')
  const [appliedParams, setAppliedParams] = useState<{
    period: SupervisionPeriod; dateFrom: string; dateTo: string; agentId: string
  }>({ period: 'today', dateFrom: '', dateTo: '', agentId: '' })

  const { agents, kpis, loading, error, refresh } = useSupervision({
    period:   appliedParams.period,
    dateFrom: appliedParams.dateFrom || null,
    dateTo:   appliedParams.dateTo   || null,
    agentId:  appliedParams.agentId  || null,
  })

  function apply() {
    setAppliedParams({ period, dateFrom, dateTo, agentId })
  }

  const periods: { value: SupervisionPeriod; label: string }[] = [
    { value: 'today',  label: t('supervision.period_today')  },
    { value: '7days',  label: t('supervision.period_7days')  },
    { value: '30days', label: t('supervision.period_30days') },
    { value: 'custom', label: t('supervision.period_custom') },
  ]

  const KpiCard = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-dark-border p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )

  const maxDisp = kpis?.dispositions?.reduce((m, d) => Math.max(m, d.cnt), 1) ?? 1

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('supervision.title')}</h1>
          <button
            onClick={refresh}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-xl bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            {t('supervision.refresh')}
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-dark-border p-4">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Period tabs */}
            <div className="flex gap-1">
              {periods.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    period === p.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {period === 'custom' && (
              <>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
                />
                <span className="text-gray-400 self-center">→</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
                />
              </>
            )}

            {/* Agent filter */}
            <select
              value={agentId}
              onChange={e => setAgentId(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
            >
              <option value="">{t('supervision.filter_all_agents')}</option>
              {agents.map(a => (
                <option key={a.user_id} value={a.user_id}>
                  {[a.first_name, a.last_name].filter(Boolean).join(' ') || a.email || a.user_id}
                </option>
              ))}
            </select>

            <button
              onClick={apply}
              className="px-4 py-1.5 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              {t('supervision.apply')}
            </button>
          </div>
        </div>

        {error && (
          <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
        )}

        {loading && (
          <p className="text-gray-500 dark:text-gray-400 text-sm">{t('supervision.loading')}</p>
        )}

        {/* KPIs */}
        {kpis && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <KpiCard label={t('supervision.kpi_received')} value={String(kpis.total_received)} />
            <KpiCard label={t('supervision.kpi_taken')}    value={String(kpis.total_taken)}    />
            <KpiCard label={t('supervision.kpi_closed')}   value={String(kpis.total_closed)}   />
            <KpiCard label={t('supervision.kpi_timeout')}  value={String(kpis.total_timeout)}  />
            <KpiCard label={t('supervision.kpi_waiting')}  value={String(kpis.total_waiting)}  />
          </div>
        )}

        {kpis && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KpiCard
              label={t('supervision.kpi_take_rate')}
              value={kpis.take_rate_pct != null ? `${kpis.take_rate_pct}%` : t('supervision.kpi_na')}
            />
            <KpiCard
              label={t('supervision.kpi_avg_wait')}
              value={kpis.avg_wait_seconds != null ? fmtSeconds(kpis.avg_wait_seconds) : t('supervision.kpi_na')}
            />
            <KpiCard
              label={t('supervision.kpi_avg_handle')}
              value={kpis.avg_handle_seconds != null ? fmtSeconds(kpis.avg_handle_seconds) : t('supervision.kpi_na')}
            />
            <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-dark-border p-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('supervision.kpi_service_level')}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {kpis.service_level_pct != null ? `${kpis.service_level_pct}%` : t('supervision.kpi_na')}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                ≤ {kpis.service_level_threshold}{t('supervision.kpi_secs')}
              </p>
              {kpis.service_level_pct != null && (
                <div className="mt-2 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${kpis.service_level_pct >= 80 ? 'bg-green-500' : kpis.service_level_pct >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ width: `${kpis.service_level_pct}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Agents + Dispositions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Agents grid */}
          <div className="lg:col-span-2 space-y-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">{t('supervision.agents_title')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {agents.map(a => (
                <AgentCard key={a.id} agent={a} t={t} />
              ))}
            </div>
          </div>

          {/* Dispositions */}
          {kpis && (
            <div className="space-y-3">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{t('supervision.dispositions_title')}</h2>
              <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-dark-border p-4 space-y-3">
                {kpis.dispositions.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500">{t('supervision.no_dispositions')}</p>
                ) : kpis.dispositions.map(d => (
                  <div key={d.code}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-700 dark:text-gray-300">{d.name_fr} <span className="text-gray-400 text-xs">({d.code})</span></span>
                      <span className="font-semibold text-gray-900 dark:text-white">{d.cnt}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${Math.round((d.cnt / maxDisp) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
