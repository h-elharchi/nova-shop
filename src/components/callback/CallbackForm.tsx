import { useState } from 'react'
import { useI18n } from '../../context/LanguageContext'
import { supabase } from '../../lib/supabase'

interface CallbackFormProps {
  onSuccess?: () => void
  compact?: boolean
}

export function CallbackForm({ onSuccess, compact = false }: CallbackFormProps) {
  const { t, isRTL } = useI18n()
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    city: '',
    message: '',
    preferred_slot: 'asap' as 'asap' | 'scheduled',
    preferred_datetime: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({})

  function setField<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm(f => ({ ...f, [key]: value }))
    setErrors(e => ({ ...e, [key]: undefined }))
  }

  function validate() {
    const e: typeof errors = {}
    if (!form.first_name.trim()) e.first_name = t('callback.form_first_name')
    if (!form.phone.trim()) e.phone = t('callback.form_phone')
    return e
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    const e = validate()
    if (Object.keys(e).length > 0) { setErrors(e); return }

    setSubmitting(true)
    setStatus('idle')

    const { error } = await supabase.rpc('create_callback_request', {
      p_first_name:         form.first_name.trim(),
      p_last_name:          form.last_name.trim(),
      p_phone:              form.phone.trim(),
      p_email:              form.email.trim() || null,
      p_city:               form.city.trim() || null,
      p_message:            form.message.trim() || null,
      p_preferred_slot:     form.preferred_slot,
      p_preferred_datetime: form.preferred_slot === 'scheduled' && form.preferred_datetime
        ? new Date(form.preferred_datetime).toISOString()
        : null,
    })

    setSubmitting(false)
    if (error) {
      setStatus('error')
    } else {
      setStatus('success')
      onSuccess?.()
      setForm({ first_name: '', last_name: '', phone: '', email: '', city: '', message: '', preferred_slot: 'asap', preferred_datetime: '' })
    }
  }

  const inputClass = (hasError: boolean) =>
    `w-full border ${hasError ? 'border-red-400 dark:border-red-500' : 'border-gray-200 dark:border-gray-600'} bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400 transition`

  if (status === 'success') {
    return (
      <div className="text-center py-8 space-y-2">
        <div className="text-4xl">✅</div>
        <p className="font-semibold text-gray-900 dark:text-white">{t('callback.form_success')}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} dir={isRTL ? 'rtl' : 'ltr'}
      className={`space-y-4 ${compact ? 'text-sm' : ''}`}>

      <div className={`grid gap-3 ${compact ? 'grid-cols-1' : 'grid-cols-2'}`}>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">{t('callback.form_first_name')}</label>
          <input value={form.first_name} onChange={e => setField('first_name', e.target.value)}
            className={inputClass(!!errors.first_name)} placeholder={t('callback.form_first_name').replace(' *', '')} />
          {errors.first_name && <p className="text-xs text-red-500 mt-0.5">{errors.first_name}</p>}
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">{t('callback.form_last_name')}</label>
          <input value={form.last_name} onChange={e => setField('last_name', e.target.value)}
            className={inputClass(false)} placeholder={t('callback.form_last_name')} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">{t('callback.form_phone')}</label>
        <input type="tel" value={form.phone} onChange={e => setField('phone', e.target.value)}
          className={inputClass(!!errors.phone)} placeholder="+212 6XX XX XX XX" />
        {errors.phone && <p className="text-xs text-red-500 mt-0.5">{errors.phone}</p>}
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">{t('callback.form_email')}</label>
        <input type="email" value={form.email} onChange={e => setField('email', e.target.value)}
          className={inputClass(false)} placeholder="email@example.com" />
      </div>

      {!compact && (
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">{t('callback.form_city')}</label>
          <input value={form.city} onChange={e => setField('city', e.target.value)}
            className={inputClass(false)} placeholder={t('callback.form_city')} />
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">{t('callback.form_message')}</label>
        <textarea value={form.message} onChange={e => setField('message', e.target.value)}
          rows={3} className={inputClass(false)} placeholder={t('callback.form_message')} />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">{t('callback.form_slot')}</label>
        <div className="flex gap-3">
          {(['asap', 'scheduled'] as const).map(slot => (
            <label key={slot} className="flex items-center gap-2 text-sm cursor-pointer text-gray-700 dark:text-gray-300">
              <input type="radio" checked={form.preferred_slot === slot} onChange={() => setField('preferred_slot', slot)}
                className="accent-blue-600" />
              {t(`callback.slot_${slot}`)}
            </label>
          ))}
        </div>
      </div>

      {form.preferred_slot === 'scheduled' && (
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">{t('callback.form_datetime')}</label>
          <input type="datetime-local" value={form.preferred_datetime}
            onChange={e => setField('preferred_datetime', e.target.value)}
            min={new Date().toISOString().slice(0, 16)}
            className={inputClass(false)} />
        </div>
      )}

      {status === 'error' && (
        <p className="text-sm text-red-600 dark:text-red-400 text-center">{t('callback.form_error')}</p>
      )}

      <button type="submit" disabled={submitting}
        className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-xl transition-colors">
        {submitting ? t('callback.form_submitting') : t('callback.form_submit')}
      </button>
    </form>
  )
}
