import { useState, useEffect, useCallback } from 'react'
import { UserPlus, User, MoreVertical, CheckCircle, XCircle, RefreshCw, AlertCircle, Mail } from 'lucide-react'
import { AdminLayout } from './AdminLayout'
import { useI18n } from '../../context/LanguageContext'
import { useStaffAuth } from '../../hooks/useStaffAuth'
import { listStaffUsers, inviteStaffUser, updateStaffUser, resetStaffPassword } from '../../lib/adminUsers'
import type { StaffProfile, StaffRole } from '../../types'

type InviteForm = {
  email: string
  role: StaffRole
  first_name: string
  last_name: string
}

export function AdminUsersPage() {
  const { t } = useI18n()
  const { user: currentUser } = useStaffAuth()

  const [users, setUsers]     = useState<StaffProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const [showInvite, setShowInvite]   = useState(false)
  const [inviteForm, setInviteForm]   = useState<InviteForm>({ email: '', role: 'agent', first_name: '', last_name: '' })
  const [inviting, setInviting]       = useState(false)
  const [inviteMsg, setInviteMsg]     = useState<{ ok: boolean; text: string } | null>(null)

  const [actionMsg, setActionMsg]   = useState<{ ok: boolean; text: string } | null>(null)
  const [menuOpen, setMenuOpen]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listStaffUsers()
      setUsers(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviting(true)
    setInviteMsg(null)
    try {
      await inviteStaffUser({
        email: inviteForm.email,
        role:  inviteForm.role,
        first_name: inviteForm.first_name || undefined,
        last_name:  inviteForm.last_name  || undefined,
      })
      setInviteMsg({ ok: true, text: t('users.invite_success') })
      setInviteForm({ email: '', role: 'agent', first_name: '', last_name: '' })
      await load()
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('users.invite_error')
      setInviteMsg({ ok: false, text: msg })
    } finally {
      setInviting(false)
    }
  }

  const handleToggleActive = async (u: StaffProfile) => {
    if (u.id === currentUser?.id) {
      setActionMsg({ ok: false, text: t('users.cannot_self') })
      setTimeout(() => setActionMsg(null), 3000)
      return
    }
    try {
      await updateStaffUser({ user_id: u.id, is_active: !u.is_active })
      setActionMsg({ ok: true, text: u.is_active ? t('users.deactivate') + ' ✓' : t('users.reactivate') + ' ✓' })
      setTimeout(() => setActionMsg(null), 2000)
      await load()
    } catch (err) {
      setActionMsg({ ok: false, text: err instanceof Error ? err.message : t('common.error') })
    }
    setMenuOpen(null)
  }

  const handleChangeRole = async (u: StaffProfile, role: StaffRole) => {
    if (u.id === currentUser?.id) {
      setActionMsg({ ok: false, text: t('users.cannot_self') })
      setTimeout(() => setActionMsg(null), 3000)
      return
    }
    try {
      await updateStaffUser({ user_id: u.id, role })
      setActionMsg({ ok: true, text: t('users.change_role') + ' ✓' })
      setTimeout(() => setActionMsg(null), 2000)
      await load()
    } catch (err) {
      setActionMsg({ ok: false, text: err instanceof Error ? err.message : t('common.error') })
    }
    setMenuOpen(null)
  }

  const handleResetPassword = async (u: StaffProfile) => {
    try {
      await resetStaffPassword(u.email)
      setActionMsg({ ok: true, text: t('users.reset_success') })
      setTimeout(() => setActionMsg(null), 3000)
    } catch {
      setActionMsg({ ok: false, text: t('users.reset_error') })
    }
    setMenuOpen(null)
  }

  const inputCls = 'w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors'
  const labelCls = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5'

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto">
        {/* En-tête */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('users.title')}</h1>
          <button
            onClick={() => { setShowInvite(!showInvite); setInviteMsg(null) }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            {t('users.invite')}
          </button>
        </div>

        {/* Message d'action global */}
        {actionMsg && (
          <div className={`mb-4 flex items-center gap-2 p-3 rounded-xl text-sm border ${
            actionMsg.ok
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
          }`}>
            {actionMsg.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            {actionMsg.text}
          </div>
        )}

        {/* Formulaire d'invitation */}
        {showInvite && (
          <div className="mb-6 bg-white dark:bg-dark-surface rounded-2xl border border-gray-100 dark:border-dark-border p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">{t('users.invite')}</h2>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className={labelCls}>{t('account.email')} *</label>
                <input
                  type="email"
                  required
                  value={inviteForm.email}
                  onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                  className={inputCls}
                  placeholder={t('users.email_placeholder')}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>{t('users.first_name')}</label>
                  <input
                    type="text"
                    value={inviteForm.first_name}
                    onChange={e => setInviteForm(f => ({ ...f, first_name: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>{t('users.last_name')}</label>
                  <input
                    type="text"
                    value={inviteForm.last_name}
                    onChange={e => setInviteForm(f => ({ ...f, last_name: e.target.value }))}
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>{t('users.role')}</label>
                <select
                  value={inviteForm.role}
                  onChange={e => setInviteForm(f => ({ ...f, role: e.target.value as StaffRole }))}
                  className={inputCls}
                >
                  <option value="agent">{t('admin.role_agent')}</option>
                  <option value="admin">{t('admin.role_admin')}</option>
                </select>
              </div>

              {inviteMsg && (
                <div className={`flex items-center gap-2 text-sm ${inviteMsg.ok ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                  {inviteMsg.ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  {inviteMsg.text}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={inviting}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  {inviting ? '...' : t('users.invite_send')}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowInvite(false); setInviteMsg(null) }}
                  className="px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  {t('users.invite_cancel')}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Liste des utilisateurs */}
        <div className="bg-white dark:bg-dark-surface rounded-2xl border border-gray-100 dark:border-dark-border">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="p-6 text-center text-sm text-red-500 dark:text-red-400">{error}</div>
          ) : users.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-400 dark:text-gray-500">{t('users.no_users')}</div>
          ) : (
            <table className="w-full">
              <tbody className="divide-y divide-gray-50 dark:divide-dark-border">
                {users.map(u => {
                  const displayName = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email
                  const isSelf = u.id === currentUser?.id

                  return (
                    <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center overflow-hidden shrink-0">
                            {u.avatar_url ? (
                              <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <User className="w-5 h-5 text-gray-400" />
                            )}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900 dark:text-white">{displayName}</div>
                            <div className="text-xs text-gray-400 dark:text-gray-500">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                          u.role === 'admin'
                            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                            : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                        }`}>
                          {u.role === 'admin' ? t('admin.role_admin') : t('admin.role_agent')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
                          u.is_active
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                        }`}>
                          {u.is_active ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {u.is_active ? t('users.status_active') : t('users.status_inactive')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right relative">
                        {!isSelf && (
                          <>
                            <button
                              onClick={() => setMenuOpen(menuOpen === u.id ? null : u.id)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                menuOpen === u.id
                                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                              }`}
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>

                            {menuOpen === u.id && (
                              <div className="absolute right-4 bottom-full mb-1 z-20 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl shadow-xl py-1 min-w-44">
                                {/* Changer le rôle */}
                                {u.role !== 'admin' && (
                                  <button
                                    onClick={() => handleChangeRole(u, 'admin')}
                                    className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors"
                                  >
                                    {t('users.make_admin')}
                                  </button>
                                )}
                                {u.role !== 'agent' && (
                                  <button
                                    onClick={() => handleChangeRole(u, 'agent')}
                                    className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors"
                                  >
                                    {t('users.make_agent')}
                                  </button>
                                )}
                                <div className="my-1 border-t border-gray-100 dark:border-dark-border" />
                                {/* Activer / Désactiver */}
                                <button
                                  onClick={() => handleToggleActive(u)}
                                  className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${
                                    u.is_active
                                      ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                                      : 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20'
                                  }`}
                                >
                                  {u.is_active ? t('users.deactivate') : t('users.reactivate')}
                                </button>
                                {/* Reset mot de passe */}
                                <button
                                  onClick={() => handleResetPassword(u)}
                                  className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors flex items-center gap-2"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                  {t('users.reset_password')}
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
