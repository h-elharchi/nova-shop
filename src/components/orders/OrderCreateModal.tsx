import { useState, useEffect, FormEvent } from 'react'
import { X, Search, User } from 'lucide-react'
import { useI18n } from '../../context/LanguageContext'
import { useCreateOrderAdmin, validateMoroccanPhone, normalizePhone } from '../../hooks/useOrders'
import { useCustomers } from '../../hooks/useCustomers'
import { MOROCCAN_CITIES } from '../../lib/moroccanCities'
import { supabase } from '../../lib/supabase'
import type { Product, OrderChannel } from '../../types'

type CustomerLike = { id: string; first_name: string; last_name: string; phone: string; email?: string | null }

const CHANNELS: OrderChannel[] = ['site', 'whatsapp', 'email', 'chat', 'phone']

const CHANNEL_ICONS: Record<OrderChannel, string> = {
  site: '🌐',
  whatsapp: '📱',
  email: '📧',
  chat: '💬',
  phone: '☎️',
}

interface Props {
  onClose: () => void
  onSuccess?: () => void
  prefillPhone?: string
  prefillCustomer?: Pick<CustomerLike, 'first_name' | 'last_name' | 'phone'>
  defaultChannel?: OrderChannel
}

const inputCls = 'w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition placeholder:text-gray-400 dark:placeholder:text-gray-500'

