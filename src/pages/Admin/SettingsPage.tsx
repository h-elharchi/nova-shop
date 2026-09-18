import { useState, useEffect } from 'react'
import { useParams, useNavigate, NavLink } from 'react-router-dom'
import {
  Store, Mail, Sliders, PauseCircle, CheckSquare, MessageSquare,
  ShoppingBag, UserCheck, Bell, Plus, Trash2, Save,
  RefreshCw, CheckCircle, AlertCircle, AlertTriangle,
} from 'lucide-react'
import { AdminLayout } from './AdminLayout'
import { useI18n } from '../../context/LanguageContext'
import { supabase } from '../../lib/supabase'
import { useEmailAccounts } from '../../hooks/useEmailAccounts'
import { loadPauseReasons, loadDispositionCodes, loadQuickReplies } from '../../lib/chat'
import { purgeStaffUsers } from '../../lib/adminUsers'
import type { CrcPauseReason, CrcDispositionCode, CrcQuickReply } from '../../types/chat'

// ─── Sections configuration ───────────────────────────────────

type SectionKey = 'general' | 'email' | 'distribution' | 'pause' | 'qualification'
  | 'quick_replies' | 'orders' | 'customers' | 'notifications' | 'purge'

interface Section {
  key: SectionKey
  labelKey: string
  icon: React.ReactNode
}

const SECTIONS: Section[] = [
  { key: 'general',      labelKey: 'settings.general',      icon: <Store        className="w-4 h-4" /> },
  { key: 'email',        labelKey: 'settings.email',        icon: <Mail         className="w-4 h-4" /> },
  { key: 'distribution', labelKey: 'settings.distribution', icon: <Sliders      className="w-4 h-4" /> },
  { key: 'pause',        labelKey: 'settings.pause',        icon: <PauseCircle  className="w-4 h-4" /> },
  { key: 'qualification',labelKey: 'settings.qualification',icon: <CheckSquare  className="w-4 h-4" /> },
  { key: 'quick_replies',labelKey: 'settings.quick_replies',icon: <MessageSquare className="w-4 h-4" /> },
  { key: 'orders',       labelKey: 'settings.orders',       icon: <ShoppingBag  className="w-4 h-4" /> },
  { key: 'customers',    labelKey: 'settings.customers',    icon: <UserCheck    className="w-4 h-4" /> },
  { key: 'notifications',labelKey: 'settings.notifications',icon: <Bell         className="w-4 h-4" /> },
  { key: 'purge',        labelKey: 'settings.purge',        icon: <Trash2       className="w-4 h-4" /> },
]

// ─── Shared UI helpers ────────────────────────────────────────

const inputCls = 'w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-dark-surface text-gray-900 dark:text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

function SaveBar({ saving, saved, error, onSave }: {
  saving: boolean; saved: boolean; error: string | null; onSave: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-3 pt-2">
      <button
        onClick={onSave}
        disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors"
      >
        <Save className="w-4 h-4" />
        {saving ? '…' : t('crc.save')}
      </button>
      {saved  && <span className="text-sm text-green-600 dark:text-green-400">{t('crc.save_success')}</span>}
      {error  && <span className="text-sm text-red-500">{error}</span>}
    </div>
  )
}

// ─── Section : Général ────────────────────────────────────────

