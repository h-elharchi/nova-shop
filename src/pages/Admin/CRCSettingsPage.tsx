import { useState, useEffect } from 'react'
import { Plus, Trash2, Save, Settings } from 'lucide-react'
import { AdminLayout } from './AdminLayout'
import { useI18n } from '../../context/LanguageContext'
import { supabase } from '../../lib/supabase'
import { loadPauseReasons, loadDispositionCodes, loadQuickReplies } from '../../lib/chat'
import type { CrcPauseReason, CrcDispositionCode, CrcQuickReply, CrcSetting } from '../../types/chat'

type CrcTab = 'pause' | 'dispositions' | 'quick_replies' | 'general'

export function CRCSettingsPage() {
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState<CrcTab>('pause')

  const tabClass = (tab: CrcTab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      activeTab === tab
        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
    }`

  return (
    <AdminLayout>
      <div className="max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <Settings className="w-6 h-6 text-gray-500 dark:text-gray-400" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('crc.title')}</h1>
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          <button className={tabClass('pause')} onClick={() => setActiveTab('pause')}>
            {t('crc.nav_pause')}
          </button>
          <button className={tabClass('dispositions')} onClick={() => setActiveTab('dispositions')}>
            {t('crc.nav_dispositions')}
          </button>
          <button className={tabClass('quick_replies')} onClick={() => setActiveTab('quick_replies')}>
            {t('crc.nav_quick_replies')}
          </button>
          <button className={tabClass('general')} onClick={() => setActiveTab('general')}>
            {t('crc.nav_general')}
          </button>
        </div>

        {activeTab === 'pause'        && <PauseReasonsTab />}
        {activeTab === 'dispositions' && <DispositionsTab />}
        {activeTab === 'quick_replies' && <QuickRepliesTab />}
        {activeTab === 'general'      && <GeneralTab />}
      </div>
    </AdminLayout>
  )
}

// ── Pause Reasons ─────────────────────────────────────────────────────────────

function PauseReasonsTab() {
  const { t } = useI18n()
  const [items, setItems]   = useState<CrcPauseReason[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [nameFr, setNameFr] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => loadPauseReasons().then(data => { setItems(data); setLoading(false) })
  useEffect(() => { load() }, [])

  const handleAdd = async () => {
    if (!nameFr.trim()) return
    setSaving(true)
    const order = items.length > 0 ? Math.max(...items.map(i => i.display_order)) + 1 : 1
    await supabase.from('crc_pause_reasons').insert({ name_fr: nameFr.trim(), name_ar: nameAr.trim() || nameFr.trim(), display_order: order })
    setNameFr(''); setNameAr(''); setShowAdd(false); setSaving(false)
    load()
  }

  const handleToggle = async (item: CrcPauseReason) => {
    await supabase.from('crc_pause_reasons').update({ is_active: !item.is_active }).eq('id', item.id)
    load()
  }

  const handleDelete = async (id: string) => {
    await supabase.from('crc_pause_reasons').delete().eq('id', id)
    load()
  }

  return (
    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-gray-100 dark:border-dark-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900 dark:text-white">{t('crc.nav_pause')}</h2>
        <button onClick={() => setShowAdd(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors">
          <Plus className="w-4 h-4" />{t('crc.pause_add')}
        </button>
      </div>

      {showAdd && (
        <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl space-y-3">
          <input value={nameFr} onChange={e => setNameFr(e.target.value)} placeholder={t('crc.pause_name_fr')}
            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input value={nameAr} onChange={e => setNameAr(e.target.value)} placeholder={t('crc.pause_name_ar')} dir="rtl"
            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="flex gap-2">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-lg transition-colors">{t('crc.cancel')}</button>
            <button onClick={handleAdd} disabled={!nameFr.trim() || saving} className="px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors">{saving ? '…' : t('crc.add')}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
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
                <button onClick={() => handleToggle(item)} className={`text-xs px-2 py-1 rounded-lg transition-colors ${item.is_active ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                  {item.is_active ? t('crc.is_active') : 'Inactif'}
                </button>
                <button onClick={() => handleDelete(item.id)} className="p-1.5 text-red-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
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

// ── Disposition Codes ─────────────────────────────────────────────────────────

function DispositionsTab() {
  const { t } = useI18n()
  const [items, setItems] = useState<CrcDispositionCode[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [code, setCode] = useState('')
  const [nameFr, setNameFr] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => loadDispositionCodes().then(data => { setItems(data); setLoading(false) })
  useEffect(() => { load() }, [])

  const handleAdd = async () => {
    if (!code.trim() || !nameFr.trim()) return
    setSaving(true)
    const order = items.length > 0 ? Math.max(...items.map(i => i.display_order)) + 1 : 1
    await supabase.from('crc_disposition_codes').insert({ code: code.toUpperCase().trim(), name_fr: nameFr.trim(), name_ar: nameAr.trim() || nameFr.trim(), display_order: order })
    setCode(''); setNameFr(''); setNameAr(''); setShowAdd(false); setSaving(false)
    load()
  }

  const handleToggle = async (item: CrcDispositionCode) => {
    await supabase.from('crc_disposition_codes').update({ is_active: !item.is_active }).eq('id', item.id)
    load()
  }

  const handleDelete = async (id: string) => {
    await supabase.from('crc_disposition_codes').delete().eq('id', id)
    load()
  }

  return (
    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-gray-100 dark:border-dark-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900 dark:text-white">{t('crc.nav_dispositions')}</h2>
        <button onClick={() => setShowAdd(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors">
          <Plus className="w-4 h-4" />{t('crc.disposition_add')}
        </button>
      </div>

      {showAdd && (
        <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl space-y-3">
          <input value={code} onChange={e => setCode(e.target.value)} placeholder={t('crc.disposition_code')}
            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input value={nameFr} onChange={e => setNameFr(e.target.value)} placeholder={t('crc.disposition_name_fr')}
            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input value={nameAr} onChange={e => setNameAr(e.target.value)} placeholder={t('crc.disposition_name_ar')} dir="rtl"
            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="flex gap-2">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-lg transition-colors">{t('crc.cancel')}</button>
            <button onClick={handleAdd} disabled={!code.trim() || !nameFr.trim() || saving} className="px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors">{saving ? '…' : t('crc.add')}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
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
                <button onClick={() => handleToggle(item)} className={`text-xs px-2 py-1 rounded-lg transition-colors ${item.is_active ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                  {item.is_active ? t('crc.is_active') : 'Inactif'}
                </button>
                <button onClick={() => handleDelete(item.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
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

// ── Quick Replies ─────────────────────────────────────────────────────────────

function QuickRepliesTab() {
  const { t } = useI18n()
  const [items, setItems] = useState<CrcQuickReply[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ title_fr: '', title_ar: '', message_fr: '', message_ar: '', shortcut: '' })
  const [saving, setSaving] = useState(false)

  const load = () => loadQuickReplies().then(data => { setItems(data); setLoading(false) })
  useEffect(() => { load() }, [])

  const handleAdd = async () => {
    if (!form.title_fr.trim() || !form.message_fr.trim()) return
    setSaving(true)
    const order = items.length > 0 ? Math.max(...items.map(i => i.display_order)) + 1 : 1
    await supabase.from('crc_quick_replies').insert({
      title_fr: form.title_fr.trim(),
      title_ar: form.title_ar.trim() || form.title_fr.trim(),
      message_fr: form.message_fr.trim(),
      message_ar: form.message_ar.trim() || form.message_fr.trim(),
      shortcut: form.shortcut.trim() || null,
      display_order: order,
    })
    setForm({ title_fr: '', title_ar: '', message_fr: '', message_ar: '', shortcut: '' })
    setShowAdd(false); setSaving(false)
    load()
  }

  const handleToggle = async (item: CrcQuickReply) => {
    await supabase.from('crc_quick_replies').update({ is_active: !item.is_active }).eq('id', item.id)
    load()
  }

  const handleDelete = async (id: string) => {
    await supabase.from('crc_quick_replies').delete().eq('id', id)
    load()
  }

  const field = (key: keyof typeof form) => (
    <input value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
      placeholder={t(`crc.qr_${key}` as Parameters<typeof t>[0])}
      dir={key === 'title_ar' || key === 'message_ar' ? 'rtl' : undefined}
      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
  )

  return (
    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-gray-100 dark:border-dark-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900 dark:text-white">{t('crc.nav_quick_replies')}</h2>
        <button onClick={() => setShowAdd(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors">
          <Plus className="w-4 h-4" />{t('crc.qr_add')}
        </button>
      </div>

      {showAdd && (
        <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {field('title_fr')}
            {field('title_ar')}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <textarea value={form.message_fr} onChange={e => setForm(f => ({ ...f, message_fr: e.target.value }))} rows={3}
              placeholder={t('crc.qr_message_fr')}
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            <textarea value={form.message_ar} onChange={e => setForm(f => ({ ...f, message_ar: e.target.value }))} rows={3} dir="rtl"
              placeholder={t('crc.qr_message_ar')}
              className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
          {field('shortcut')}
          <div className="flex gap-2">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-lg transition-colors">{t('crc.cancel')}</button>
            <button onClick={handleAdd} disabled={!form.title_fr.trim() || !form.message_fr.trim() || saving} className="px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors">{saving ? '…' : t('crc.add')}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">{t('crc.qr_empty')}</p>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className={`flex items-start justify-between gap-3 px-4 py-3 rounded-xl border transition-colors ${item.is_active ? 'border-gray-200 dark:border-dark-border' : 'border-gray-100 dark:border-gray-700 opacity-60'}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{item.title_fr}</span>
                  {item.shortcut && <span className="text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded">/{item.shortcut}</span>}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{item.message_fr}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 mt-0.5">
                <button onClick={() => handleToggle(item)} className={`text-xs px-2 py-1 rounded-lg transition-colors ${item.is_active ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                  {item.is_active ? t('crc.is_active') : 'Inactif'}
                </button>
                <button onClick={() => handleDelete(item.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
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

// ── General Settings ──────────────────────────────────────────────────────────

function GeneralTab() {
  const { t } = useI18n()
  const [settings, setSettings] = useState<Record<string, string | number | boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('crc_settings').select('*').then(({ data }) => {
      if (data) {
        const map: Record<string, string | number | boolean> = {}
        ;(data as CrcSetting[]).forEach(s => { map[s.key] = s.value as string | number | boolean })
        setSettings(map)
      }
      setLoading(false)
    })
  }, [])

  const handleSave = async () => {
    setSaving(true); setError(null)
    try {
      for (const [key, value] of Object.entries(settings)) {
        await supabase.from('crc_settings').update({ value }).eq('key', key)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError(t('crc.save_error'))
    } finally {
      setSaving(false)
    }
  }

  const set = (key: string, value: string | number | boolean) =>
    setSettings(s => ({ ...s, [key]: value }))

  if (loading) return <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="bg-white dark:bg-dark-surface rounded-2xl border border-gray-100 dark:border-dark-border p-6 space-y-6">
      <h2 className="font-semibold text-gray-900 dark:text-white">{t('crc.nav_general')}</h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('crc.general_max_conv')}</label>
          <input type="number" min={1} max={10} value={Number(settings.max_conversations_per_agent ?? 3)}
            onChange={e => set('max_conversations_per_agent', Number(e.target.value))}
            className="w-32 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('crc.general_wrap_timeout')}</label>
          <input type="number" min={0} max={600} value={Number(settings.wrap_up_timeout_seconds ?? 300)}
            onChange={e => set('wrap_up_timeout_seconds', Number(e.target.value))}
            className="w-32 px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('crc.general_notif_sound')}</label>
          <button
            onClick={() => set('notification_sound_enabled', !settings.notification_sound_enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.notification_sound_enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.notification_sound_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('crc.general_notif_browser')}</label>
          <button
            onClick={() => set('notification_browser_enabled', !settings.notification_browser_enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.notification_browser_enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.notification_browser_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {saved && <p className="text-sm text-green-600 dark:text-green-400">{t('crc.save_success')}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors"
      >
        <Save className="w-4 h-4" />
        {saving ? '…' : t('crc.save')}
      </button>
    </div>
  )
}
