import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingBag, Lock, CheckCircle, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useI18n } from '../context/LanguageContext'
import { useThemeCtx } from '../context/ThemeContext'

export function SetPasswordPage() {
  const { t } = useI18n()
  const { isDark } = useThemeCtx()
  const navigate = useNavigate()

  const [hasSession, setHasSession] = useState<boolean | null>(null)
  const [pwd, setPwd]               = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [success, setSuccess]       = useState(false)

  useEffect(() => {
    // index.html captures Supabase auth hash fragments into sessionStorage before
    // HashRouter can clear them. We read them here and call setSession manually.
    let storedAuth: string | null = null
    try { storedAuth = sessionStorage.getItem('_nova_auth') } catch {}

    if (storedAuth) {
      try { sessionStorage.removeItem('_nova_auth') } catch {}
      const params = new URLSearchParams(storedAuth)
      const accessToken  = params.get('access_token')
      const refreshToken = params.get('refresh_token')
      if (accessToken && refreshToken) {
        supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(({ error }) => setHasSession(!error))
      } else {
        setHasSession(false)
      }
      return
    }

    // Fallback: session déjà présente (ex. rechargement de page)
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') {
        setHasSession(!!session)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (pwd.length < 8) {
      setError(t('set_password.error_length'))
      return
    }
    if (pwd !== confirmPwd) {
      setError(t('set_password.error_match'))
      return
    }

    setSaving(true)
    const { error: updateError } = await supabase.auth.updateUser({ password: pwd })
    setSaving(false)

    if (updateError) {
      setError(updateError.message)
    } else {
      setSuccess(true)
      // Déconnexion propre puis redirection vers login
      setTimeout(async () => {
        await supabase.auth.signOut()
        navigate('/admin/login', { replace: true })
      }, 2000)
    }
  }

  const inputCls = 'w-full px-4 py-3 text-sm rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors'

  return (
    <div className={`min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-bg px-4 transition-colors duration-200 ${isDark ? 'dark' : ''}`}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mb-4">
            <ShoppingBag className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('set_password.title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center mt-1">{t('set_password.subtitle')}</p>
        </div>

        <div className="bg-white dark:bg-dark-surface rounded-2xl border border-gray-100 dark:border-dark-border p-6 shadow-sm">
          {hasSession === null && (
            <div className="flex justify-center py-4">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {hasSession === false && (
            <div className="flex items-center gap-2 text-sm text-red-500 dark:text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {t('set_password.error_session')}
            </div>
          )}

          {hasSession === true && !success && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                  {t('set_password.password')}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    minLength={8}
                    value={pwd}
                    onChange={e => setPwd(e.target.value)}
                    className={`${inputCls} pl-10`}
                    placeholder="••••••••"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                  {t('set_password.confirm')}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    minLength={8}
                    value={confirmPwd}
                    onChange={e => setConfirmPwd(e.target.value)}
                    className={`${inputCls} pl-10`}
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-500 dark:text-red-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors"
              >
                {saving ? '...' : t('set_password.submit')}
              </button>
            </form>
          )}

          {success && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle className="w-10 h-10 text-green-500" />
              <p className="text-sm text-gray-700 dark:text-gray-300">{t('set_password.success')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
