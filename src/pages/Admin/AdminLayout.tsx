import { Link, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Package, Tag, LogOut, ShoppingBag, Menu,
  ShoppingCart, Sun, Moon, Layers, Users, UserCircle, Settings,
  BarChart2, History, UserRound, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useI18n } from '../../context/LanguageContext'
import { useThemeCtx } from '../../context/ThemeContext'
import { useStaffAuth } from '../../hooks/useStaffAuth'
import { useAgentCtx } from '../../context/AgentContext'
import { navGroups } from '../../config/adminNavigation'

interface AdminLayoutProps {
  children: React.ReactNode
}

const ICONS: Record<string, React.ReactNode> = {
  '/admin':             <LayoutDashboard className="w-5 h-5 shrink-0" />,
  '/admin/workspace':   <Layers          className="w-5 h-5 shrink-0" />,
  '/admin/orders':      <ShoppingCart    className="w-5 h-5 shrink-0" />,
  '/admin/history':     <History         className="w-5 h-5 shrink-0" />,
  '/admin/customers':   <UserRound       className="w-5 h-5 shrink-0" />,
  '/admin/products':    <Package         className="w-5 h-5 shrink-0" />,
  '/admin/categories':  <Tag             className="w-5 h-5 shrink-0" />,
  '/admin/supervision': <BarChart2       className="w-5 h-5 shrink-0" />,
  '/admin/users':       <Users           className="w-5 h-5 shrink-0" />,
  '/admin/settings':    <Settings        className="w-5 h-5 shrink-0" />,
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { t } = useI18n()
  const { isDark, toggleTheme } = useThemeCtx()
  const { signOut, user, profile, isAdmin } = useStaffAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen]   = useState(false)
  const [compact, setCompact]           = useState(() => localStorage.getItem('nova-sidebar-compact') === '1')
  const { waitingCount, myStatus, myActiveCount } = useAgentCtx()

  useEffect(() => {
    localStorage.setItem('nova-sidebar-compact', compact ? '1' : '0')
  }, [compact])

  const statusDotBg: Record<string, string> = {
    available: 'bg-green-500',
    busy:      'bg-orange-500',
    pause:     'bg-yellow-500',
    offline:   'bg-gray-400',
  }

  const handleLogout = async () => {
    await signOut()
    navigate('/admin/login')
  }

  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ')
    || profile?.email || user?.email || ''
  const initials = displayName.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  const badgeValue = (badge: string | undefined): number => {
    if (badge === 'waitingCount') return waitingCount
    return 0
  }

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`border-b border-gray-100 dark:border-dark-border flex items-center gap-2 ${compact && !mobile ? 'justify-center p-4' : 'p-5'}`}>
        <Link to="/" className="flex items-center gap-2 min-w-0">
          <ShoppingBag className="w-7 h-7 text-blue-600 dark:text-blue-400 shrink-0" />
          {(!compact || mobile) && (
            <div className="min-w-0">
              <span className="font-bold text-gray-900 dark:text-white text-sm">NOVA SHOP</span>
              <p className="text-xs text-gray-400 dark:text-gray-500 -mt-0.5">
                {isAdmin ? t('admin.role_admin') : t('admin.role_agent')}
              </p>
            </div>
          )}
        </Link>
      </div>

      {/* Navigation groupée */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-0.5">
        {navGroups.map(group => {
          const visibleItems = group.items.filter(item => !item.adminOnly || isAdmin)
          if (visibleItems.length === 0) return null
          if (group.adminOnly && !isAdmin) return null

          return (
            <div key={group.labelKey} className="px-3">
              {(!compact || mobile) && (
                <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-2 pt-3 pb-1 select-none">
                  {t(group.labelKey as Parameters<typeof t>[0])}
                </p>
              )}
              {compact && !mobile && <div className="my-2 border-t border-gray-100 dark:border-dark-border" />}
              <div className="space-y-0.5">
                {visibleItems.map(item => {
                  const badge = badgeValue(item.badge)
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      onClick={() => { if (mobile) setSidebarOpen(false) }}
                      title={compact && !mobile ? t(item.labelKey as Parameters<typeof t>[0]) : undefined}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-xl text-sm font-medium transition-colors ${compact && !mobile ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'} ${
                          isActive
                            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                        }`
                      }
                    >
                      {ICONS[item.to]}
                      {(!compact || mobile) && (
                        <span className="truncate">{t(item.labelKey as Parameters<typeof t>[0])}</span>
                      )}
                      {badge > 0 && (
                        <span className={`inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full shrink-0 ${(!compact || mobile) ? 'ml-auto' : ''}`}>
                          {badge}
                        </span>
                      )}
                    </NavLink>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      {/* Agent status */}
      {myStatus !== 'offline' && (!compact || mobile) && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-700/50 flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotBg[myStatus] ?? 'bg-gray-400'}`} />
          <span className="text-xs text-gray-600 dark:text-gray-300 truncate">
            {myStatus === 'available' ? t('chat.admin_available')
              : myStatus === 'busy'  ? t('chat.admin_busy')
              : myStatus === 'pause' ? t('chat.admin_pause')
              : t('chat.admin_offline')}
          </span>
          {myActiveCount > 0 && (
            <span className="ml-auto text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0">{myActiveCount}</span>
          )}
        </div>
      )}
      {myStatus !== 'offline' && compact && !mobile && (
        <div className="mx-3 mb-2 flex justify-center">
          <span className={`w-2.5 h-2.5 rounded-full ${statusDotBg[myStatus] ?? 'bg-gray-400'}`} />
        </div>
      )}

      {/* Footer */}
      <div className={`border-t border-gray-100 dark:border-dark-border space-y-0.5 ${compact && !mobile ? 'p-2' : 'p-3'}`}>
        {/* Mon compte */}
        <NavLink
          to="/admin/account"
          onClick={() => { if (mobile) setSidebarOpen(false) }}
          title={compact && !mobile ? displayName || t('admin.my_account') : undefined}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl text-sm font-medium transition-colors ${compact && !mobile ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'} ${
              isActive
                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
            }`
          }
        >
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
          ) : (
            <UserCircle className="w-5 h-5 shrink-0" />
          )}
          {(!compact || mobile) && <span className="truncate">{displayName || t('admin.my_account')}</span>}
        </NavLink>

        {/* Thème */}
        <button
          onClick={toggleTheme}
          title={isDark ? t('common.light_mode') : t('common.dark_mode')}
          className={`flex items-center gap-3 w-full rounded-xl text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors ${compact && !mobile ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'}`}
        >
          {isDark ? <Sun className="w-5 h-5 shrink-0" /> : <Moon className="w-5 h-5 shrink-0" />}
          {(!compact || mobile) && (isDark ? t('common.light_mode') : t('common.dark_mode'))}
        </button>

        {/* Déconnexion */}
        <button
          onClick={handleLogout}
          title={compact && !mobile ? t('admin.logout') : undefined}
          className={`flex items-center gap-3 w-full rounded-xl text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors ${compact && !mobile ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'}`}
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {(!compact || mobile) && t('admin.logout')}
        </button>

        {/* Toggle compact — desktop seulement */}
        {!mobile && (
          <button
            onClick={() => setCompact(c => !c)}
            title={compact ? t('admin.expand_sidebar') : t('admin.collapse_sidebar')}
            className={`flex items-center gap-3 w-full rounded-xl text-sm font-medium text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors mt-1 ${compact ? 'justify-center px-2 py-2' : 'px-3 py-2'}`}
          >
            {compact ? <ChevronRight className="w-4 h-4 shrink-0" /> : <ChevronLeft className="w-4 h-4 shrink-0" />}
            {!compact && <span className="text-xs">{t('admin.collapse_sidebar')}</span>}
          </button>
        )}
      </div>
    </div>
  )

  const sidebarWidth = compact ? 'w-16' : 'w-64'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg flex transition-colors duration-200">
      {/* Sidebar desktop */}
      <aside className={`hidden md:flex flex-col ${sidebarWidth} bg-white dark:bg-dark-surface border-r border-gray-100 dark:border-dark-border fixed inset-y-0 transition-all duration-200`}>
        {SidebarContent({})}
      </aside>

      {/* Sidebar mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-64 h-full bg-white dark:bg-dark-surface shadow-xl transition-colors duration-200">
            {SidebarContent({ mobile: true })}
          </div>
        </div>
      )}

      {/* Contenu principal */}
      <div className={`flex-1 ${compact ? 'md:ml-16' : 'md:ml-64'} transition-all duration-200`}>
        {/* Header mobile */}
        <header className="md:hidden bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border px-4 py-3 flex items-center gap-3 transition-colors duration-200">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-semibold text-gray-900 dark:text-white">NOVA SHOP Admin</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggleTheme}
              aria-label={isDark ? t('common.light_mode') : t('common.dark_mode')}
              className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <Link to="/admin/account" className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center overflow-hidden">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{initials || '?'}</span>
              )}
            </Link>
          </div>
        </header>
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
