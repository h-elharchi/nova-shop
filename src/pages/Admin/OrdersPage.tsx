import { useState, useEffect, useMemo, useCallback } from 'react'
import { Phone, MessageCircle, Search, Download, RotateCcw } from 'lucide-react'
import { useI18n } from '../../context/LanguageContext'
import { useOrders } from '../../hooks/useOrders'
import { exportOrdersToExcel } from '../../lib/exportExcel'
import { OrderStatusBadge } from '../../components/orders/OrderStatusBadge'
import { AdminLayout } from './AdminLayout'
import type { OrderStatus } from '../../types'

type DatePeriod = 'all' | 'today' | 'yesterday' | '7days' | '30days' | 'this_month' | 'last_month' | 'custom'

const STATUSES: { value: OrderStatus | ''; labelKey: string }[] = [
  { value: '',           labelKey: 'order.filter_all' },
  { value: 'new',        labelKey: 'order.status_new' },
  { value: 'contacted',  labelKey: 'order.status_contacted' },
  { value: 'confirmed',  labelKey: 'order.status_confirmed' },
  { value: 'cancelled',  labelKey: 'order.status_cancelled' },
  { value: 'completed',  labelKey: 'order.status_completed' },
]

const DATE_PERIODS: { value: DatePeriod; labelKey: string }[] = [
  { value: 'all',        labelKey: 'order.period_all' },
  { value: 'today',      labelKey: 'order.period_today' },
  { value: 'yesterday',  labelKey: 'order.period_yesterday' },
  { value: '7days',      labelKey: 'order.period_7days' },
  { value: '30days',     labelKey: 'order.period_30days' },
  { value: 'this_month', labelKey: 'order.period_this_month' },
  { value: 'last_month', labelKey: 'order.period_last_month' },
  { value: 'custom',     labelKey: 'order.period_custom' },
]

const PAGE_SIZE = 20

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function computeDateRange(
  period: DatePeriod,
  customFrom: string,
  customTo: string
): { dateFrom: string; dateTo: string } {
  const now = new Date()
  const today = localDateStr(now)
  switch (period) {
    case 'today': return { dateFrom: today, dateTo: today }
    case 'yesterday': {
      const y = new Date(now); y.setDate(y.getDate() - 1); const d = localDateStr(y)
      return { dateFrom: d, dateTo: d }
    }
    case '7days': {
      const s = new Date(now); s.setDate(s.getDate() - 6)
      return { dateFrom: localDateStr(s), dateTo: today }
    }
    case '30days': {
      const s = new Date(now); s.setDate(s.getDate() - 29)
      return { dateFrom: localDateStr(s), dateTo: today }
    }
    case 'this_month': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1)
      return { dateFrom: localDateStr(s), dateTo: today }
    }
    case 'last_month': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const e = new Date(now.getFullYear(), now.getMonth(), 0)
      return { dateFrom: localDateStr(s), dateTo: localDateStr(e) }
    }
    case 'custom': return { dateFrom: customFrom, dateTo: customTo }
    default: return { dateFrom: '', dateTo: '' }
  }
}

function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\s+/g, '')
  if (cleaned.startsWith('0')) return '+212' + cleaned.slice(1)
  if (cleaned.startsWith('00212')) return '+' + cleaned.slice(2)
  return cleaned
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '< 1 min'
  if (mins < 60) return `${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}j`
}

