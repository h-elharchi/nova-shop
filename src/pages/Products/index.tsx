import { useState } from 'react'
import { useI18n } from '../../context/LanguageContext'
import { useProducts } from '../../hooks/useProducts'
import { ProductCard } from '../../components/products/ProductCard'
import { ProductFiltersBar } from '../../components/products/ProductFiltersBar'
import { Layout } from '../../components/layout/Layout'
import type { ProductFilters } from '../../types'
import { SlidersHorizontal, X } from 'lucide-react'

export function ProductsPage() {
  const { t } = useI18n()
  const [filters, setFilters] = useState<ProductFilters>({})
  const [showFilters, setShowFilters] = useState(false)
  const { products, loading, error } = useProducts(filters)

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('nav.products')}</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{products.length} {t('nav.products').toLowerCase()}</p>
        </div>

        {/* Mobile filter toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="md:hidden flex items-center gap-2 mb-4 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-lg px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          {showFilters ? <X className="w-4 h-4" /> : <SlidersHorizontal className="w-4 h-4" />}
          {t('filters.search')}
        </button>

        <div className="flex gap-6">
          {/* Sidebar filters */}
          <aside className={`w-64 shrink-0 ${showFilters ? 'block' : 'hidden'} md:block`}>
            <ProductFiltersBar filters={filters} onChange={setFilters} />
          </aside>

          {/* Products grid */}
          <div className="flex-1">
            {loading && (
              <div className="flex justify-center py-20">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {error && (
              <div className="text-center py-20">
                <p className="text-red-500 font-medium mb-2">{t('common.error')}</p>
                <p className="text-red-400 text-sm font-mono bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded-lg inline-block">{error}</p>
              </div>
            )}
            {!loading && !error && products.length === 0 && (
              <div className="text-center py-20 text-gray-400 dark:text-gray-500">{t('common.no_products')}</div>
            )}
            {!loading && !error && products.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                {products.map(p => <ProductCard key={p.id} product={p} />)}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  )
}