export function OrderCreateModal({ onClose, onSuccess, prefillPhone, prefillCustomer, defaultChannel = 'phone' }: Props) {
  const { t } = useI18n()
  const { createOrder, loading, error } = useCreateOrderAdmin()
  const { findByPhone } = useCustomers()

  const [channel, setChannel]         = useState<OrderChannel>(defaultChannel)
  const [phone, setPhone]             = useState(prefillPhone ?? prefillCustomer?.phone ?? '')
  const [firstName, setFirstName]     = useState(prefillCustomer?.first_name ?? '')
  const [lastName, setLastName]       = useState(prefillCustomer?.last_name ?? '')
  const [email, setEmail]             = useState('')
  const [city, setCity]               = useState('')
  const [address, setAddress]         = useState('')
  const [district, setDistrict]       = useState('')
  const [landmark, setLandmark]       = useState('')
  const [notes, setNotes]             = useState('')
  const [callbackAt, setCallbackAt]   = useState('')
  const [productId, setProductId]     = useState('')
  const [quantity, setQuantity]       = useState(1)
  const [products, setProducts]       = useState<Pick<Product, 'id' | 'name_fr' | 'price'>[]>([])
  const [foundCustomer, setFoundCustomer] = useState<CustomerLike | null>(null)
  const [phoneError, setPhoneError]   = useState('')
  const [success, setSuccess]         = useState(false)

  useEffect(() => {
    supabase
      .from('products')
      .select('id, name_fr, price')
      .eq('is_active', true)
      .order('name_fr')
      .then(({ data }) => setProducts((data ?? []) as typeof products))
  }, [])

  async function handlePhoneBlur() {
    if (!phone.trim()) return
    const normalized = normalizePhone(phone)
    if (!validateMoroccanPhone(normalized)) { setPhoneError(t('order.error_phone')); return }
    setPhoneError('')
    const customer = await findByPhone(normalized)
    setFoundCustomer(customer)
    if (customer) {
      setFirstName(customer.first_name)
      setLastName(customer.last_name)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!productId) return
    if (!validateMoroccanPhone(normalizePhone(phone))) { setPhoneError(t('order.error_phone')); return }
    setPhoneError('')

    const result = await createOrder({
      productId,
      quantity,
      channel,
      firstName,
      lastName,
      phone: normalizePhone(phone),
      email: email || undefined,
      deliveryCity: city || undefined,
      deliveryAddress: address || undefined,
      deliveryDistrict: district || undefined,
      deliveryLandmark: landmark || undefined,
      notes: notes || undefined,
      callbackAt: callbackAt || undefined,
    })

    if (result) {
      setSuccess(true)
      onSuccess?.()
      setTimeout(() => { setSuccess(false); onClose() }, 1500)
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-lg bg-white dark:bg-dark-card rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-dark-border sticky top-0 bg-white dark:bg-dark-card z-10">
          <h2 className="text-base font-bold text-gray-900 dark:text-white">{t('order.modal_create_title')}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {success && (
            <p className="text-center text-green-600 dark:text-green-400 text-sm font-medium py-4">
              {t('order.modal_success')}
            </p>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          {/* Canal */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('order.modal_channel')}</label>
            <div className="flex gap-2 flex-wrap">
              {CHANNELS.map(ch => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setChannel(ch)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    channel === ch
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {CHANNEL_ICONS[ch]} {t(`order.channel_${ch}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Téléphone + lookup client */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('order.modal_customer_phone')}</label>
            <div className="relative">
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onBlur={handlePhoneBlur}
                placeholder="06 12 34 56 78"
                dir="ltr"
                className={`${inputCls} pr-9`}
                required
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            {phoneError && <p className="text-red-500 text-xs mt-1">{phoneError}</p>}
            {foundCustomer && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                <User className="w-3 h-3" />
                {t('order.modal_customer_found')} : {foundCustomer.first_name} {foundCustomer.last_name}
              </p>
            )}
            {phone && !foundCustomer && !phoneError && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('order.modal_customer_new')}</p>
            )}
          </div>

          {/* Prénom / Nom */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('order.first_name')}</label>
              <input
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder={t('order.placeholder_first_name')}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('order.last_name')}</label>
              <input
                type="text"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder={t('order.placeholder_last_name')}
                className={inputCls}
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('order.email_optional')}</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('order.placeholder_email')} dir="ltr" className={inputCls} />
          </div>

          {/* Livraison */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">{t('order.delivery_section')}</p>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('order.delivery_city')}</label>
              <input type="text" value={city} onChange={e => setCity(e.target.value)} list="staff-cities-list" placeholder={t('order.placeholder_city')} className={inputCls} />
              <datalist id="staff-cities-list">
                {MOROCCAN_CITIES.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('order.delivery_address')}</label>
              <input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder={t('order.placeholder_address')} className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('order.delivery_district')}</label>
                <input type="text" value={district} onChange={e => setDistrict(e.target.value)} placeholder={t('order.placeholder_district')} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('order.delivery_landmark')}</label>
                <input type="text" value={landmark} onChange={e => setLandmark(e.target.value)} placeholder={t('order.placeholder_landmark')} className={inputCls} />
              </div>
            </div>
          </div>

          {/* Produit + Quantité */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('order.modal_product')}</label>
              <select
                value={productId}
                onChange={e => { setProductId(e.target.value); setQuantity(1) }}
                className={inputCls}
                required
              >
                <option value="">{t('order.modal_select_product')}</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name_fr} — {p.price.toLocaleString()} MAD</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0">{t('order.quantity')}</label>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  className="w-7 h-7 rounded-full border border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-bold transition-colors">−</button>
                <input
                  type="number"
                  min={1} max={99}
                  value={quantity}
                  onChange={e => setQuantity(Math.max(1, Math.min(99, parseInt(e.target.value) || 1)))}
                  className="w-14 text-center border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button type="button" onClick={() => setQuantity(q => Math.min(99, q + 1))}
                  className="w-7 h-7 rounded-full border border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-bold transition-colors">+</button>
              </div>
              {productId && quantity > 1 && (() => {
                const p = products.find(p => p.id === productId)
                return p ? (
                  <span className="text-sm font-bold text-blue-600 dark:text-blue-400 ml-auto">
                    {t('order.total')} : {(p.price * quantity).toLocaleString()} MAD
                  </span>
                ) : null
              })()}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('order.modal_notes')}</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className={`${inputCls} resize-none`}
            />
          </div>

          {/* Rappel (si canal callback) */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('order.modal_callback')}</label>
            <input
              type="datetime-local"
              value={callbackAt}
              onChange={e => setCallbackAt(e.target.value)}
              className={inputCls}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              {t('forms.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading || success}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors"
            >
              {loading ? t('order.modal_creating') : t('order.modal_create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