function GeneralSection() {
  const { t } = useI18n()
  const [vals, setVals]   = useState({ shop_name: '', contact_email: '', whatsapp_number: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    supabase.from('crc_settings').select('key,value')
      .in('key', ['shop_name', 'contact_email', 'whatsapp_number'])
      .then(({ data }) => {
        const map: Record<string, string> = {}
        ;(data ?? []).forEach((r: { key: string; value: unknown }) => { map[r.key] = String(r.value ?? '').replace(/^"|"$/g, '') })
        setVals(v => ({ ...v, ...map }))
        setLoading(false)
      })
  }, [])

  async function handleSave() {
    setSaving(true); setError(null)
    try {
      for (const [key, value] of Object.entries(vals)) {
        await supabase.from('crc_settings').upsert({ key, value: JSON.stringify(value) }, { onConflict: 'key' })
      }
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch { setError(t('crc.save_error')) }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-5 max-w-lg">
      <h2 className="font-semibold text-gray-900 dark:text-white text-base">{t('settings.general')}</h2>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('settings.shop_name')}</label>
        <input className={inputCls} value={vals.shop_name} onChange={e => setVals(v => ({ ...v, shop_name: e.target.value }))} placeholder="NOVA SHOP" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('settings.contact_email')}</label>
        <input className={inputCls} type="email" value={vals.contact_email} onChange={e => setVals(v => ({ ...v, contact_email: e.target.value }))} placeholder="contact@boutique.ma" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('settings.whatsapp')}</label>
        <input className={inputCls} type="tel" dir="ltr" value={vals.whatsapp_number} onChange={e => setVals(v => ({ ...v, whatsapp_number: e.target.value }))} placeholder="212600000000" />
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('settings.whatsapp_hint')}</p>
      </div>
      <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />
    </div>
  )
}

// ─── Section : Email (OAuth Gmail) ───────────────────────────

