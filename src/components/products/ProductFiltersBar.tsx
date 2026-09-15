import { useI18n } from '../../context/LanguageContext'
import { useCategories } from '../../hooks/useCategories'
import type { ProductFilters } from '../../types'

interface ProductFiltersBarProps {
  filters: ProductFilters
  onChange: (filters: ProductFilters) => void
}

const inputCls = 'w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors'

export function ProductFiltersBar({ filters, onChange }: ProductFiltersBarProps) {
  const { t } = useI18n()
  const { categories } = useCategories()

  return (
    <div className="bg-white dark:bg-dark-card rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border p-4 space-y-4 transition-colors duration-200">
      {/* Search */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('filters.search')}</label>
        <input
          type="text"
          placeholder={t('filters.search_placeholder')}
          value={filters.search ?? ''}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className={inputCls}
        />
      </div>

      {/* Category */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('filters.filter_category')}</label>
        <select
          value={filters.categorySlug ?? ''}
          onChange={(e) => onChange({ ...filters, categorySlug: e.target.value || undefined })}
          className={inputCls}
        >
          <option value="">{t('filters.all_categories')}</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.slug}>{cat.name_fr} / {cat.name_ar}</option>
          ))}
        </select>
      </div>

      {/* Sort */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('filters.sort_price')}</label>
        <select
          value={filters.sortByPrice ?? ''}
          onChange={(e) => onChange({ ...filters, sortByPrice: (e.target.value as 'asc' | 'desc') || undefined })}
          className={inputCls}
        >
          <option value="">{t('filters.no_sort')}</option>
          <option value="asc">{t('filters.price_asc')}</option>
          <option value="desc">{t('filters.price_desc')}</option>
        </select>
      </div>

      {/* Available only */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={filters.onlyAvailable ?? false}
          onChange={(e) => onChange({ ...filters, onlyAvailable: e.target.checked || undefined })}
          className="w-4 h-4 text-blue-600 rounded accent-blue-600"
        />
        <span className="text-sm text-gray-700 dark:text-gray-300">{t('filters.available_only')}</span>
      </label>

      {/* Reset */}
      <button
        onClick={() => onChange({})}
        className="w-full text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium py-1 transition-colors"
      >
        {t('filters.reset')}
      </button>
    </div>
  )
}
