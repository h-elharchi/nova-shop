import { useState, useEffect, useMemo } from 'react'
import { Search, Phone, MessageCircle, Plus, X, ExternalLink } from 'lucide-react'
import { AdminLayout } from './AdminLayout'
import { useCustomers } from '../../hooks/useCustomers'
import { useI18n } from '../../context/LanguageContext'
import { OrderCreateModal } from '../../components/orders/OrderCreateModal'
import { OrderStatusBadge } from '../../components/orders/OrderStatusBadge'
import { supabase } from '../../lib/supabase'
import type { Customer, Order } from '../../types'

function timeAgo(dateStr: string, lang: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return lang === 'ar' ? 'اليوم' : "Aujourd'hui"
  if (days === 1) return lang === 'ar' ? 'أمس' : 'Hier'
  return lang === 'ar' ? `منذ ${days} يوم` : `Il y a ${days} jours`
}

function formatPhone(phone: string): string {
  const c = phone.replace(/\s+/g, '')
  if (c.startsWith('0')) return '+212' + c.slice(1)
  return c.startsWith('00212') ? '+' + c.slice(2) : c
}

const SOURCE_ICONS: Record<string, string> = {
  site: '🌐', whatsapp: '📱', email: '📧', chat: '💬', phone: '☎️',
}

interface CustomerDetailModalProps {
  customer: Customer
  onClose: () => void
  t: (k: string) => string
  lang: string
}

function CustomerDetailModal({ customer, onClose, t, lang }: CustomerDetailModalProps) {
  const { updateNotes } = useCustomers()
  const [orders, setOrders]     = useState<Order[]>([])
  const [notes, setNotes]       = useState(customer.notes ?? '')
  const [saving, setSaving]     = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    supabase
      .from('orders')
      .select('id, product_name, product_price, status, created_at, channel, notes')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setOrders((data ?? []) as Order[]))
  }, [customer.id])

  async function handleSaveNotes() {
    setSaving(true)
    const ok = await updateNotes(customer.id, notes)
    setSaving(false)
    if (ok) {
      setSavedMsg(t('customers.notes_saved'))
      setTimeout(() => setSavedMsg(''), 2500)
    }
  }

  const tel   = formatPhone(customer.phone)
  const waMsg = encodeURIComponent(`Bonjour ${customer.first_name}`)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-xl bg-white dark:bg-dark-card rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100 dark:border-dark-border sticky top-0 bg-white dark:bg-dark-card z-10">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">
              {customer.first_name} {customer.last_name}
            </h2>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <a href={`tel:${tel}`} className="text-sm text-blue-600 dark:text-blue-400 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" />{customer.phone}
              </a>
              <a href={`https://wa.me/${tel.replace('+', '')}?text=${waMsg}`} target="_blank" rel="noopener noreferrer"
                className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-lg flex items-center gap-1">
                <MessageCircle className="w-3 h-3" />WA
              </a>
              {customer.email && (
                <span className="text-sm text-gray-500 dark:text-gray-400">{customer.email}</span>
              )}
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {SOURCE_ICONS[customer.source]} {t(`customers.source_${customer.source}`)}
              {' · '}{timeAgo(customer.created_at, lang)}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Notes internes */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
              {t('customers.notes_label')}
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder={t('customers.notes_placeholder')}
              className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none placeholder:text-gray-400"
            />
            <div className="flex items-center gap-2 mt-1.5">
              <button
                onClick={handleSaveNotes}
                disabled={saving}
                className="text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? '…' : t('customers.save_notes')}
              </button>
              {savedMsg && <span className="text-xs text-green-600 dark:text-green-400">{savedMsg}</span>}
            </div>
          </div>

          {/* Commandes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {t('customers.orders_tab')} ({orders.length})
              </label>
              <button
                onClick={() => setShowCreate(true)}
                className="text-xs flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
              >
                <Plus className="w-3 h-3" />{t('customers.add_order')}
              </button>
            </div>
            {orders.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">{t('order.no_orders')}</p>
            ) : (
              <div className="space-y-2">
                {orders.map(o => (
                  <div key={o.id} className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{o.product_name}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {o.product_price.toLocaleString()} MAD · {new Date(o.created_at).toLocaleDateString('fr-MA')}
                      </p>
                    </div>
                    <OrderStatusBadge status={o.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {showCreate && (
          <OrderCreateModal
            onClose={() => setShowCreate(false)}
            prefillCustomer={{ first_name: customer.first_name, last_name: customer.last_name, phone: customer.phone }}
            defaultChannel="phone"
          />
        )}
      </div>
    </div>
  )
}

export function CustomersPage() {
  const { t, lang } = useI18n()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch]           = useState('')
  const [selected, setSelected]       = useState<Customer | null>(null)
  const [showCreate, setShowCreate]   = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 350)
    return () => clearTimeout(timer)
  }, [searchInput])

  const { customers, loading, error, refetch } = useCustomers({ search })

  const sorted = useMemo(() => [...customers], [customers])

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('customers.title')}</h1>
            {!loading && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {t('customers.total').replace('{n}', String(customers.length))}
              </p>
            )}
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('customers.add_order')}
          </button>
        </div>

        {/* Recherche */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder={t('customers.search')}
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-dark-card text-gray-900 dark:text-gray-100 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition placeholder:text-gray-400"
          />
        </div>

        {/* États */}
        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!loading && error && <p className="text-red-500 text-sm">{error}</p>}
        {!loading && !error && sorted.length === 0 && (
          <div className="text-center py-16 text-gray-400 dark:text-gray-500 text-sm">{t('customers.no_results')}</div>
        )}

        {/* Table */}
        {!loading && sorted.length > 0 && (
          <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-dark-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-dark-border bg-gray-50 dark:bg-gray-800/50">
                    {[t('customers.col_name'), t('customers.col_phone'), t('customers.col_email'), t('customers.col_source'), t('customers.col_date'), ''].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-dark-border">
                  {sorted.map(c => {
                    const tel   = formatPhone(c.phone)
                    const waMsg = encodeURIComponent(`Bonjour ${c.first_name}`)
                    return (
                      <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                          {c.first_name} {c.last_name}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <a href={`tel:${tel}`} className="text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-xs">{c.phone}</a>
                            <a href={`https://wa.me/${tel.replace('+', '')}?text=${waMsg}`} target="_blank" rel="noopener noreferrer"
                              className="text-green-600 dark:text-green-400 hover:opacity-70 transition-opacity">
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{c.email ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
                          {SOURCE_ICONS[c.source]} {t(`customers.source_${c.source}`)}
                        </td>
                        <td className="px-4 py-3 text-gray-400 dark:text-gray-500 text-xs whitespace-nowrap">
                          {timeAgo(c.created_at, lang)}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => setSelected(c)}
                            className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            {t('customers.view_orders')}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <CustomerDetailModal
          customer={selected}
          onClose={() => { setSelected(null); refetch() }}
          t={t}
          lang={lang}
        />
      )}

      {showCreate && (
        <OrderCreateModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => refetch()}
          defaultChannel="phone"
        />
      )}
    </AdminLayout>
  )
}
