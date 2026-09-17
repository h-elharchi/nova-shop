import { useState } from 'react'
import { useI18n } from '../../context/LanguageContext'
import type { CustomerFormData } from '../../hooks/useChat'

interface ChatCustomerFormProps {
  onSubmit: (data: CustomerFormData) => Promise<string | null>
  loading?: boolean
}

export function ChatCustomerForm({ onSubmit, loading = false }: ChatCustomerFormProps) {
  const { t, isRTL } = useI18n()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<CustomerFormData & { submit: string }>>({})

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFieldErrors({})
    const errorKey = await onSubmit({ firstName, lastName, phone, email: email.trim() || undefined })
    if (errorKey) {
      if (errorKey === 'chat.error_name') setFieldErrors({ firstName: t(errorKey) })
      else if (errorKey === 'chat.error_lastname') setFieldErrors({ lastName: t(errorKey) })
      else if (errorKey === 'chat.error_phone') setFieldErrors({ phone: t(errorKey) })
      else setFieldErrors({ submit: t(errorKey) })
    }
  }

  /*
   * text-base (16px) sur mobile pour éviter le zoom automatique iOS Safari.
   * text-sm (14px) sur desktop où le zoom n'est pas un problème.
   */
  const inputClass = (hasError: boolean) =>
    `w-full px-3 py-2.5 text-base sm:text-sm rounded-xl border ${
      hasError
        ? 'border-red-400 dark:border-red-500'
        : 'border-gray-200 dark:border-dark-border'
    } bg-gray-50 dark:bg-dark-card text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors`

  return (
    /*
     * overflow-y-auto : le formulaire défile quand le clavier virtuel est ouvert.
     * Le conteneur parent (ChatWidget) doit être overflow-hidden pour que ce scroll
     * reste isolé dans la zone du formulaire.
     */
    <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col justify-center p-4 min-h-full">
        <div className="mb-5 text-center">
          <div className="text-3xl mb-2">👋</div>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            {isRTL
              ? 'أدخل معلوماتك لبدء المحادثة مع أحد مستشارينا'
              : 'Renseignez vos informations pour démarrer la conversation avec un conseiller.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3" dir={isRTL ? 'rtl' : 'ltr'}>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('chat.first_name')} *
            </label>
            <input
              type="text"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              placeholder={t('chat.placeholder_first_name')}
              disabled={loading}
              autoComplete="given-name"
              className={inputClass(!!fieldErrors.firstName)}
            />
            {fieldErrors.firstName && (
              <p className="mt-1 text-xs text-red-500">{fieldErrors.firstName}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('chat.last_name')} *
            </label>
            <input
              type="text"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              placeholder={t('chat.placeholder_last_name')}
              disabled={loading}
              autoComplete="family-name"
              className={inputClass(!!fieldErrors.lastName)}
            />
            {fieldErrors.lastName && (
              <p className="mt-1 text-xs text-red-500">{fieldErrors.lastName}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('chat.phone')} *
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder={t('chat.placeholder_phone')}
              disabled={loading}
              autoComplete="tel"
              inputMode="tel"
              className={inputClass(!!fieldErrors.phone)}
            />
            {fieldErrors.phone && (
              <p className="mt-1 text-xs text-red-500">{fieldErrors.phone}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('callback.form_email')}
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="email@example.com"
              disabled={loading}
              autoComplete="email"
              inputMode="email"
              className={inputClass(false)}
            />
          </div>

          {fieldErrors.submit && (
            <p className="text-xs text-red-500 text-center">{fieldErrors.submit}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 sm:py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-colors mt-2"
          >
            {loading
              ? (isRTL ? 'جارٍ...' : 'Chargement...')
              : t('chat.start_chat')}
          </button>
        </form>

        {/* Espace sécurisé iOS en bas (home indicator) */}
        <div style={{ height: 'env(safe-area-inset-bottom)' }} />
      </div>
    </div>
  )
}