export function AdminOrdersPage() {
  const { t, lang } = useI18n()

  // Server-side filter state
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [datePeriod, setDatePeriod] = useState<DatePeriod>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  // Client-side filter
  const [productFilter, setProductFilter] = useState('')

  // Pagination
  const [page, setPage] = useState(1)

  // Export state
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState<string | null>(null)

  // Debounce search input → server query
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 400)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Derive date range from period (memoized, no extra state)
  const { dateFrom, dateTo } = useMemo(
    () => computeDateRange(datePeriod, customFrom, customTo),
    [datePeriod, customFrom, customTo]
  )

  const { orders, loading, error, updateStatus } = useOrders({
    status: statusFilter,
    search,
    dateFrom,
    dateTo,
  })

  // Build product dropdown from server-side result (before client filter)
  const productOptions = useMemo(
    () => [...new Set(orders.map(o => o.product_name))].sort(),
    [orders]
  )

  // Apply client-side product filter
  const filteredOrders = useMemo(
    () => (!productFilter ? orders : orders.filter(o => o.product_name === productFilter)),
    [orders, productFilter]
  )

  // Reset to page 1 when any effective filter changes
  useEffect(() => { setPage(1) }, [statusFilter, search, productFilter, dateFrom, dateTo])

  // Paginated slice (display only)
  const paginatedOrders = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filteredOrders.slice(start, start + PAGE_SIZE)
  }, [filteredOrders, page])

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE))

  const hasActiveFilters = !!(statusFilter || searchInput || productFilter || datePeriod !== 'all')

  const resetFilters = useCallback(() => {
    setStatusFilter('')
    setSearchInput('')
    setSearch('')
    setProductFilter('')
    setDatePeriod('all')
    setCustomFrom('')
    setCustomTo('')
    setPage(1)
  }, [])

  const handleExport = useCallback(async () => {
    if (exporting || filteredOrders.length === 0) return
    setExporting(true)
    setExportMsg(null)
    try {
      const today = localDateStr(new Date())
      const statusSuffix = statusFilter ? `-${statusFilter}` : ''
      const filename = `nova-shop-commandes${statusSuffix}-${today}.xlsx`
      exportOrdersToExcel(
        filteredOrders,
        {
          id:        t('order.excel_id'),
          date:      t('order.excel_date'),
          product:   t('order.excel_product'),
          price:     t('order.excel_price'),
          firstname: t('order.excel_firstname'),
          lastname:  t('order.excel_lastname'),
          phone:     t('order.excel_phone'),
          status:    t('order.excel_status'),
        },
        lang,
        filename
      )
      setExportMsg(t('order.export_done'))
    } catch {
      setExportMsg(t('order.export_error'))
    } finally {
      setExporting(false)
      setTimeout(() => setExportMsg(null), 4000)
    }
  }, [exporting, filteredOrders, statusFilter, lang, t])

  return (
    <AdminLayout>
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('order.orders')}</h1>
          {!loading && (
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
              {filteredOrders.length} {t('order.orders_count')}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <button
            onClick={handleExport}
            disabled={exporting || filteredOrders.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            {exporting ? t('order.exporting') : t('order.export_excel')}
          </button>
          {exportMsg && (
            <span
              className={`text-xs font-medium ${
                exportMsg.includes('✓') || exportMsg.includes('تم') ? 'text-emerald-600' : 'text-red-500'
              }`}
            >
              {exportMsg}
            </span>
          )}
        </div>
      </div>

      {/* Filter card */}
      <div className="bg-white dark:bg-dark-card rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border p-4 mb-4 space-y-4 transition-colors duration-200">
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
          <input
            type="text"
            placeholder={t('order.search_placeholder')}
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              ×
            </button>
          )}
        </div>

        {/* Three filter dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              {t('order.filter_status')}
            </label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as OrderStatus | '')}
              className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            >
              {STATUSES.map(s => (
                <option key={s.value} value={s.value}>{t(s.labelKey)}</option>
              ))}
            </select>
          </div>

          {/* Product */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              {t('order.filter_product')}
            </label>
            <select
              value={productFilter}
              onChange={e => setProductFilter(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            >
              <option value="">{t('order.filter_all_products')}</option>
              {productOptions.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {/* Date period */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              {t('order.filter_period')}
            </label>
            <select
              value={datePeriod}
              onChange={e => { setDatePeriod(e.target.value as DatePeriod); setCustomFrom(''); setCustomTo('') }}
              className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            >
              {DATE_PERIODS.map(p => (
                <option key={p.value} value={p.value}>{t(p.labelKey)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Custom date range */}
        {datePeriod === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('order.date_from')}</label>
              <input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={e => setCustomFrom(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('order.date_to')}</label>
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={e => setCustomTo(e.target.value)}
                className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
            </div>
          </div>
        )}

        {/* Reset + results count */}
        <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
          <button
            onClick={resetFilters}
            disabled={!hasActiveFilters}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t('order.reset_filters')}
          </button>
          {!loading && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {filteredOrders.length === 0
                ? t('order.no_orders_found')
                : `${filteredOrders.length} ${t('order.orders_count')}`}
            </span>
          )}
        </div>
      </div>

      {/* Loading spinner */}
      {loading && (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="text-center py-10 text-red-500 text-sm">{error}</div>
      )}

      {/* Empty state */}
      {!loading && !error && filteredOrders.length === 0 && (
        <div className="text-center py-20 text-gray-400 dark:text-gray-500 text-sm">{t('order.no_orders_found')}</div>
      )}

      {/* Order list */}
      {!loading && !error && paginatedOrders.length > 0 && (
        <div className="space-y-3">
          {paginatedOrders.map(order => {
            const tel = formatPhone(order.customer_phone)
            const waMsg = encodeURIComponent(
              `Bonjour ${order.customer_first_name}, concernant votre commande : ${order.product_name}.`
            )
            const img = order.product?.images?.[0]?.image_url

            return (
              <div key={order.id} className="bg-white dark:bg-dark-card rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border p-4 transition-colors duration-200">
                <div className="flex items-start gap-4">
                  <div className="shrink-0">
                    {img ? (
                      <img
                        src={img}
                        alt={order.product_name}
                        className="w-14 h-14 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="w-14 h-14 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center text-2xl">
                        🛍️
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white text-sm">{order.product_name}</p>
                        <p className="text-blue-600 dark:text-blue-400 font-bold text-sm">
                          {order.product_price.toLocaleString()} MAD
                        </p>
                      </div>
                      <OrderStatusBadge status={order.status} />
                    </div>

                    <p className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      {order.customer_first_name} {order.customer_last_name}
                    </p>

                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <a
                        href={`tel:${tel}`}
                        className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors"
                      >
                        <Phone className="w-4 h-4" />
                        {order.customer_phone}
                      </a>
                      <a
                        href={`https://wa.me/${tel.replace('+', '')}?text=${waMsg}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-1 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        WA
                      </a>
                    </div>

                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-400 dark:text-gray-500">{timeAgo(order.created_at)}</span>
                      <select
                        value={order.status}
                        onChange={e => updateStatus(order.id, e.target.value as OrderStatus)}
                        className="text-xs border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                      >
                        {STATUSES.filter(s => s.value !== '').map(s => (
                          <option key={s.value} value={s.value}>{t(s.labelKey)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t('order.prev_page')}
          </button>
          <span className="text-sm text-gray-500 dark:text-gray-400 min-w-[6rem] text-center">
            {t('order.page_label')} {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t('order.next_page')}
          </button>
        </div>
      )}
    </AdminLayout>
  )
}
