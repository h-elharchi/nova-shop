import { useState, useEffect } from 'react'
import { Mail, Plus, RefreshCw, Trash2, CheckCircle, AlertCircle } from 'lucide-react'
import { AdminLayout } from './AdminLayout'
import { useEmailAccounts } from '../../hooks/useEmailAccounts'
import { useI18n } from '../../context/LanguageContext'

export function EmailSettingsPage() {
  const { t } = useI18n()
  const { accounts, loading, syncing, syncMsg, refetch, connectGmail, disconnect, syncNow } = useEmailAccounts()

  const [label, setLabel]             = useState('')
  const [connecting, setConnecting]   = useState(false)
  const [connectErr, setConnectErr]   = useState<string | null>(null)
  const [oauthStatus, setOauthStatus] = useState<'success' | 'error' | null>(null)
  const [oauthAccount, setOauthAccount] = useState('')

  // Détecter le retour du flux OAuth
  // HashRouter : les params sont dans window.location.hash (ex: #/admin/email-settings?oauth_success=1)
  useEffect(() => {
    const hash = window.location.hash           // "#/admin/email-settings?oauth_success=1&account=..."
    const qIdx = hash.indexOf('?')
    if (qIdx === -1) return

    const params   = new URLSearchParams(hash.slice(qIdx))
    const cleanHash = hash.slice(0, qIdx)       // "#/admin/email-settings"

    if (params.get('oauth_success')) {
      setOauthStatus('success')
      setOauthAccount(params.get('account') ?? '')
      window.history.replaceState({}, '', window.location.pathname + cleanHash)
      refetch()
    } else if (params.get('oauth_error')) {
      setOauthStatus('error')
      window.history.replaceState({}, '', window.location.pathname + cleanHash)
    }
  }, [refetch])

  async function handleConnect() {
    if (!label.trim()) return
    setConnecting(true)
    setConnectErr(null)
    try {
      await connectGmail(label.trim())
      // La page sera redirigée vers Google — si on arrive ici, c'est une erreur
    } catch (err) {
      setConnectErr(err instanceof Error ? err.message : t('email.account_error'))
      setConnecting(false)
    }
  }

  function fmtDate(iso: string | null): string {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('fr-MA', { dateStyle: 'short', timeStyle: 'short' })
  }

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('email.settings_title')}</h1>

        {/* Statut OAuth */}
        {oauthStatus === 'success' && (
          <div className="flex items-center gap-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 rounded-xl px-4 py-3 text-sm">
            <CheckCircle className="w-4 h-4 shrink-0" />
            {t('email.account_connected')} {oauthAccount && `(${oauthAccount})`}
          </div>
        )}
        {oauthStatus === 'error' && (
          <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl px-4 py-3 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {t('email.account_error')}
          </div>
        )}

        {/* Connecter un compte */}
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-dark-border p-5 space-y-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Plus className="w-4 h-4 text-blue-500" />
            {t('email.connect')}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Saisissez un libellé pour identifier ce compte, puis cliquez sur "Connecter" pour autoriser l'accès Gmail via Google OAuth2.
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder={t('email.label_placeholder')}
              className="flex-1 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition placeholder:text-gray-400"
            />
            <button
              onClick={handleConnect}
              disabled={connecting || !label.trim()}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors"
            >
              <Mail className="w-4 h-4" />
              {connecting ? t('email.connecting') : t('email.connect')}
            </button>
          </div>
          {connectErr && <p className="text-red-500 dark:text-red-400 text-xs">{connectErr}</p>}
        </div>

        {/* Actions globales */}
        <div className="flex items-center gap-3">
          <button
            onClick={syncNow}
            disabled={syncing || accounts.length === 0}
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-xl bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? t('email.syncing') : t('email.sync')}
          </button>
          {syncMsg && <span className="text-xs text-gray-500 dark:text-gray-400">{syncMsg}</span>}
        </div>

        {/* Liste des comptes */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : accounts.length === 0 ? (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">{t('email.no_accounts')}</div>
        ) : (
          <div className="space-y-3">
            {accounts.map(acc => (
              <div key={acc.id} className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-dark-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                      <Mail className="w-4 h-4 text-red-500 dark:text-red-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{acc.label}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{acc.gmail_address}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {t('email.last_sync').replace('{date}', fmtDate(acc.last_sync_at))}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      acc.is_active
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                    }`}>
                      {acc.is_active ? 'Actif' : t('email.account_inactive')}
                    </span>
                    <button
                      onClick={() => {
                        if (window.confirm(t('email.confirm_disconnect'))) disconnect(acc.id)
                      }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      title={t('email.disconnect')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Instructions */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-5 space-y-2">
          <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200">Configuration requise</h3>
          <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside">
            <li>Créez une application OAuth2 dans Google Cloud Console (APIs & Services)</li>
            <li>Activez Gmail API</li>
            <li>Ajoutez l'URL de callback : <code className="bg-blue-100 dark:bg-blue-800 px-1 py-0.5 rounded">{'<SUPABASE_URL>'}/functions/v1/gmail-oauth-callback</code></li>
            <li>Ajoutez les secrets Edge Functions : <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, <code>SITE_URL</code></li>
          </ul>
        </div>
      </div>
    </AdminLayout>
  )
}
