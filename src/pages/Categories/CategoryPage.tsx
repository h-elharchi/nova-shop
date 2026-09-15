import { useParams } from 'react-router-dom'
import { useI18n } from '../../context/LanguageContext'
import { useProducts } from '../../hooks/useProducts'
import { useCategories } from '../../hooks/useCategories'
import { ProductCard } from '../../components/products/ProductCard'
import { Layout } from '../../components/layout/Layout'

export function CategoryPage() {
  const { slug = '' } = useParams()
  const { t, lang } = useI18n()
  const { categories } = useCategories()
  const { products, loading } = useProducts({ categorySlug: slug })

  const category = categories.find(c => c.slug === slug)

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {category ? (lang === 'ar' ? category.name_ar : category.name_fr) : slug}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-8">
          {products.length} {t('nav.products').toLowerCase()}
        </p>
        {loading && (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!loading && products.length === 0 && (
          <div className="text-center py-20 text-gray-400 dark:text-gray-500">{t('common.no_products')}</div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map(p => <ProductCard key={p.id} product={p} />)}
        </div>
      </div>
    </Layout>
  )
}
