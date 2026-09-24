import { Link, useParams } from 'react-router-dom'
import { useI18n } from '../../context/LanguageContext'
import { useProducts } from '../../hooks/useProducts'
import { useCategories } from '../../hooks/useCategories'
import { getChildren } from '../../lib/categories'
import { ProductCard } from '../../components/products/ProductCard'
import { CategoryTile } from '../../components/categories/CategoryTile'
import { Layout } from '../../components/layout/Layout'

export function CategoryPage() {
  const { slug = '' } = useParams()
  const { t, lang } = useI18n()
  const { categories } = useCategories()
  const { products, loading } = useProducts({ categorySlug: slug })

  const category = categories.find(c => c.slug === slug)
  const parents = category ? categories.filter(c => category.parent_links.some(l => l.parent_id === c.id)) : []
  const subcategories = category ? getChildren(categories, category.id) : []
  const nameOf = (c: { name_fr: string; name_ar: string }) => (lang === 'ar' ? c.name_ar : c.name_fr)

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {parents.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
            {parents.map(parent => (
              <Link
                key={parent.id}
                to={`/categories/${parent.slug}`}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                ← {nameOf(parent)}
              </Link>
            ))}
          </div>
        )}
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {category ? nameOf(category) : slug}
        </h1>

        {subcategories.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              {t('sections.subcategories')}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {subcategories.map(sub => <CategoryTile key={sub.id} category={sub} />)}
            </div>
          </section>
        )}

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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
          {products.map(p => <ProductCard key={p.id} product={p} />)}
        </div>
      </div>
    </Layout>
  )
}
