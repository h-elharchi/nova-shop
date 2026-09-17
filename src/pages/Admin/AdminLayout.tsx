import { Link, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Package, PlusCircle, Tag, LogOut, ShoppingBag, Menu, ShoppingCart, Sun, Moon, Layers, Users, UserCircle, Settings, BarChart2, History, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useI18n } from '../../context/LanguageContext'
import { useThemeCtx } from '../../context/ThemeContext'
import { useStaffAuth } from '../../hooks/useStaffAuth'
import { useAgentCtx } from '../../context/AgentContext'

interface AdminLayoutProps {
  children: React.ReactNode
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { t } = useI18n()
  const { isDark, toggleTheme } = useThemeCtx()
  const { signOut, user, profile, isAdmin } = useStaffAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { waitingCount, myStatus, myActiveCount } = useAgentCtx()

  const statusDotBg: Record<string, string> = {
    available: 'bg-green-500',
    busy: 'bg-orange-500',
    pause: 'bg-yellow-500',
    offline: 'bg-gray-400',
  }

  const handleLogout = async () => {
    await signOut()
    navigate('/admin/login')
  }

  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || profile?.email || user?.email || ''
  const initials = displayName
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  type NavItem = {
    to: string
    icon: React.ReactNode
    label: string
    end?: boolean
    badge?: number
    adminOnly?: boolean
  }

  const navItems: NavItem[] = [
    { to: '/admin',               icon: <LayoutDashboard className="w-5 h-5" />, label: t('admin.dashboard'),    end: true  },
    { to: '/admin/workspace',     icon: <Layers          className="w-5 h-5" />, label: t('admin.workspace'),    badge: waitingCount },
    { to: '/admin/orders',        icon: <ShoppingCart    className="w-5 h-5" />, label: t('order.orders')        },
    { to: '/admin/products',      icon: <Package         className="w-5 h-5" />, label: t('admin.products'),     adminOnly: true },
    { to: '/admin/products/new',  icon: <PlusCircle      className="w-5 h-5" />, label: t('admin.add_product'),  adminOnly: true },
    { to: '/admin/categories',    icon: <Tag             className="w-5 h-5" />, label: t('admin.categories'),   adminOnly: true },
    { to: '/admin/history',       icon: <History         className="w-5 h-5" />, label: t('admin.history')       },
    { to: '/admin/customers',     icon: <UserRound       className="w-5 h-5" />, label: t('admin.customers')     },
    { to: '/admin/users',         icon: <Users           className="w-5 h-5" />, label: t('admin.users'),        adminOnly: true },
    { to: '/admin/supervision',   icon: <BarChart2       className="w-5 h-5" />, label: t('admin.supervision'),  adminOnly: true },
    { to: '/admin/email-settings',icon: <Settings        className="w-5 h-5" />, label: t('admin.email_settings'), adminOnly: true },
    { to: '/admin/crc-settings',  icon: <Settings        className="w-5 h-5" />, label: t('admin.crc_settings'), adminOnly: true },
  ]

  const visibleItems = navItems.filter(item => !item.adminOnly || isAdmin)

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-gray-100 dark:border-dark-border">
        <Link to="/" className="flex items-center gap-2">
          <ShoppingBag className="w-7 h-7 text-blue-600 dark:text-blue-400" />
          <span className="font-bold text-gray-900 dark:text-white">NOVA SHOP</span>
        </Link>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          {isAdmin ? t('admin.role_admin') : t('admin.role_agent')}
        </p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {visibleItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
              }`
            }
          >
            {item.icon}
            {item.label}
            {(item.badge ?? 0) > 0 && (
              <span className="ml-auto inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
                {item.badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Compact agent status */}
      {myStatus !== 'offline' && (
        <div className="mx-4 mb-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-700/50 flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotBg[myStatus] ?? 'bg-gray-400'}`} />
          <span className="text-xs text-gray-600 dark:text-gray-300">
            {myStatus === 'available' ? t('chat.admin_available')
              : myStatus === 'busy' ? t('chat.admin_busy')
              : myStatus === 'pause' ? t('chat.admin_pause')
              : t('chat.admin_offline')}
          </span>
          {myActiveCount > 0 && (
            <span className="ml-auto text-xs font-medium text-gray-500 dark:text-gray-400">
              {myActiveCount}
            </span>
          )}
        </div>
      )}

      <div className="p-4 border-t border-gray-100 dark:border-dark-border space-y-1">
        {/* Mon compte */}
        <NavLink
          to="/admin/account"
          onClick={() => setSidebarOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              isActive
                ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
            }`
          }
        >
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
          ) : (
            <UserCircle className="w-5 h-5" />
          )}
          <span className="truncate">{displayName || t('admin.my_account')}</span>
        </NavLink>

        {/* Thème */}
        <button
          onClick={toggleTheme}
          aria-label={isDark ? t('common.light_mode') : t('common.dark_mode')}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          {isDark ? t('common.light_mode') : t('common.dark_mode')}
        </button>

        {/* Déconnexion */}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          {t('admin.logout')}
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg flex transition-colors duration-200">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-white dark:bg-dark-surface border-r border-gray-100 dark:border-dark-border fixed inset-y-0 transition-colors duration-200">
        <SidebarContent />
      </aside>

      {/* Sidebar mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-64 h-full bg-white dark:bg-dark-surface shadow-xl transition-colors duration-200">
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Contenu principal */}
      <div className="flex-1 md:ml-64">
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
            {/* Avatar mobile */}
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