function EmailSection() {
  const { t } = useI18n()
  const { accounts, loading, syncing, syncMsg, refetch, connectGmail, disconnect, syncNow } = useEmailAccounts()
  const [label, setLabel]             = useState('')
  const [connecting, setConnecting]   = useState(false)
  const [connectErr, setConnectErr]   = useState<string | null>(null)
  const [oauthStatus, setOauthStatus] = useState<'success' | 'error' | null>(null)
  const [oauthAccount, setOauthAccount] = useState('')

  useEffect(() => {
    const hash  = window.location.hash
    const qIdx  = hash.indexOf('?')
    if (qIdx === -1) return
    const params    = new URLSearchParams(hash.slice(qIdx))
    const cleanHash = hash.slice(0, qIdx)
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
    setConnecting(true); setConnectErr(null)
    try {
      await connectGmail(label.trim())
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
    <div className="space-y-6 max-w-2xl">
      <h2 className="font-semibold text-gray-900 dark:text-white text-base">{t('settings.email')}</h2>

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

      <div className="bg-white dark:bg-dark-surface rounded-2xl border border-gray-100 dark:border-dark-border p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Plus className="w-4 h-4 text-blue-500" />{t('email.connect')}
        </h3>
        <div className="flex gap-3">
          <input type="text" value={label} onChange={e => setLabel(e.target.value)}
            placeholder={t('email.label_placeholder')}
            className="flex-1 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition placeholder:text-gray-400" />
          <button onClick={handleConnect} disabled={connecting || !label.trim()}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition-colors">
            <Mail className="w-4 h-4" />
            {connecting ? t('email.connecting') : t('email.connect')}
          </button>
        </div>
        {connectErr && <p className="text-red-500 dark:text-red-400 text-xs">{connectErr}</p>}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={syncNow} disabled={syncing || accounts.length === 0}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-xl bg-white dark:bg-dark-surface border border-gray-200 dark:border-dark-border text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors">
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? t('email.syncing') : t('email.sync')}
        </button>
        {syncMsg && <span className="text-xs text-gray-500 dark:text-gray-400">{syncMsg}</span>}
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><div className="w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">{t('email.no_accounts')}</p>
      ) : (
        <div className="space-y-3">
          {accounts.map(acc => (
            <div key={acc.id} className="bg-white dark:bg-dark-surface rounded-2xl border border-gray-100 dark:border-dark-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4 text-red-500 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{acc.label}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{acc.gmail_address}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{t('email.last_sync').replace('{date}', fmtDate(acc.last_sync_at))}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${acc.is_active ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                    {acc.is_active ? 'Actif' : t('email.account_inactive')}
                  </span>
                  <button onClick={() => { if (window.confirm(t('email.confirm_disconnect'))) disconnect(acc.id) }}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title={t('email.disconnect')}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-5 space-y-2">
        <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200">Configuration requise</h3>
        <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside">
          <li>Créez une application OAuth2 dans Google Cloud Console (APIs &amp; Services)</li>
          <li>Activez Gmail API</li>
          <li>Ajoutez l'URL de callback : <code className="bg-blue-100 dark:bg-blue-800 px-1 py-0.5 rounded">{'<SUPABASE_URL>'}/functions/v1/gmail-oauth-callback</code></li>
          <li>Ajoutez les secrets Edge Functions : <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, <code>SITE_URL</code></li>
        </ul>
      </div>
    </div>
  )
}

// ─── Section : Distribution ───────────────────────────────────

function DistributionSection() {
  const { t } = useI18n()
  const [settings, setSettings] = useState<Record<string, string | number | boolean>>({})
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const KEYS = [
    'max_conversations_per_agent',
    'wrap_up_timeout_seconds',
    'chat_accept_delay_seconds',
    'email_accept_delay_seconds',
    'callback_accept_delay_seconds',
    'default_chat_capacity',
    'default_email_capacity',
    'default_callback_capacity',
    'callback_max_attempts',
    'callback_reschedule_delay_minutes',
    'email_first_response_target_minutes',
  ]

  useEffect(() => {
    supabase.from('crc_settings').select('key,value').in('key', KEYS).then(({ data }) => {
      const map: Record<string, string | number | boolean> = {}
      ;(data ?? []).forEach((r: { key: string; value: unknown }) => { map[r.key] = r.value as string | number | boolean })
      setSettings(map)
      setLoading(false)
    })
  }, [])

  async function handleSave() {
    setSaving(true); setError(null)
    try {
      for (const [key, value] of Object.entries(settings)) {
        if (KEYS.includes(key)) await supabase.from('crc_settings').update({ value }).eq('key', key)
      }
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch { setError(t('crc.save_error')) } finally { setSaving(false) }
  }

  const set = (key: string, v: string | number | boolean) => setSettings(s => ({ ...s, [key]: v }))

  if (loading) return <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-5 max-w-lg">
      <h2 className="font-semibold text-gray-900 dark:text-white text-base">{t('settings.distribution')}</h2>

      <div className="grid grid-cols-2 gap-4">
        {[
          ['max_conversations_per_agent', t('crc.general_max_conv'), 1, 20],
          ['wrap_up_timeout_seconds',     t('crc.general_wrap_timeout'), 0, 600],
          ['chat_accept_delay_seconds',   t('settings.dist_accept_delay'), 5, 120],
          ['email_accept_delay_seconds',    t('settings.dist_accept_delay_email'), 5, 300],
          ['callback_accept_delay_seconds', t('settings.dist_accept_delay_callback'), 5, 300],
          ['default_chat_capacity',       t('settings.dist_chat_cap'), 1, 20],
          ['default_email_capacity',      t('settings.dist_email_cap'), 1, 30],
          ['default_callback_capacity',   t('settings.dist_callback_cap'), 1, 10],
          ['callback_max_attempts',       t('settings.dist_callback_attempts'), 1, 10],
          ['callback_reschedule_delay_minutes', t('settings.dist_reschedule_delay'), 5, 240],
          ['email_first_response_target_minutes', t('settings.dist_email_response'), 5, 480],
        ].map(([key, label, min, max]) => (
          <div key={key as string}>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{label as string}</label>
            <input type="number" min={min as number} max={max as number}
              value={Number(settings[key as string] ?? 0)}
              onChange={e => set(key as string, Number(e.target.value))}
              className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-dark-surface text-gray-900 dark:text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        ))}
      </div>

      <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />
    </div>
  )
}

// ─── Section : Motifs de pause ────────────────────────────────

function PauseSection() {
  const { t } = useI18n()
  const [items, setItems]   = useState<CrcPauseReason[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [nameFr, setNameFr]   = useState('')
  const [nameAr, setNameAr]   = useState('')
  const [saving, setSaving]   = useState(false)

  const load = () => loadPauseReasons().then(d => { setItems(d); setLoading(false) })
  useEffect(() => { load() }, [])

  const handleAdd = async () => {
    if (!nameFr.trim()) return
    setSaving(true)
    const order = items.length > 0 ? Math.max(...items.map(i => i.display_order)) + 1 : 1
    await supabase.from('crc_pause_reasons').insert({ name_fr: nameFr.trim(), name_ar: nameAr.trim() || nameFr.trim(), display_order: order })
    setNameFr(''); setNameAr(''); setShowAdd(false); setSaving(false); load()
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 dark:text-white text-base">{t('settings.pause')}</h2>
        <button onClick={() => setShowAdd(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors">
          <Plus className="w-4 h-4" />{t('crc.pause_add')}
        </button>
      </div>

      {showAdd && (
        <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl space-y-3">
          <input value={nameFr} onChange={e => setNameFr(e.target.value)} placeholder={t('crc.pause_name_fr')} className={inputCls} />
          <input value={nameAr} onChange={e => setNameAr(e.target.value)} placeholder={t('crc.pause_name_ar')} dir="rtl" className={inputCls} />
          <div className="flex gap-2">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 rounded-lg">{t('crc.cancel')}</button>
            <button onClick={handleAdd} disabled={!nameFr.trim() || saving} className="px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg">{saving ? '…' : t('crc.add')}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">{t('crc.pause_empty')}</p>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-colors ${item.is_active ? 'border-gray-200 dark:border-dark-border' : 'border-gray-100 dark:border-gray-700 opacity-60'}`}>
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-white">{item.name_fr}</div>
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5" dir="rtl">{item.name_ar}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={async () => { await supabase.from('crc_pause_reasons').update({ is_active: !item.is_active }).eq('id', item.id); load() }}
                  className={`text-xs px-2 py-1 rounded-lg transition-colors ${item.is_active ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                  {item.is_active ? t('crc.is_active') : 'Inactif'}
                </button>
                <button onClick={async () => { await supabase.from('crc_pause_reasons').delete().eq('id', item.id); load() }}
                  className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Section : Qualification ──────────────────────────────────

function QualificationSection() {
  const { t } = useI18n()
  const [items, setItems]   = useState<CrcDispositionCode[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [code, setCode]       = useState('')
  const [nameFr, setNameFr]   = useState('')
  const [nameAr, setNameAr]   = useState('')
  const [saving, setSaving]   = useState(false)

  const load = () => loadDispositionCodes().then(d => { setItems(d); setLoading(false) })
  useEffect(() => { load() }, [])

  const handleAdd = async () => {
    if (!code.trim() || !nameFr.trim()) return
    setSaving(true)
    const order = items.length > 0 ? Math.max(...items.map(i => i.display_order)) + 1 : 1
    await supabase.from('crc_disposition_codes').insert({ code: code.toUpperCase().trim(), name_fr: nameFr.trim(), name_ar: nameAr.trim() || nameFr.trim(), display_order: order })
    setCode(''); setNameFr(''); setNameAr(''); setShowAdd(false); setSaving(false); load()
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 dark:text-white text-base">{t('settings.qualification')}</h2>
        <button onClick={() => setShowAdd(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors">
          <Plus className="w-4 h-4" />{t('crc.disposition_add')}
        </button>
      </div>

      {showAdd && (
        <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl space-y-3">
          <input value={code} onChange={e => setCode(e.target.value)} placeholder={t('crc.disposition_code')} className={inputCls} />
          <input value={nameFr} onChange={e => setNameFr(e.target.value)} placeholder={t('crc.disposition_name_fr')} className={inputCls} />
          <input value={nameAr} onChange={e => setNameAr(e.target.value)} placeholder={t('crc.disposition_name_ar')} dir="rtl" className={inputCls} />
          <div className="flex gap-2">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 rounded-lg">{t('crc.cancel')}</button>
            <button onClick={handleAdd} disabled={!code.trim() || !nameFr.trim() || saving} className="px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg">{saving ? '…' : t('crc.add')}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">{t('crc.disposition_empty')}</p>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-colors ${item.is_active ? 'border-gray-200 dark:border-dark-border' : 'border-gray-100 dark:border-gray-700 opacity-60'}`}>
              <div className="min-w-0 flex items-center gap-3">
                <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 shrink-0">[{item.code}]</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.name_fr}</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500" dir="rtl">{item.name_ar}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={async () => { await supabase.from('crc_disposition_codes').update({ is_active: !item.is_active }).eq('id', item.id); load() }}
                  className={`text-xs px-2 py-1 rounded-lg transition-colors ${item.is_active ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                  {item.is_active ? t('crc.is_active') : 'Inactif'}
                </button>
                <button onClick={async () => { await supabase.from('crc_disposition_codes').delete().eq('id', item.id); load() }}
                  className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Section : Réponses rapides ───────────────────────────────

function QuickRepliesSection() {
  const { t } = useI18n()
  const [items, setItems]   = useState<CrcQuickReply[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ title_fr: '', title_ar: '', message_fr: '', message_ar: '', shortcut: '' })
  const [saving, setSaving] = useState(false)

  const load = () => loadQuickReplies().then(d => { setItems(d); setLoading(false) })
  useEffect(() => { load() }, [])

  const handleAdd = async () => {
    if (!form.title_fr.trim() || !form.message_fr.trim()) return
    setSaving(true)
    const order = items.length > 0 ? Math.max(...items.map(i => i.display_order)) + 1 : 1
    await supabase.from('crc_quick_replies').insert({
      title_fr: form.title_fr.trim(), title_ar: form.title_ar.trim() || form.title_fr.trim(),
      message_fr: form.message_fr.trim(), message_ar: form.message_ar.trim() || form.message_fr.trim(),
      shortcut: form.shortcut.trim() || null, display_order: order,
    })
    setForm({ title_fr: '', title_ar: '', message_fr: '', message_ar: '', shortcut: '' })
    setShowAdd(false); setSaving(false); load()
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 dark:text-white text-base">{t('settings.quick_replies')}</h2>
        <button onClick={() => setShowAdd(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors">
          <Plus className="w-4 h-4" />{t('crc.qr_add')}
        </button>
      </div>

      {showAdd && (
        <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input value={form.title_fr} onChange={e => setForm(f => ({ ...f, title_fr: e.target.value }))} placeholder={t('crc.qr_title_fr')} className={inputCls} />
            <input value={form.title_ar} onChange={e => setForm(f => ({ ...f, title_ar: e.target.value }))} placeholder={t('crc.qr_title_ar')} dir="rtl" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <textarea value={form.message_fr} onChange={e => setForm(f => ({ ...f, message_fr: e.target.value }))} rows={3} placeholder={t('crc.qr_message_fr')} className={`${inputCls} resize-none`} />
            <textarea value={form.message_ar} onChange={e => setForm(f => ({ ...f, message_ar: e.target.value }))} rows={3} dir="rtl" placeholder={t('crc.qr_message_ar')} className={`${inputCls} resize-none`} />
          </div>
          <input value={form.shortcut} onChange={e => setForm(f => ({ ...f, shortcut: e.target.value }))} placeholder={t('crc.qr_shortcut')} className={inputCls} />
          <div className="flex gap-2">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 rounded-lg">{t('crc.cancel')}</button>
            <button onClick={handleAdd} disabled={!form.title_fr.trim() || !form.message_fr.trim() || saving} className="px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg">{saving ? '…' : t('crc.add')}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">{t('crc.qr_empty')}</p>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className={`flex items-start justify-between gap-3 px-4 py-3 rounded-xl border ${item.is_active ? 'border-gray-200 dark:border-dark-border' : 'border-gray-100 dark:border-gray-700 opacity-60'}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{item.title_fr}</span>
                  {item.shortcut && <span className="text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded">/{item.shortcut}</span>}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{item.message_fr}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 mt-0.5">
                <button onClick={async () => { await supabase.from('crc_quick_replies').update({ is_active: !item.is_active }).eq('id', item.id); load() }}
                  className={`text-xs px-2 py-1 rounded-lg transition-colors ${item.is_active ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                  {item.is_active ? t('crc.is_active') : 'Inactif'}
                </button>
                <button onClick={async () => { await supabase.from('crc_quick_replies').delete().eq('id', item.id); load() }}
                  className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Section : Commandes ──────────────────────────────────────

function OrdersSection() {
  const { t } = useI18n()
  return (
    <div className="space-y-4 max-w-lg">
      <h2 className="font-semibold text-gray-900 dark:text-white text-base">{t('settings.orders')}</h2>
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-5 space-y-2">
        <p className="text-sm text-blue-800 dark:text-blue-200 font-medium">{t('settings.orders_info_title')}</p>
        <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside">
          <li>{t('settings.orders_info_phone')}</li>
          <li>{t('settings.orders_info_city')}</li>
          <li>{t('settings.orders_info_address')}</li>
        </ul>
      </div>
    </div>
  )
}

// ─── Section : Clients ────────────────────────────────────────

function CustomersSection() {
  const { t } = useI18n()
  const [allow, setAllow]   = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    supabase.from('crc_settings').select('value').eq('key', 'allow_agent_delete_customers').single()
      .then(({ data }) => {
        setAllow(Boolean(data?.value))
        setLoading(false)
      })
  }, [])

  async function handleSave() {
    setSaving(true); setError(null)
    try {
      await supabase.from('crc_settings').update({ value: allow }).eq('key', 'allow_agent_delete_customers')
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch { setError(t('crc.save_error')) } finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-5 max-w-lg">
      <h2 className="font-semibold text-gray-900 dark:text-white text-base">{t('settings.customers')}</h2>
      <div className="flex items-center justify-between gap-4 bg-white dark:bg-dark-surface rounded-2xl border border-gray-100 dark:border-dark-border p-4">
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">{t('settings.allow_agent_delete')}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('settings.allow_agent_delete_hint')}</p>
        </div>
        <Toggle checked={allow} onChange={setAllow} />
      </div>
      <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />
    </div>
  )
}

// ─── Section : Notifications ──────────────────────────────────

function NotificationsSection() {
  const { t } = useI18n()
  const [settings, setSettings] = useState<Record<string, boolean>>({ notification_sound_enabled: false, notification_browser_enabled: false })
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const KEYS = ['notification_sound_enabled', 'notification_browser_enabled']

  useEffect(() => {
    supabase.from('crc_settings').select('key,value').in('key', KEYS).then(({ data }) => {
      const map: Record<string, boolean> = {}
      ;(data ?? []).forEach((r: { key: string; value: unknown }) => { map[r.key] = Boolean(r.value) })
      setSettings(s => ({ ...s, ...map }))
      setLoading(false)
    })
  }, [])

  async function handleSave() {
    setSaving(true); setError(null)
    try {
      for (const [key, value] of Object.entries(settings)) {
        if (KEYS.includes(key)) await supabase.from('crc_settings').update({ value }).eq('key', key)
      }
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch { setError(t('crc.save_error')) } finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-5 max-w-lg">
      <h2 className="font-semibold text-gray-900 dark:text-white text-base">{t('settings.notifications')}</h2>
      <div className="space-y-3">
        {[
          ['notification_sound_enabled',   t('crc.general_notif_sound')],
          ['notification_browser_enabled', t('crc.general_notif_browser')],
        ].map(([key, label]) => (
          <div key={key} className="flex items-center justify-between gap-4 bg-white dark:bg-dark-surface rounded-2xl border border-gray-100 dark:border-dark-border p-4">
            <span className="text-sm font-medium text-gray-900 dark:text-white">{label}</span>
            <Toggle checked={Boolean(settings[key])} onChange={v => setSettings(s => ({ ...s, [key]: v }))} />
          </div>
        ))}
      </div>
      <SaveBar saving={saving} saved={saved} error={error} onSave={handleSave} />
    </div>
  )
}

// ─── Section : Purge ──────────────────────────────────────────

type PurgeCategory = 'history' | 'active' | 'customers' | 'orders' | 'products' | 'agents' | 'admins'

const PURGE_CATEGORIES: { key: PurgeCategory; labelKey: string }[] = [
  { key: 'history',   labelKey: 'settings.purge_cat_history' },
  { key: 'active',    labelKey: 'settings.purge_cat_active' },
  { key: 'customers', labelKey: 'settings.purge_cat_customers' },
  { key: 'orders',    labelKey: 'settings.purge_cat_orders' },
  { key: 'products',  labelKey: 'settings.purge_cat_products' },
  { key: 'agents',    labelKey: 'settings.purge_cat_agents' },
  { key: 'admins',    labelKey: 'settings.purge_cat_admins' },
]

const EMPTY_PURGE_SELECTION: Record<PurgeCategory, boolean> = {
  history: false, active: false, customers: false, orders: false, products: false, agents: false, admins: false,
}

function PurgeSection() {
  const { t } = useI18n()
  const [retentionDays, setRetentionDays] = useState(90)
  const [selected, setSelected] = useState<Record<PurgeCategory, boolean>>(EMPTY_PURGE_SELECTION)
  const [showConfirm, setShowConfirm] = useState(false)
  const [confirmChecked, setConfirmChecked] = useState(false)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Record<string, number> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const anySelected = Object.values(selected).some(Boolean)

  function toggle(key: PurgeCategory) {
    setResult(null)
    setSelected(s => ({ ...s, [key]: !s[key] }))
  }

  async function handlePurge() {
    setRunning(true); setError(null)
    const counts: Record<string, number> = {}
    try {
      if (selected.history || selected.active || selected.customers || selected.orders || selected.products) {
        const { data, error: err } = await supabase.rpc('purge_data', {
          p_retention_days:  retentionDays,
          p_purge_history:   selected.history,
          p_purge_active:    selected.active,
          p_purge_customers: selected.customers,
          p_purge_orders:    selected.orders,
          p_purge_products:  selected.products,
        })
        if (err) throw err
        Object.assign(counts, data as Record<string, number>)
      }
      if (selected.agents) {
        const { deleted } = await purgeStaffUsers('agent', retentionDays)
        counts.agents = deleted
      }
      if (selected.admins) {
        const { deleted } = await purgeStaffUsers('admin', retentionDays)
        counts.admins = deleted
      }
      setResult(counts)
      setSelected(EMPTY_PURGE_SELECTION)
    } catch (err) {
      // Les erreurs Postgrest/RPC sont des objets simples { message, code, ... },
      // pas des instances de Error — extraire .message directement plutôt que
      // de dépendre de `instanceof Error`, sinon le message réel est masqué.
      const message = (err as { message?: string } | null)?.message
      setError(message || t('settings.purge_error'))
    } finally {
      setRunning(false)
      setShowConfirm(false)
      setConfirmChecked(false)
    }
  }

  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h2 className="font-semibold text-gray-900 dark:text-white text-base">{t('settings.purge')}</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('settings.purge_hint')}</p>
      </div>

      <div className="bg-white dark:bg-dark-surface rounded-2xl border border-gray-100 dark:border-dark-border p-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t('settings.purge_retention')}</label>
          <div className="flex items-center gap-2">
            <input type="number" min={0} value={retentionDays}
              onChange={e => setRetentionDays(Math.max(0, Number(e.target.value)))}
              className="w-28 border border-gray-200 dark:border-gray-600 bg-white dark:bg-dark-surface text-gray-900 dark:text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <span className="text-sm text-gray-500 dark:text-gray-400">{t('settings.purge_days')}</span>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('settings.purge_retention_hint')}</p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-300">{t('settings.purge_categories')}</p>
          {PURGE_CATEGORIES.map(c => (
            <label key={c.key} className="flex items-center justify-between gap-4 px-3 py-2.5 rounded-xl border border-gray-100 dark:border-dark-border cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30">
              <span className="text-sm text-gray-700 dark:text-gray-300">{t(c.labelKey as Parameters<typeof t>[0])}</span>
              <Toggle checked={selected[c.key]} onChange={() => toggle(c.key)} />
            </label>
          ))}
          {selected.admins && (
            <p className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />{t('settings.purge_admins_self_hint')}
            </p>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {result && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900/40 rounded-2xl p-4 space-y-1">
          <p className="text-sm font-medium text-green-700 dark:text-green-400">{t('settings.purge_success')}</p>
          {Object.entries(result).map(([k, v]) => (
            <p key={k} className="text-xs text-green-600 dark:text-green-400">{k} : {v}</p>
          ))}
        </div>
      )}

      <button
        onClick={() => setShowConfirm(true)}
        disabled={!anySelected}
        className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-xl transition-colors"
      >
        <Trash2 className="w-4 h-4" />
        {t('settings.purge_btn')}
      </button>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-dark-card rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center gap-2 mb-3 text-red-600 dark:text-red-400">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-semibold">{t('settings.purge_confirm_title')}</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              {t('settings.purge_confirm_body').replace('{days}', String(retentionDays))}
            </p>
            <ul className="text-xs text-gray-500 dark:text-gray-400 mb-4 space-y-0.5 list-disc list-inside">
              {PURGE_CATEGORIES.filter(c => selected[c.key]).map(c => (
                <li key={c.key}>{t(c.labelKey as Parameters<typeof t>[0])}</li>
              ))}
            </ul>
            <label className="flex items-start gap-2 mb-4 cursor-pointer">
              <input type="checkbox" checked={confirmChecked} onChange={e => setConfirmChecked(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-red-600 rounded" />
              <span className="text-xs text-gray-600 dark:text-gray-400">{t('settings.purge_confirm_checkbox')}</span>
            </label>
            <div className="flex gap-2">
              <button onClick={() => { setShowConfirm(false); setConfirmChecked(false) }}
                className="flex-1 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 rounded-xl transition-colors">
                {t('forms.cancel')}
              </button>
              <button onClick={handlePurge} disabled={!confirmChecked || running}
                className="flex-1 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-xl transition-colors">
                {running ? '…' : t('settings.purge_confirm_submit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Section router ───────────────────────────────────────────

function SectionContent({ section }: { section: SectionKey }) {
  switch (section) {
    case 'general':       return <GeneralSection />
    case 'email':         return <EmailSection />
    case 'distribution':  return <DistributionSection />
    case 'pause':         return <PauseSection />
    case 'qualification': return <QualificationSection />
    case 'quick_replies': return <QuickRepliesSection />
    case 'orders':        return <OrdersSection />
    case 'customers':     return <CustomersSection />
    case 'notifications': return <NotificationsSection />
    case 'purge':         return <PurgeSection />
  }
}

// ─── Main page ────────────────────────────────────────────────

export function SettingsPage() {
  const { t } = useI18n()
  const { section = 'general' } = useParams<{ section: string }>()
  const navigate = useNavigate()
  const validSection = SECTIONS.some(s => s.key === section) ? (section as SectionKey) : 'general'

  useEffect(() => {
    if (!SECTIONS.some(s => s.key === section)) {
      navigate('/admin/settings/general', { replace: true })
    }
  }, [section, navigate])

  return (
    <AdminLayout>
      <div className="max-w-5xl">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">{t('admin.settings')}</h1>

        <div className="flex gap-6">
          {/* Nav latérale */}
          <aside className="w-52 shrink-0">
            <nav className="space-y-0.5">
              {SECTIONS.map(s => (
                <NavLink
                  key={s.key}
                  to={`/admin/settings/${s.key}`}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                    }`
                  }
                >
                  {s.icon}
                  {t(s.labelKey as Parameters<typeof t>[0])}
                </NavLink>
              ))}
            </nav>
          </aside>

          {/* Contenu de la section */}
          <div className="flex-1 min-w-0">
            <SectionContent section={validSection} />
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
