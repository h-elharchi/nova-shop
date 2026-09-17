import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { useI18n } from '../../context/LanguageContext'
import { OrderCreateModal } from './OrderCreateModal'
import { OrderStatusBadge } from './OrderStatusBadge'
import { supabase } from '../../lib/supabase'
import type { Order, OrderStatus, OrderChannel } from '../../types'

const ORDER_STATUSES: OrderStatus[] = [
  'new', 'assigned', 'contacted', 'unreachable', 'callback',
  'confirmed', 'processing', 'shipped', 'delivered',
  'returned', 'cancelled', 'on_hold',
]

interface Props {
  customerId: string
  prefillCustomer: { first_name: string; last_name: string; phone: string }
  compact?: boolean
  defaultChannel?: OrderChannel
}

interface EditState {
  status: OrderStatus
  notes: string
}

export function CustomerOrdersPanel({ customerId, prefillCustomer, compact = false, defaultChannel = 'phone' }: Props) {
  const { t } = useI18n()
  const [orders, setOrders]           = useState<Order[]>([])
  const [loading, setLoading]         = useState(true)
  const [showCreate, setShowCreate]   = useState(false)
  const [editingId, setEditingId]     = useState<string | null>(null)
  const [editState, setEditState]     = useState<EditState>({ status: 'new', notes: '' })
  const [saving, setSaving]           = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting]       = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select('id, product_name, product_price, status, notes, channel, created_at, customer_id')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
    setOrders((data ?? []) as Order[])
    setLoading(false)
  }, [customerId])

  useEffect(() => { load() }, [load])

  function startEdit(o: Order) {
    setEditingId(o.id)
    setEditState({ status: o.status, notes: o.notes ?? '' })
    setConfirmDeleteId(null)
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function saveEdit(id: string) {
    setSaving(true)
    const { error } = await supabase
      .from('orders')
      .update({ status: editState.status, notes: editState.notes || null })
      .eq('id', id)
    setSaving(false)
    if (!error) {
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: editState.status, notes: editState.notes || null } : o))
      setEditingId(null)
    }
  }

  async function cancelOrder(id: string) {
    setDeleting(true)
    const { error } = await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', id)
    setDeleting(false)
    if (!error) {
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'cancelled' } : o))
      setConfirmDeleteId(null)
    }
  }

  if (loading) {
    return <p className="text-xs text-gray-400 dark:text-gray-500 py-3 text-center">{t('common.loading')}</p>
  }

  return (
    <div className="space-y-2">
      {/* Add button */}
      <div className="flex justify-end">
        <button
          onClick={() => { setShowCreate(true); setEditingId(null); setConfirmDeleteId(null) }}
          className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          <Plus className="w-3 h-3" />{t('customers.add_order')}
        </button>
      </div>

      {orders.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 py-3 text-center">{t('order.no_orders')}</p>
      ) : (
        <div className="space-y-2">
          {orders.map(o => (
            <div key={o.id} className="bg-gray-50 dark:bg-gray-800 rounded-xl overflow-hidden">
              {editingId === o.id ? (
                /* ── Edit row ── */
                <div className="p-3 space-y-2">
                  <p className={`font-medium text-gray-800 dark:text-gray-200 truncate ${compact ? 'text-xs' : 'text-sm'}`}>
                    {o.product_name}
                  </p>
                  <select
                    value={editState.status}
                    onChange={e => setEditState(s => ({ ...s, status: e.target.value as OrderStatus }))}
                    className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {ORDER_STATUSES.map(st => (
                      <option key={st} value={st}>{t(`order.status_${st}`)}</option>
                    ))}
                  </select>
                  <textarea
                    value={editState.notes}
                    onChange={e => setEditState(s => ({ ...s, notes: e.target.value }))}
                    rows={2}
                    placeholder={t('order.notes_placeholder')}
                    className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none placeholder:text-gray-400"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit(o.id)}
                      disabled={saving}
                      className="flex items-center gap-1 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      <Check className="w-3 h-3" />{t('common.save')}
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="text-xs text-gray-500 dark:text-gray-400 hover:underline px-1.5 py-1.5"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              ) : confirmDeleteId === o.id ? (
                /* ── Confirm cancel row ── */
                <div className="px-3 py-2.5 flex items-center gap-2">
                  <p className={`text-red-600 dark:text-red-400 flex-1 truncate ${compact ? 'text-xs' : 'text-sm'}`}>
                    {t('order.confirm_cancel')}
                  </p>
                  <button
                    onClick={() => cancelOrder(o.id)}
                    disabled={deleting}
                    className="p-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                /* ── Read row ── */
                <div className="px-3 py-2.5 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium text-gray-800 dark:text-gray-200 truncate ${compact ? 'text-xs' : 'text-sm'}`}>
                      {o.product_name}
                    </p>
                    {!compact && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {o.product_price.toLocaleString()} MAD · {new Date(o.created_at).toLocaleDateString('fr-MA')}
                      </p>
                    )}
                    {compact && (
                      <p className="text-xs text-gray-400">{o.product_price.toLocaleString()} MAD</p>
                    )}
                  </div>
                  <OrderStatusBadge status={o.status} />
                  <button
                    onClick={() => startEdit(o)}
                    className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors shrink-0"
                    title={t('common.edit')}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {o.status !== 'cancelled' && o.status !== 'delivered' && o.status !== 'returned' && (
                    <button
                      onClick={() => setConfirmDeleteId(o.id)}
                      className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors shrink-0"
                      title={t('common.delete')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <OrderCreateModal
          onClose={() => setShowCreate(false)}
          onSuccess={load}
          prefillCustomer={prefillCustomer}
          defaultChannel={defaultChannel}
        />
      )}
    </div>
  )
}
