import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Menu, X, ShoppingBag, Sun, Moon } from 'lucide-react'
import { useI18n } from '../../context/LanguageContext'
import { useThemeCtx } from '../../context/ThemeContext'
import { WhatsAppButton } from '../whatsapp/WhatsAppButton'
import type { Language } from '../../types'

export function Header() {
  const { t, lang, setLang, isRTL } = useI18n()
  const { isDark, toggleTheme } = useThemeCtx()
  const [menuOpen, setMenuOpen] = useState(false)

  const navLinks = [
    { to: '/', label: t('nav.home') },
    { to: '/products', label: t('nav.products') },
    { to: '/categories', label: t('nav.categories') },
    { to: '/contact', label: t('nav.contact') },
  ]

  const toggleLang = () => setLang(lang === 'fr' ? 'ar' : 'fr' as Language)

  return (
    <header className="sticky top-0 z-50 bg-white dark:bg-dark-surface border-b border-gray-100 dark:border-dark-border shadow-sm dark:shadow-none transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <ShoppingBag className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            <span className="text-xl font-bold text-gray-900 dark:text-white">NOVA SHOP</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) =>
                  `text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          {/* Desktop actions */}
          <div className={`hidden md:flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              aria-label={isDark ? t('common.light_mode') : t('common.dark_mode')}
              title={isDark ? t('common.light_mode') : t('common.dark_mode')}
              className="p-2 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>

            {/* Language toggle */}
            <button
              onClick={toggleLang}
              className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 transition-colors hover:border-blue-400 dark:hover:border-blue-500"
            >
              {lang === 'fr' ? 'العربية' : 'FR'}
            </button>

            <WhatsAppButton size="sm" />
          </div>

          {/* Mobile: theme toggle + menu button */}
          <div className="md:hidden flex items-center gap-1">
            <button
              onClick={toggleTheme}
              aria-label={isDark ? t('common.light_mode') : t('common.dark_mode')}
              className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Menu"
            >
              {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="md:hidden bg-white dark:bg-dark-surface border-t border-gray-100 dark:border-dark-border shadow-lg dark:shadow-none">
          <div className="px-4 py-3 space-y-1">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `block px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
            <div className={`flex items-center gap-3 pt-3 border-t border-gray-100 dark:border-dark-border ${isRTL ? 'flex-row-reverse' : ''}`}>
              <button
                onClick={toggleLang}
                className="text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {lang === 'fr' ? 'العربية' : 'FR'}
              </button>
              <WhatsAppButton size="sm" />
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
