import { Link } from 'react-router-dom'
import { ShoppingBag, MapPin, Clock } from 'lucide-react'
import { useI18n } from '../../context/LanguageContext'
import { WhatsAppButton } from '../whatsapp/WhatsAppButton'

export function Footer() {
  const { t } = useI18n()

  return (
    <footer className="bg-gray-900 dark:bg-dark-bg border-t border-gray-800 dark:border-dark-border text-white transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <ShoppingBag className="w-7 h-7 text-blue-400" />
              <span className="text-xl font-bold">NOVA SHOP</span>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">{t('footer.slogan')}</p>
          </div>

          {/* Links */}
          <div>
            <h3 className="font-semibold mb-4 text-gray-200">{t('nav.products')}</h3>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link to="/products" className="hover:text-white transition-colors">{t('nav.products')}</Link></li>
              <li><Link to="/categories" className="hover:text-white transition-colors">{t('nav.categories')}</Link></li>
              <li><Link to="/contact" className="hover:text-white transition-colors">{t('nav.contact')}</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold mb-4 text-gray-200">{t('nav.contact')}</h3>
            <div className="space-y-3 text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-400 shrink-0" />
                <span>{t('footer.delivery')}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400 shrink-0" />
                <span>{t('contact.hours')}</span>
              </div>
              <div className="mt-4">
                <WhatsAppButton size="sm" />
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-10 pt-6 text-center text-sm text-gray-500">
          {t('footer.rights')}
        </div>
      </div>
    </footer>
  )
}
