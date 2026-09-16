import { Link, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Package, PlusCircle, Tag, LogOut, ShoppingBag, Menu, ShoppingCart, Sun, Moon, MessageSquare } from 'lucide-react'
import { useState } from 'react'
import { useI18n } from '../../context/LanguageContext'
import { useThemeCtx } from '../../context/ThemeContext'
import { useAuth } from '../../hooks/useAuth'
import { useChatPresence } from '../../hooks/useChatPresence'

interface AdminLayoutProps {
  children: React.ReactNode
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const { t } = useI18n()
  const { isDark, toggleTheme } = useThemeCtx()
  const { signOut, user } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { waitingCount } = useChatPresence(user?.id ?? null)

  const handleLogout = async () => {
    await signOut()
    navigate('/admin/login')
  }

  const navItems = [
    { to: '/admin', icon: <LayoutDashboard className="w-5 h-5" />, label: t('admin.dashboard'), end: true, badge: 0 },
    { to: '/admin/products', icon: <Package className="w-5 h-5" />, label: t('admin.products'), badge: 0 },
    { to: '/admin/products/new', icon: <PlusCircle className="w-5 h-5" />, label: t('admin.add_product'), badge: 0 },
    { to: '/admin/categories', icon: <Tag className="w-5 h-5" />, label: t('admin.categories'), badge: 0 },
    { to: '/admin/orders', icon: <ShoppingCart className="w-5 h-5" />, label: t('order.orders'), badge: 0 },
    { to: '/admin/chat', icon: <MessageSquare className="w-5 h-5" />, label: t('chat.admin_title'), badge: waitingCount },
  ]

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-gray-100 dark:border-dark-border">
        <Link to="/" className="flex items-center gap-2">
          <ShoppingBag className="w-7 h-7 text-blue-600 dark:text-blue-400" />
          <span className="font-bold text-gray-900 dark:text-white">NOVA SHOP</span>
        </Link>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Admin</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(item => (
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
            {item.badge > 0 && (
              <span className="ml-auto inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
                {item.badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-gray-100 dark:border-dark-border space-y-1">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          aria-label={isDark ? t('common.light_mode') : t('common.dark_mode')}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          {isDark ? t('common.light_mode') : t('common.dark_mode')}
        </button>
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
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-white dark:bg-dark-surface border-r border-gray-100 dark:border-dark-border fixed inset-y-0 transition-colors duration-200">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-64 h-full bg-white dark:bg-dark-surface shadow-xl transition-colors duration-200">
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 md:ml-64">
        {/* Mobile header */}
        <header className="md:hidden bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border px-4 py-3 flex items-center gap-3 transition-colors duration-200">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-semibold text-gray-900 dark:text-white">NOVA SHOP Admin</span>
          <div className="ml-auto">
            <button
              onClick={toggleTheme}
              aria-label={isDark ? t('common.light_mode') : t('common.dark_mode')}
              className="p-1.5 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
