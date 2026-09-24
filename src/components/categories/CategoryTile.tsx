import { Link } from 'react-router-dom'
import { useI18n } from '../../context/LanguageContext'
import type { Category } from '../../types'

export function CategoryTile({ category }: { category: Category }) {
  const { lang } = useI18n()
  const name = lang === 'ar' ? category.name_ar : category.name_fr

  return (
    <Link
      to={`/categories/${category.slug}`}
      className="bg-white dark:bg-dark-card rounded-2xl shadow-sm hover:shadow-md dark:hover:shadow-black/20 transition-all duration-200 border border-gray-100 dark:border-dark-border overflow-hidden group"
    >
      {category.image_url ? (
        <div className="aspect-video overflow-hidden">
          <img
            src={category.image_url}
            alt={name}
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
          {name}
        </h2>
      </div>
    </Link>
  )
}
