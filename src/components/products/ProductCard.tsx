import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../context/LanguageContext'
import { WhatsAppButton } from '../whatsapp/WhatsAppButton'
import { OrderModal } from '../orders/OrderModal'
import type { Product } from '../../types'

interface ProductCardProps {
  product: Product
}

export function ProductCard({ product }: ProductCardProps) {
  const { t, lang } = useI18n()
  const [showOrder, setShowOrder] = useState(false)

  const name = lang === 'ar' ? product.name_ar : product.name_fr
  const mainImage = product.images?.[0]?.image_url

  const discount = product.old_price && product.old_price > product.price
    ? Math.round(((product.old_price - product.price) / product.old_price) * 100)
    : null

  return (
    <>
      <div className="bg-white dark:bg-dark-card rounded-2xl shadow-sm hover:shadow-md dark:hover:shadow-lg dark:hover:shadow-black/20 transition-all duration-200 border border-gray-100 dark:border-dark-border overflow-hidden group">
        {/* Image */}
        <Link to={`/products/${product.slug}`} className="block relative">
          <div className="aspect-square bg-gray-100 dark:bg-gray-800 overflow-hidden">
            {mainImage ? (
              <img
                src={mainImage}
                alt={name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-600">
                <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
          </div>

          {/* Badges */}
          <div className="absolute top-1.5 left-1.5 flex flex-col gap-0.5">
            {product.is_new && (
              <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {t('product.new_badge')}
              </span>
            )}
            {product.is_featured && (
              <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {t('product.popular_badge')}
              </span>
            )}
            {discount && (
              <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                -{discount}%
              </span>
            )}
          </div>

          {!product.stock_available && (
            <div className="absolute inset-0 bg-white/70 dark:bg-black/60 flex items-center justify-center">
              <span className="bg-gray-800 dark:bg-gray-900 text-white text-xs font-medium px-2.5 py-1 rounded-full">
                {t('product.unavailable')}
              </span>
            </div>
          )}
        </Link>

        {/* Info */}
        <div className="p-2 sm:p-3">
          <div className="text-[10px] sm:text-xs text-blue-600 dark:text-blue-400 font-medium mb-0.5 truncate">
            {lang === 'ar' ? product.category?.name_ar : product.category?.name_fr}
          </div>
          <Link to={`/products/${product.slug}`}>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-xs sm:text-sm leading-snug mb-1 line-clamp-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              {name}
            </h3>
          </Link>

          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            <span className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">
              {product.price.toLocaleString()} {t('common.mad')}
            </span>
            {product.old_price && (
              <span className="text-xs text-gray-400 dark:text-gray-500 line-through">
                {product.old_price.toLocaleString()}
              </span>
            )}
          </div>

          {/* Buttons */}
          <div className="flex flex-col gap-1.5">
            {product.stock_available && (
              <button
                onClick={() => setShowOrder(true)}
                className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-semibold text-xs sm:text-sm py-1.5 sm:py-2 rounded-lg transition-colors"
              >
                {t('order.btn')}
              </button>
            )}
            <WhatsAppButton productName={name} size="xs" fullWidth />
          </div>
        </div>
      </div>

      {showOrder && <OrderModal product={product} onClose={() => setShowOrder(false)} />}
    </>
  )
}
