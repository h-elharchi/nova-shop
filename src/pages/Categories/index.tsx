import { Link } from 'react-router-dom'
import { useI18n } from '../../context/LanguageContext'
import { useCategories } from '../../hooks/useCategories'
import { Layout } from '../../components/layout/Layout'

export function CategoriesPage() {
  const { t, lang } = useI18n()
  const { categories, loading } = useCategories()

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">{t('nav.categories')}</h1>
        {loading && (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!loading && categories.length === 0 && (
          <div className="text-center py-20 text-gray-400 dark:text-gray-500">{t('common.no_categories')}</div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              to={`/categories/${cat.slug}`}
              className="bg-white dark:bg-dark-card rounded-2xl shadow-sm hover:shadow-md dark:hover:shadow-black/20 transition-all duration-200 border border-gray-100 dark:border-dark-border overflow-hidden group"
            >
              {cat.image_url ? (
                <div className="aspect-video overflow-hidden">
                  <img
                    src={cat.image_url}
                    alt={lang === 'ar' ? cat.name_ar : cat.name_fr}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="aspect-video bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/30 dark:to-blue-800/30 flex items-center justify-center">
                  <span className="text-4xl">🛍️</span>
                </div>
              )}
              <div className="p-4 text-center">
                <h2 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {lang === 'ar' ? cat.name_ar : cat.name_fr}
                </h2>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  )
}
