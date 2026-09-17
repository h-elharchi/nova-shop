import { useState, useEffect, useCallback } from 'react'
import {
  Search, Phone, MessageCircle, Plus, X, ExternalLink,
  Archive, RotateCcw, Trash2, AlertTriangle, ChevronLeft, ChevronRight,
  MapPin, Tag,
} from 'lucide-react'
import { AdminLayout } from './AdminLayout'
import { useCustomers, useCustomerAddresses, useCustomerAudit } from '../../hooks/useCustomers'
import { useI18n } from '../../context/LanguageContext'
import { OrderCreateModal } from '../../components/orders/OrderCreateModal'
import { OrderStatusBadge } from '../../components/orders/OrderStatusBadge'
import { supabase } from '../../lib/supabase'
import type { Order } from '../../types'
import type { CustomerView, CustomerAddress } from '../../types/interactions'

function formatPhone(phone: string): string {
  const c = phone.replace(/\s+/g, '')
  if (c.startsWith('0')) return '+212' + c.slice(1)
  return c.startsWith('00212') ? '+' + c.slice(2) : c
}

const SOURCE_ICONS: Record<string, string> = {
  site: '🌐', whatsapp: '📱', email: '📧', chat: '💬', phone: '☎️',
}

const STATUS_COLORS: Record<string, string> = {
  active:     'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  archived:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  blocked:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  merged:     'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  anonymized: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
}

// ─── Modal archive ────────────────────────────────────────────

