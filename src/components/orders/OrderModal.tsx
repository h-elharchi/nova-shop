import { useState, useEffect, FormEvent } from 'react'
import { X, CheckCircle, ShoppingBag } from 'lucide-react'
import { useI18n } from '../../context/LanguageContext'
import { useCreateOrder, validateMoroccanPhone } from '../../hooks/useOrders'
import type { Product } from '../../types'

interface Props {
  product: Product
  onClose: () => void
}

const inputCls = (hasError: boolean) =>
  `w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 ${
    hasError
      ? 'border-red-400 dark:border-red-500'
      : 'border-gray-200 dark:border-gray-600'
  }`

export function OrderModal({ product, onClose }: Props) {
  const { t, lang, isRTL } = useI18n()
  const { createOrder, loading, success, error, reset } = useCreateOrder()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName]   = useState('')
  const [phone, setPhone]         = useState('')
  const [errors, setErrors] = useState<{ firstName?: string; lastName?: string; phone?: string }>({})

  const name = lang === 'ar' ? product.name_ar : product.name_fr
  const mainImage = product.images?.[0]?.image_url

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  function validate(): boolean {
    const errs: typeof errors = {}
    if (firstName.trim().length < 2) errs.firstName = t('order.error_first_name')
    if (lastName.trim().length < 2)  errs.lastName  = t('order.error_last_name')
    if (!validateMoroccanPhone(phone)) errs.phone   = t('order.error_phone')
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    await createOrder({ productId: product.id, firstName, lastName, phone })
  }

  const handleClose = () => { reset(); onClose() }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />

      {/* Panel */}
      <div
        dir={isRTL ? 'rtl' : 'ltr'}
        className="relative w-full sm:max-w-md bg-white dark:bg-dark-card rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[95vh] overflow-y-auto transition-colors duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-dark-border sticky top-0 bg-white dark:bg-dark-card rounded-t-2xl z-10">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t('order.title')}</h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {success ? (
            <div className="text-center py-8">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('order.success_title')}</h3>
              <p className="text-gray-500 dark:text-gray-400">{t('order.success_msg')}</p>
              <button
                onClick={handleClose}
                className="mt-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-xl transition-colors"
              >
                {t('forms.cancel')}
              </button>
            </div>
          ) : (
            <>
              {/* Product summary */}
              <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                {mainImage ? (
                  <img src={mainImage} alt={name} className="w-16 h-16 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center shrink-0">
                    <ShoppingBag className="w-7 h-7 text-gray-400 dark:text-gray-500" />
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{t('order.product_ordered')}</p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm leading-tight">{name}</p>
                  <p className="text-blue-600 dark:text-blue-400 font-bold text-sm mt-0.5">
                    {product.price.toLocaleString()} {t('common.mad')}
                  </p>
                </div>
              </div>

              {/* Global error */}
              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm px-3 py-2 rounded-lg">
                  {error}
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('order.first_name')}</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder={t('order.placeholder_first_name')}
                    className={inputCls(!!errors.firstName)}
                  />
                  {errors.firstName && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.firstName}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('order.last_name')}</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder={t('order.placeholder_last_name')}
                    className={inputCls(!!errors.lastName)}
                  />
                  {errors.lastName && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.lastName}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('order.phone')}</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder={t('order.placeholder_phone')}
                    className={inputCls(!!errors.phone)}
                    dir="ltr"
                  />
                  {errors.phone && <p className="text-red-500 dark:text-red-400 text-xs mt-1">{errors.phone}</p>}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-colors text-base"
                >
                  {loading ? t('order.saving') : t('order.submit')}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
