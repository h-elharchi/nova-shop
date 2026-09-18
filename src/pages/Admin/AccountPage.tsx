import { useState, useRef, useEffect } from 'react'
import { Camera, User, Lock, CheckCircle, AlertCircle, Sun, Moon, Globe } from 'lucide-react'
import { AdminLayout } from './AdminLayout'
import { useI18n } from '../../context/LanguageContext'
import { useThemeCtx } from '../../context/ThemeContext'
import { useStaffAuth } from '../../hooks/useStaffAuth'
import { supabase } from '../../lib/supabase'

type Section = 'profile' | 'security'

export function AdminAccountPage() {
  const { t, lang, setLang } = useI18n()
  const { isDark, toggleTheme } = useThemeCtx()
  const { profile, updateProfile, refetchProfile } = useStaffAuth()

  const [section, setSection] = useState<Section>('profile')

  // Profile form — initialized once when profile loads (async)
  const initialized = useRef(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName]   = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (profile && !initialized.current) {
      initialized.current = true
      setFirstName(profile.first_name ?? '')
      setLastName(profile.last_name ?? '')
      setAvatarPreview(profile.avatar_url ?? null)
    }
  }, [profile])

  // Security form
  const [newPwd, setNewPwd]     = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [savingPwd, setSavingPwd]   = useState(false)
  const [pwdMsg, setPwdMsg]         = useState<{ ok: boolean; text: string } | null>(null)

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingProfile(true)
    setProfileMsg(null)

    try {
      let avatarUrl = profile?.avatar_url ?? null

      if (avatarFile && profile) {
        const ext = avatarFile.name.split('.').pop()
        const path = `${profile.id}/avatar.${ext}`

        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(path, avatarFile, { upsert: true })

        if (uploadError) throw uploadError

        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
        avatarUrl = publicUrl
      }

      const ok = await updateProfile({
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        avatar_url: avatarUrl,
      })

      if (ok) {
        refetchProfile?.()
        setProfileMsg({ ok: true, text: t('account.profile_success') })
      } else {
        setProfileMsg({ ok: false, text: t('account.profile_error') })
      }
    } catch {
      setProfileMsg({ ok: false, text: t('account.profile_error') })
    } finally {
      setSavingProfile(false)
    }
  }

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwdMsg(null)

    if (newPwd.length < 8) {
      setPwdMsg({ ok: false, text: t('account.error_length') })
      return
    }
    if (newPwd !== confirmPwd) {
      setPwdMsg({ ok: false, text: t('account.error_match') })
      return
    }

    setSavingPwd(true)
    const { error } = await supabase.auth.updateUser({ password: newPwd })
    setSavingPwd(false)

    if (error) {
      setPwdMsg({ ok: false, text: t('account.password_error') })
    } else {
      setNewPwd('')
      setConfirmPwd('')
      setPwdMsg({ ok: true, text: t('account.password_success') })
    }
  }

  const tabClass = (s: Section) =>
    `flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition-colors ${
      section === s
        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
    }`

  const inputCls = 'w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors'
  const labelCls = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5'

  const roleLabel = profile?.role === 'admin' ? t('admin.role_admin') : t('admin.role_agent')

  return (
    <AdminLayout>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">{t('account.title')}</h1>

        {/* Tabs */}
        <div className="flex gap-1 mb-6">
          <button className={tabClass('profile')} onClick={() => setSection('profile')}>
            <User className="w-4 h-4" />
            {t('account.profile_section')}
          </button>
          <button className={tabClass('security')} onClick={() => setSection('security')}>
            <Lock className="w-4 h-4" />
            {t('account.security_section')}
          </button>
        </div>

        <div className="bg-white dark:bg-dark-surface rounded-2xl border border-gray-100 dark:border-dark-border p-6 space-y-6">

          {/* Section Profil */}
          {section === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-5">
              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center overflow-hidden">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-9 h-9 text-blue-400 dark:text-blue-500" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="absolute -bottom-1 -right-1 w-7 h-7 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center shadow transition-colors"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {[profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || profile?.email}
                  </p>
                  <span className="inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                    {roleLabel}
                  </span>
                </div>
              </div>

              {/* Champs */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>{t('account.first_name')}</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    className={inputCls}
                    placeholder={t('account.first_name')}
                  />
                </div>
                <div>
                  <label className={labelCls}>{t('account.last_name')}</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    className={inputCls}
                    placeholder={t('account.last_name')}
                  />
                </div>
              </div>

              <div>
                <label className={labelCls}>{t('account.email')}</label>
                <input type="email" value={profile?.email ?? ''} disabled className={`${inputCls} opacity-60 cursor-not-allowed`} />
              </div>

              {profileMsg && (
                <div className={`flex items-center gap-2 text-sm ${profileMsg.ok ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                  {profileMsg.ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  {profileMsg.text}
                </div>
              )}

              <button
                type="submit"
                disabled={savingProfile}
                className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors"
              >
                {savingProfile ? '...' : t('account.save_profile')}
              </button>
            </form>
          )}

          {/* Section Préférences — toujours visible */}
          <div className="border-t border-gray-100 dark:border-dark-border pt-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center gap-2">
              <Globe className="w-4 h-4" />{t('account.preferences')}
            </h3>
            <div className="space-y-4">
              {/* Langue */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">{t('account.language')}</span>
                <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-xl p-0.5">
                  {(['fr', 'ar'] as const).map(l => (
                    <button
                      key={l}
                      onClick={() => setLang(l)}
                      className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${lang === l ? 'bg-white dark:bg-dark-card text-blue-700 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                    >
                      {l === 'fr' ? 'Français' : 'العربية'}
                    </button>
                  ))}
                </div>
              </div>
              {/* Thème */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">{t('account.theme')}</span>
                <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-xl p-0.5">
                  <button
                    onClick={() => { if (isDark) toggleTheme() }}
                    className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${!isDark ? 'bg-white dark:bg-dark-card text-amber-600 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                  >
                    <Sun className="w-3.5 h-3.5" />{t('account.theme_light')}
                  </button>
                  <button
                    onClick={() => { if (!isDark) toggleTheme() }}
                    className={`flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${isDark ? 'bg-dark-card text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    <Moon className="w-3.5 h-3.5" />{t('account.theme_dark')}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Section Sécurité */}
          {section === 'security' && (
            <form onSubmit={handleSavePassword} className="space-y-5">
              <div>
                <label className={labelCls}>{t('account.new_password')}</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  className={inputCls}
                  placeholder="••••••••"
                  minLength={8}
                  required
                />
              </div>
              <div>
                <label className={labelCls}>{t('account.confirm_password')}</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPwd}
                  onChange={e => setConfirmPwd(e.target.value)}
                  className={inputCls}
                  placeholder="••••••••"
                  minLength={8}
                  required
                />
              </div>

              {pwdMsg && (
                <div className={`flex items-center gap-2 text-sm ${pwdMsg.ok ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                  {pwdMsg.ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  {pwdMsg.text}
                </div>
              )}

              <button
                type="submit"
                disabled={savingPwd}
                className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors"
              >
                {savingPwd ? '...' : t('account.save_password')}
              </button>
            </form>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