function ArchiveModal({ customer, onConfirm, onClose, t }: {
  customer: CustomerView
  onConfirm: (reason: string) => void
  onClose: () => void
  t: (k: string) => string
}) {
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-dark-card rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <h3 className="font-bold text-gray-900 dark:text-white">{t('customers_v2.archive_confirm')}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">{customer.first_name} {customer.last_name}</p>
        <input
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder={t('customers_v2.archive_reason')}
          className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500"
        />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:underline">{t('common.cancel')}</button>
          <button onClick={() => onConfirm(reason)} className="px-4 py-1.5 text-sm font-medium bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg">{t('customers_v2.archive')}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal delete ─────────────────────────────────────────────

function DeleteModal({ customer, onConfirm, onClose, t }: {
  customer: CustomerView
  onConfirm: (reason: string) => void
  onClose: () => void
  t: (k: string) => string
}) {
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-dark-card rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertTriangle className="w-5 h-5" />
          <h3 className="font-bold">{t('customers_v2.delete_confirm')}</h3>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">{customer.first_name} {customer.last_name}</p>
        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 block mb-1">{t('customers_v2.delete_reason')}</label>
          <input
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            required
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:underline">{t('common.cancel')}</button>
          <button
            onClick={() => reason.trim() && onConfirm(reason)}
            disabled={!reason.trim()}
            className="px-4 py-1.5 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50"
          >{t('customers_v2.delete')}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Addresses tab ────────────────────────────────────────────

function AddressesTab({ customerId, t }: { customerId: string; t: (k: string) => string }) {
  const { addresses, loading, addAddress, deleteAddress, setDefault } = useCustomerAddresses(customerId)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ label: 'Adresse', city: '', district: '', address: '', landmark: '', is_default: false })

  async function handleAdd() {
    const ok = await addAddress({ label: form.label, city: form.city || null, district: form.district || null, address: form.address || null, landmark: form.landmark || null, is_default: form.is_default })
    if (ok) { setShowForm(false); setForm({ label: 'Adresse', city: '', district: '', address: '', landmark: '', is_default: false }) }
  }

  if (loading) return <div className="py-6 text-center text-sm text-gray-400">{t('common.loading')}</div>

  return (
    <div className="space-y-3">
      {addresses.length === 0 && !showForm && (
        <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">{t('customers_v2.addresses')}</p>
      )}
      {addresses.map((a: CustomerAddress) => (
        <div key={a.id} className="flex items-start justify-between gap-3 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-gray-400" />
              {a.label}
              {a.is_default && <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">{t('customers_v2.default_address')}</span>}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {[a.city, a.district, a.address, a.landmark].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex gap-1 shrink-0">
            {!a.is_default && (
              <button onClick={() => setDefault(a.id)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline px-1">{t('customers_v2.set_default')}</button>
            )}
            <button onClick={() => deleteAddress(a.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}

      {showForm ? (
        <div className="border border-gray-200 dark:border-gray-600 rounded-xl p-3 space-y-2">
          {[
            ['label', t('customers_v2.default_address')],
            ['city', t('callback.city')],
            ['district', t('callback.form_district')],
            ['address', t('callback.form_address')],
            ['landmark', t('callback.form_landmark')],
          ].map(([key, placeholder]) => (
            <input
              key={key}
              value={form[key as keyof typeof form] as string}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              placeholder={placeholder}
              className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
            />
          ))}
          <div className="flex gap-2">
            <button onClick={handleAdd} className="text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg">{t('common.save')}</button>
            <button onClick={() => setShowForm(false)} className="text-xs text-gray-500 dark:text-gray-400 hover:underline">{t('common.cancel')}</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
          <Plus className="w-3.5 h-3.5" />{t('customers_v2.add_address')}
        </button>
      )}
    </div>
  )
}

// ─── Customer Detail Modal ────────────────────────────────────

type DetailTab = 'orders' | 'addresses' | 'audit'

interface CustomerDetailModalProps {
  customer: CustomerView
  onClose: () => void
  onUpdated: () => void
  t: (k: string) => string
  isAdmin: boolean
}

function CustomerDetailModal({ customer, onClose, onUpdated, t, isAdmin }: CustomerDetailModalProps) {
  const { updateNotes, archiveCustomer, restoreCustomer, deleteCustomer } = useCustomers()
  const { audit } = useCustomerAudit(customer.id)
  const [orders, setOrders]   = useState<Order[]>([])
  const [notes, setNotes]     = useState(customer.notes ?? '')
  const [saving, setSaving]   = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [activeTab, setActiveTab] = useState<DetailTab>('orders')
  const [showCreate, setShowCreate] = useState(false)
  const [showArchive, setShowArchive] = useState(false)
  const [showDelete, setShowDelete]   = useState(false)
  const [actionMsg, setActionMsg] = useState('')

  useEffect(() => {
    supabase
      .from('orders')
      .select('id, product_name, product_price, status, created_at, channel')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setOrders((data ?? []) as Order[]))
  }, [customer.id])

  async function handleSaveNotes() {
    setSaving(true)
    const ok = await updateNotes(customer.id, notes)
    setSaving(false)
    if (ok) { setSavedMsg(t('customers.notes_saved')); setTimeout(() => setSavedMsg(''), 2500) }
  }

  async function handleArchive(reason: string) {
    const ok = await archiveCustomer(customer.id, reason)
    if (ok) { onUpdated(); onClose() }
  }

  async function handleRestore() {
    const ok = await restoreCustomer(customer.id)
    if (ok) { onUpdated(); onClose() }
  }

  async function handleDelete(reason: string) {
    const result = await deleteCustomer(customer.id, reason)
    if (result) {
      setActionMsg(result === 'anonymized' ? 'Anonymisé' : 'Supprimé')
      setTimeout(() => { onUpdated(); onClose() }, 1500)
    }
  }

  const tel   = formatPhone(customer.phone)
  const waMsg = encodeURIComponent(`Bonjour ${customer.first_name}`)

  const tabs: { key: DetailTab; label: string }[] = [
    { key: 'orders',    label: `${t('customers.orders_tab')} (${orders.length})` },
    { key: 'addresses', label: t('customers_v2.addresses') },
    { key: 'audit',     label: t('customers_v2.audit_log') },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-xl bg-white dark:bg-dark-card rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100 dark:border-dark-border sticky top-0 bg-white dark:bg-dark-card z-10 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-gray-900 dark:text-white">{customer.first_name} {customer.last_name}</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[customer.status] ?? ''}`}>
                {t(`customers_v2.status_${customer.status}`)}
              </span>
              {customer.customer_number && (
                <span className="text-xs text-gray-400 dark:text-gray-500">{customer.customer_number}</span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <a href={`tel:${tel}`} className="text-sm text-blue-600 dark:text-blue-400 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" />{customer.phone}
              </a>
              <a href={`https://wa.me/${tel.replace('+', '')}?text=${waMsg}`} target="_blank" rel="noopener noreferrer"
                className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-lg flex items-center gap-1">
                <MessageCircle className="w-3 h-3" />WA
              </a>
              {customer.email && <span className="text-sm text-gray-500 dark:text-gray-400">{customer.email}</span>}
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {SOURCE_ICONS[customer.source]} {t(`customers.source_${customer.source}`)}
                {' · '}{t('customers.col_orders')} : {customer.order_count}
              </p>
              {customer.tags && customer.tags.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {customer.tags.map(tag => (
                    <span key={tag} className="flex items-center gap-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded">
                      <Tag className="w-2.5 h-2.5" />{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 ml-3 shrink-0">
            {isAdmin && customer.status === 'active' && (
              <button onClick={() => setShowArchive(true)} title={t('customers_v2.archive')}
                className="p-1.5 rounded-lg text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20">
                <Archive className="w-4 h-4" />
              </button>
            )}
            {isAdmin && customer.status === 'archived' && (
              <button onClick={handleRestore} title={t('customers_v2.restore')}
                className="p-1.5 rounded-lg text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20">
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            {isAdmin && customer.status !== 'anonymized' && customer.status !== 'merged' && (
              <button onClick={() => setShowDelete(true)} title={t('customers_v2.delete')}
                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Notes */}
        <div className="px-5 pt-4 shrink-0">
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">{t('customers.notes_label')}</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder={t('customers.notes_placeholder')}
            className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none placeholder:text-gray-400"
          />
          <div className="flex items-center gap-2 mt-1.5">
            <button onClick={handleSaveNotes} disabled={saving}
              className="text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
              {saving ? '…' : t('customers.save_notes')}
            </button>
            {savedMsg && <span className="text-xs text-green-600 dark:text-green-400">{savedMsg}</span>}
            {actionMsg && <span className="text-xs text-blue-600 dark:text-blue-400">{actionMsg}</span>}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-4 border-b border-gray-100 dark:border-dark-border shrink-0">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-2 text-xs font-medium rounded-t-lg transition-colors ${activeTab === tab.key ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'orders' && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <button onClick={() => setShowCreate(true)}
                  className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                  <Plus className="w-3 h-3" />{t('customers.add_order')}
                </button>
              </div>
              {orders.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">{t('order.no_orders')}</p>
              ) : (
                orders.map(o => (
                  <div key={o.id} className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{o.product_name}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {o.product_price.toLocaleString()} MAD · {new Date(o.created_at).toLocaleDateString('fr-MA')}
                      </p>
                    </div>
                    <OrderStatusBadge status={o.status} />
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'addresses' && (
            <AddressesTab customerId={customer.id} t={t} />
          )}

          {activeTab === 'audit' && (
            <div className="space-y-2">
              {audit.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">{t('common.no_results')}</p>
              ) : (
                audit.map((entry, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-xs text-gray-400 whitespace-nowrap mt-0.5">
                      {new Date(entry.created_at).toLocaleDateString('fr-MA')}
                    </span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">{entry.action}</span>
                    {entry.reason && <span className="text-gray-500 dark:text-gray-400 text-xs">— {entry.reason}</span>}
                    {entry.actor_email && <span className="text-gray-400 dark:text-gray-500 text-xs">{entry.actor_email}</span>}
                  </div>
                ))
              )}
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

      {showArchive && (
        <ArchiveModal customer={customer} onConfirm={handleArchive} onClose={() => setShowArchive(false)} t={t} />
      )}
      {showDelete && (
        <DeleteModal customer={customer} onConfirm={handleDelete} onClose={() => setShowDelete(false)} t={t} />
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────

const PAGE_SIZE = 30

export function CustomersPage() {
  const { t } = useI18n()
  const [searchInput, setSearchInput]   = useState('')
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'blocked' | 'all'>('active')
  const [page, setPage]                 = useState(1)
  const [selected, setSelected]         = useState<CustomerView | null>(null)
  const [showCreate, setShowCreate]     = useState(false)
  const [isAdmin, setIsAdmin]           = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput); setPage(1) }, 350)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    supabase.rpc('is_admin').then(({ data }) => setIsAdmin(Boolean(data)))
  }, [])

  const { customers, total, loading, error, refetch } = useCustomers({
    search,
    status: statusFilter,
    page,
    pageSize: PAGE_SIZE,
  })

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const handleUpdated = useCallback(() => {
    refetch()
    setSelected(null)
  }, [refetch])

  const STATUS_OPTS: { value: typeof statusFilter; labelKey: string }[] = [
    { value: 'active',   labelKey: 'customers_v2.status_active' },
    { value: 'archived', labelKey: 'customers_v2.status_archived' },
    { value: 'blocked',  labelKey: 'customers_v2.status_blocked' },
    { value: 'all',      labelKey: 'filters.all_categories' },
  ]

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('customers.title')}</h1>
            {!loading && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {t('customers.total').replace('{n}', String(total))}
              </p>
            )}
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors">
            <Plus className="w-4 h-4" />{t('customers_v2.new_customer')}
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder={t('customers.search')}
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-dark-card text-gray-900 dark:text-gray-100 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition placeholder:text-gray-400"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value as typeof statusFilter); setPage(1) }}
            className="border border-gray-200 dark:border-gray-600 bg-white dark:bg-dark-card text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {STATUS_OPTS.map(o => (
              <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
            ))}
          </select>
        </div>

        {/* States */}
        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!loading && error && <p className="text-red-500 text-sm">{error}</p>}
        {!loading && !error && customers.length === 0 && (
          <div className="text-center py-16 text-gray-400 dark:text-gray-500 text-sm">{t('customers.no_results')}</div>
        )}

        {/* Table */}
        {!loading && customers.length > 0 && (
          <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-dark-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-dark-border bg-gray-50 dark:bg-gray-800/50">
                    {[
                      t('customers_v2.col_number'),
                      t('customers.col_name'),
                      t('customers.col_phone'),
                      t('customers.col_email'),
                      t('customers.col_orders'),
                      t('customers_v2.filter_status'),
                      '',
                    ].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-dark-border">
                  {customers.map(c => {
                    const tel   = formatPhone(c.phone)
                    const waMsg = encodeURIComponent(`Bonjour ${c.first_name}`)
                    return (
                      <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap font-mono">
                          {c.customer_number ?? '—'}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                          {c.first_name} {c.last_name}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <a href={`tel:${tel}`} className="text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 text-xs">{c.phone}</a>
                            <a href={`https://wa.me/${tel.replace('+', '')}?text=${waMsg}`} target="_blank" rel="noopener noreferrer"
                              className="text-green-600 dark:text-green-400 hover:opacity-70">
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{c.email ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs text-center">{c.order_count}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[c.status] ?? ''}`}>
                            {t(`customers_v2.status_${c.status}`)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => setSelected(c)}
                            className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                            <ExternalLink className="w-3.5 h-3.5" />{t('customers.view_orders')}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-dark-border">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {t('order.page_label')} {page}/{totalPages}
                </span>
                <div className="flex gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-700">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-700">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {selected && (
        <CustomerDetailModal
          customer={selected}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
          t={t}
          isAdmin={isAdmin}
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
