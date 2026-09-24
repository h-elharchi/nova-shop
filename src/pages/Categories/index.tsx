import { useI18n } from '../../context/LanguageContext'
import { useCategories } from '../../hooks/useCategories'
import { getTopLevel } from '../../lib/categories'
import { CategoryTile } from '../../components/categories/CategoryTile'
import { Layout } from '../../components/layout/Layout'

export function CategoriesPage() {
  const { t } = useI18n()
  const { categories, loading } = useCategories()
  const topLevel = getTopLevel(categories)

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">{t('nav.categories')}</h1>
        {loading && (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!loading && topLevel.length === 0 && (
          <div className="text-center py-20 text-gray-400 dark:text-gray-500">{t('common.no_categories')}</div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {topLevel.map((cat) => <CategoryTile key={cat.id} category={cat} />)}
        </div>
      </div>
    </Layout>
  )
}
