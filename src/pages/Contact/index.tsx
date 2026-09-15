import { MessageCircle, Clock, MapPin } from 'lucide-react'
import { useI18n } from '../../context/LanguageContext'
import { WhatsAppButton } from '../../components/whatsapp/WhatsAppButton'
import { Layout } from '../../components/layout/Layout'

export function ContactPage() {
  const { t, lang } = useI18n()

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-12">
          <MessageCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">{t('contact.title')}</h1>
          <p className="text-gray-500 dark:text-gray-400">{t('contact.subtitle')}</p>
        </div>

        <div className="bg-white dark:bg-dark-card rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border p-8 space-y-6 transition-colors duration-200">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center shrink-0">
              <MessageCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <div className="font-semibold text-gray-900 dark:text-white">WhatsApp</div>
              <div className="text-gray-500 dark:text-gray-400 text-sm">{t('contact.phone')}</div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center shrink-0">
              <Clock className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <div className="font-semibold text-gray-900 dark:text-white">{t('contact.hours')}</div>
              <div className="text-gray-500 dark:text-gray-400 text-sm">
                {lang === 'ar' ? 'من الاثنين إلى الأحد، 9 صباحاً - 9 مساءً' : 'Lun - Dim, 9h - 21h'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center shrink-0">
              <MapPin className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <div className="font-semibold text-gray-900 dark:text-white">{t('footer.delivery')}</div>
              <div className="text-gray-500 dark:text-gray-400 text-sm">
                {lang === 'ar' ? 'نوصل لجميع مدن المملكة المغربية' : 'Nous livrons dans toutes les villes du Maroc'}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 dark:border-dark-border">
            <WhatsAppButton size="lg" fullWidth />
          </div>
        </div>
      </div>
    </Layout>
  )
}
