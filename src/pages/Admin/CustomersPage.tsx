import { useState, useEffect, useCallback } from 'react'
import {
  Search, Phone, MessageCircle, Plus, X, ExternalLink,
  Archive, RotateCcw, Trash2, AlertTriangle, ChevronLeft, ChevronRight,
  MapPin, Tag, Download, BadgeCheck, GitMerge,
} from 'lucide-react'
import { AdminLayout } from './AdminLayout'
import { useCustomers, useCustomerAddresses, useCustomerAudit } from '../../hooks/useCustomers'
import { useI18n } from '../../context/LanguageContext'
import { OrderCreateModal } from '../../components/orders/OrderCreateModal'
import { CustomerOrdersPanel } from '../../components/orders/CustomerOrdersPanel'
import { exportCustomersToExcel } from '../../lib/exportExcel'
import { supabase } from '../../lib/supabase'
import type { CustomerView, CustomerAddress } from '../../types/interactions'

function formatPhone(phone: string | null): string | null {
  if (!phone) return null
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

function ArchiveModal({ customer, onConfirm, onClose, t, error }: {
  customer: CustomerView
  onConfirm: (reason: string) => void
  onClose: () => void
  t: (k: string) => string
  error?: string | null
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
        {error && (
          <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>
        )}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:underline">{t('common.cancel')}</button>
          <button onClick={() => onConfirm(reason)} className="px-4 py-1.5 text-sm font-medium bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg">{t('customers_v2.archive')}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal delete ─────────────────────────────────────────────

function DeleteModal({ customer, onConfirm, onClose, t, error }: {
  customer: CustomerView
  onConfirm: (reason: string) => void
  onClose: () => void
  t: (k: string) => string
  error?: string | null
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
        {error && (
          <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>
        )}
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

// ─── Modal fusion ─────────────────────────────────────────────

export interface MergeFieldValues {
  firstName: string
  lastName: string
  phone: string | null
  phone2: string | null
  email: string | null
  email2: string | null
  whatsappPhone: string | null
  notes: string | null
}

function candidates(...values: (string | null | undefined)[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    const t = v?.trim()
    if (t && !seen.has(t)) { seen.add(t); out.push(t) }
  }
  return out
}

function FieldChoice({ label, options, value, onChange }: {
  label: string
  options: string[]
  value: string | null
  onChange: (v: string) => void
}) {
  if (options.length === 0) return null
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => (
          <button key={opt} type="button" onClick={() => onChange(opt)}
            className={`px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
              value === opt
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                : 'border-gray-200 dark:border-dark-border text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500'
            }`}>
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}

function MergeModal({ customer, onConfirm, onClose, t, error }: {
  customer: CustomerView
  onConfirm: (targetId: string, fields: MergeFieldValues) => void
  onClose: () => void
  t: (k: string) => string
  error?: string | null
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CustomerView[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<CustomerView | null>(null)
  const [fields, setFields] = useState<MergeFieldValues | null>(null)

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    setSearching(true)
    const timeout = setTimeout(async () => {
      const s = `%${query.trim()}%`
      const { data } = await supabase
        .from('customers_view')
        .select('*')
        .neq('id', customer.id)
        .not('status', 'in', '("anonymized","merged")')
        .or(`first_name.ilike.${s},last_name.ilike.${s},phone.ilike.${s},email.ilike.${s},customer_number.ilike.${s}`)
        .limit(8)
      setResults((data ?? []) as CustomerView[])
      setSearching(false)
    }, 300)
    return () => clearTimeout(timeout)
  }, [query, customer.id])

  function selectDuplicate(r: CustomerView) {
    setSelected(r)
    setFields({
      firstName:     customer.first_name || r.first_name,
      lastName:      customer.last_name || r.last_name,
      phone:         customer.phone ?? r.phone ?? null,
      phone2:        customer.phone2 ?? r.phone2 ?? null,
      email:         customer.email ?? r.email ?? null,
      email2:        customer.email2 ?? r.email2 ?? null,
      whatsappPhone: customer.whatsapp_phone ?? r.whatsapp_phone ?? null,
      notes:         [customer.notes, r.notes].filter(Boolean).join('\n') || null,
    })
  }

  function back() {
    setSelected(null)
    setFields(null)
  }

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-dark-card rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
        <h3 className="font-bold text-gray-900 dark:text-white">{t('customers_v2.merge_title')}</h3>

        {!selected ? (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('customers_v2.merge_into').replace('{name}', `${customer.first_name} ${customer.last_name}`)}
            </p>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('customers_v2.merge_search_placeholder')}
              className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <div className="max-h-56 overflow-y-auto space-y-1">
              {searching && <p className="text-xs text-gray-400 text-center py-3">{t('common.loading')}</p>}
              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-3">{t('common.no_results')}</p>
              )}
              {results.map(r => (
                <button key={r.id} onClick={() => selectDuplicate(r)}
                  className="w-full text-left px-3 py-2 rounded-lg border border-gray-100 dark:border-dark-border hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{r.first_name} {r.last_name}</p>
                  <p className="text-xs text-gray-400">{r.phone ?? '—'}{r.email ? ` · ${r.email}` : ''}</p>
                </button>
              ))}
            </div>
          </>
        ) : fields && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('customers_v2.merge_compare_hint')}</p>
            <div className="max-h-[50vh] overflow-y-auto space-y-3 pr-1">
              <FieldChoice label={t('chat.first_name')}
                options={candidates(customer.first_name, selected.first_name)}
                value={fields.firstName}
                onChange={v => setFields(f => f && { ...f, firstName: v })} />
              <FieldChoice label={t('chat.last_name')}
                options={candidates(customer.last_name, selected.last_name)}
                value={fields.lastName}
                onChange={v => setFields(f => f && { ...f, lastName: v })} />
              <FieldChoice label={t('customers.col_phone')}
                options={candidates(customer.phone, selected.phone)}
                value={fields.phone}
                onChange={v => setFields(f => f && { ...f, phone: v })} />
              <FieldChoice label={t('customers_v2.phone2')}
                options={candidates(customer.phone2, selected.phone2)}
                value={fields.phone2}
                onChange={v => setFields(f => f && { ...f, phone2: v })} />
              <FieldChoice label={t('customers.col_email')}
                options={candidates(customer.email, selected.email)}
                value={fields.email}
                onChange={v => setFields(f => f && { ...f, email: v })} />
              <FieldChoice label={t('customers_v2.email2')}
                options={candidates(customer.email2, selected.email2)}
                value={fields.email2}
                onChange={v => setFields(f => f && { ...f, email2: v })} />
              <FieldChoice label={t('customers_v2.whatsapp')}
                options={candidates(customer.whatsapp_phone, selected.whatsapp_phone)}
                value={fields.whatsappPhone}
                onChange={v => setFields(f => f && { ...f, whatsappPhone: v })} />
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('customers.notes_label')}</p>
                <textarea
                  value={fields.notes ?? ''}
                  onChange={e => setFields(f => f && { ...f, notes: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>
            <p className="flex items-start gap-1.5 text-xs text-orange-600 dark:text-orange-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {t('customers_v2.merge_warning')}
            </p>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex gap-2 justify-end">
          <button onClick={selected ? back : onClose} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:underline">
            {selected ? t('customers_v2.merge_back') : t('common.cancel')}
          </button>
          {selected && fields && (
            <button
              onClick={() => onConfirm(selected.id, fields)}
              disabled={!fields.firstName.trim() || (!fields.phone && !fields.email)}
              className="px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg"
            >
              {t('customers_v2.merge_confirm')}
            </button>
          )}
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
  const { updateNotes, archiveCustomer, restoreCustomer, deleteCustomer, mergeCustomers } = useCustomers()
  const { audit } = useCustomerAudit(customer.id)
  const [notes, setNotes]     = useState(customer.notes ?? '')
  const [saving, setSaving]   = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [activeTab, setActiveTab] = useState<DetailTab>('orders')
  const [showArchive, setShowArchive] = useState(false)
  const [showDelete, setShowDelete]   = useState(false)
  const [showMerge, setShowMerge]     = useState(false)
  const [actionMsg, setActionMsg] = useState('')
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const [deleteError, setDeleteError]   = useState<string | null>(null)
  const [mergeError, setMergeError]     = useState<string | null>(null)

  async function handleSaveNotes() {
    setSaving(true)
    const ok = await updateNotes(customer.id, notes)
    setSaving(false)
    if (ok) { setSavedMsg(t('customers.notes_saved')); setTimeout(() => setSavedMsg(''), 2500) }
  }

  async function handleArchive(reason: string) {
    setArchiveError(null)
    const { ok, error: err } = await archiveCustomer(customer.id, reason)
    if (ok) { onUpdated(); onClose() } else { setArchiveError(err) }
  }

  async function handleRestore() {
    const { ok } = await restoreCustomer(customer.id)
    if (ok) { onUpdated(); onClose() }
  }

  async function handleDelete(reason: string) {
    setDeleteError(null)
    const { result, error: err } = await deleteCustomer(customer.id, reason)
    if (result) {
      setActionMsg(result === 'anonymized' ? t('customers_v2.anonymized') : t('customers_v2.deleted'))
      setTimeout(() => { onUpdated(); onClose() }, 1500)
    } else {
      setDeleteError(err)
    }
  }

  async function handleMerge(targetId: string, fields: MergeFieldValues) {
    setMergeError(null)
    const { ok, error: err } = await mergeCustomers(customer.id, targetId, fields)
    if (ok) {
      setActionMsg(t('customers_v2.merge_success'))
      setTimeout(() => { onUpdated(); onClose() }, 1500)
    } else {
      setMergeError(err)
    }
  }

  const tel   = formatPhone(customer.phone)
  const waMsg = encodeURIComponent(`Bonjour ${customer.first_name}`)

  const tabs: { key: DetailTab; label: string }[] = [
    { key: 'orders',    label: t('customers.orders_tab') },
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
              {customer.delivered_count > 0 && (
                <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/25 px-2 py-0.5 rounded-full">
                  <BadgeCheck className="w-3.5 h-3.5" />
                  {t('customers.real_customer_badge')} · {customer.delivered_count}
                </span>
              )}
              {customer.customer_number && (
                <span className="text-xs text-gray-400 dark:text-gray-500">{customer.customer_number}</span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {tel && (
                <>
                  <a href={`tel:${tel}`} className="text-sm text-blue-600 dark:text-blue-400 flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5" />{customer.phone}
                  </a>
                  <a href={`https://wa.me/${tel.replace('+', '')}?text=${waMsg}`} target="_blank" rel="noopener noreferrer"
                    className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-lg flex items-center gap-1">
                    <MessageCircle className="w-3 h-3" />WA
                  </a>
                </>
              )}
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
            {customer.status !== 'anonymized' && customer.status !== 'merged' && (
              <button onClick={() => setShowMerge(true)} title={t('customers_v2.merge')}
                className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                <GitMerge className="w-4 h-4" />
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
            <CustomerOrdersPanel
              customerId={customer.id}
              prefillCustomer={{ first_name: customer.first_name, last_name: customer.last_name, phone: customer.phone ?? '' }}
              defaultChannel="phone"
            />
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

      {showArchive && (
        <ArchiveModal customer={customer} onConfirm={handleArchive} onClose={() => { setShowArchive(false); setArchiveError(null) }} t={t} error={archiveError} />
      )}
      {showDelete && (
        <DeleteModal customer={customer} onConfirm={handleDelete} onClose={() => { setShowDelete(false); setDeleteError(null) }} t={t} error={deleteError} />
      )}
      {showMerge && (
        <MergeModal customer={customer} onConfirm={handleMerge} onClose={() => { setShowMerge(false); setMergeError(null) }} t={t} error={mergeError} />
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────

const PAGE_SIZE = 30

export function CustomersPage() {
  const { t, lang } = useI18n()
  const [searchInput, setSearchInput]   = useState('')
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'blocked' | 'all'>('active')
  const [dateFrom, setDateFrom]         = useState('')
  const [dateTo, setDateTo]             = useState('')
  const [ordersFilter, setOrdersFilter] = useState<'' | 'none' | 'with' | '5plus' | 'delivered'>('')
  const [page, setPage]                 = useState(1)
  const [selected, setSelected]         = useState<CustomerView | null>(null)
  const [showCreate, setShowCreate]     = useState(false)
  const [isAdmin, setIsAdmin]           = useState(false)
  const [exporting, setExporting]       = useState(false)

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
    dateFrom: dateFrom || undefined,
    dateTo:   dateTo   || undefined,
    ordersFilter: ordersFilter || undefined,
  })

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const handleUpdated = useCallback(() => {
    refetch()
    setSelected(null)
  }, [refetch])

  const resetFilters = useCallback(() => {
    setDateFrom('')
    setDateTo('')
    setOrdersFilter('')
    setPage(1)
  }, [])

  const hasExtraFilters = dateFrom || dateTo || ordersFilter

  const handleExport = useCallback(async () => {
    setExporting(true)
    let q = supabase
      .from('customers_view')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5000)

    const s = statusFilter !== 'all' ? statusFilter : null
    if (s) q = q.eq('status', s)
    else   q = q.not('status', 'in', '("anonymized","merged")')

    if (search.trim()) {
      const p = `%${search.trim()}%`
      q = q.or(`first_name.ilike.${p},last_name.ilike.${p},phone.ilike.${p},email.ilike.${p},customer_number.ilike.${p}`)
    }
    if (dateFrom) q = q.gte('created_at', dateFrom + 'T00:00:00')
    if (dateTo)   q = q.lte('created_at', dateTo + 'T23:59:59.999')
    if (ordersFilter === 'none')      q = q.eq('order_count', 0)
    if (ordersFilter === 'with')      q = q.gte('order_count', 1)
    if (ordersFilter === '5plus')     q = q.gte('order_count', 5)
    if (ordersFilter === 'delivered') q = q.gte('delivered_count', 1)

    const { data } = await q
    if (data && data.length > 0) {
      exportCustomersToExcel(data as CustomerView[], {
        number:     t('customers.excel_number'),
        name:       t('customers.excel_name'),
        phone:      t('customers.excel_phone'),
        email:      t('customers.excel_email'),
        city:       t('customers.excel_city'),
        source:     t('customers.excel_source'),
        orders:     t('customers.excel_orders'),
        status:     t('customers.excel_status'),
        created_at: t('customers.excel_created_at'),
      }, `clients_${new Date().toISOString().slice(0, 10)}.xlsx`)
    }
    setExporting(false)
  }, [search, statusFilter, dateFrom, dateTo, ordersFilter, lang, t])

  const STATUS_OPTS: { value: typeof statusFilter; labelKey: string }[] = [
    { value: 'active',   labelKey: 'customers_v2.status_active' },
    { value: 'archived', labelKey: 'customers_v2.status_archived' },
    { value: 'blocked',  labelKey: 'customers_v2.status_blocked' },
    { value: 'all',      labelKey: 'filters.all_categories' },
  ]

  const ORDERS_OPTS: { value: '' | 'none' | 'with' | '5plus' | 'delivered'; labelKey: string }[] = [
    { value: '',          labelKey: 'customers.filter_orders_all' },
    { value: 'delivered', labelKey: 'customers.filter_orders_delivered' },
    { value: 'with',      labelKey: 'customers.filter_orders_with' },
    { value: '5plus',     labelKey: 'customers.filter_orders_5plus' },
    { value: 'none',      labelKey: 'customers.filter_orders_none' },
  ]

  const inputCls = 'border border-gray-200 dark:border-gray-600 bg-white dark:bg-dark-card text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-5">
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
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              disabled={exporting || loading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-dark-card text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              {exporting ? '…' : t('customers.export_excel')}
            </button>
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors">
              <Plus className="w-4 h-4" />{t('customers_v2.new_customer')}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder={t('customers.search')}
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                className={`w-full ${inputCls} pl-9`}
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value as typeof statusFilter); setPage(1) }}
              className={inputCls}
            >
              {STATUS_OPTS.map(o => (
                <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('customers.filter_date_from')}</span>
              <input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setPage(1) }}
                className={inputCls}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('customers.filter_date_to')}</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setPage(1) }}
                className={inputCls}
              />
            </div>
            <select
              value={ordersFilter}
              onChange={e => { setOrdersFilter(e.target.value as typeof ordersFilter); setPage(1) }}
              className={inputCls}
            >
              {ORDERS_OPTS.map(o => (
                <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
              ))}
            </select>
            {hasExtraFilters && (
              <button onClick={resetFilters} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-3.5 h-3.5" />{t('common.cancel')}
              </button>
            )}
          </div>
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
                      t('customers.col_city'),
                      t('customers.col_orders'),
                      t('customers.col_created_at'),
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
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-gray-900 dark:text-white">{c.first_name} {c.last_name}</span>
                            {c.delivered_count > 0 && (
                              <span title={t('customers.real_customer_badge')}
                                className="flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/25 px-1.5 py-0.5 rounded-full">
                                <BadgeCheck className="w-3 h-3" />{c.delivered_count}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {tel ? (
                            <div className="flex items-center gap-2">
                              <a href={`tel:${tel}`} className="text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 text-xs">{c.phone}</a>
                              <a href={`https://wa.me/${tel.replace('+', '')}?text=${waMsg}`} target="_blank" rel="noopener noreferrer"
                                className="text-green-600 dark:text-green-400 hover:opacity-70">
                                <MessageCircle className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{c.email ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{c.default_city ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs text-center">{c.order_count}</td>
                        <td className="px-4 py-3 text-gray-400 dark:text-gray-500 text-xs whitespace-nowrap">
                          {new Date(c.created_at).toLocaleDateString('fr-MA')}
                        </td>
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
