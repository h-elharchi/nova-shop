import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useI18n } from '../../context/LanguageContext'
import { useProduct } from '../../hooks/useProduct'
import { WhatsAppButton } from '../../components/whatsapp/WhatsAppButton'
import { OrderModal } from '../../components/orders/OrderModal'
import { Layout } from '../../components/layout/Layout'
import type { ProductImage, ProductVideo } from '../../types'

type MediaItem =
  | { type: 'image'; data: ProductImage }
  | { type: 'video'; data: ProductVideo }

export function ProductDetailsPage() {
  const { slug = '' } = useParams()
  const { t, lang, isRTL } = useI18n()
  const { product, loading, error } = useProduct(slug)
  const [activeIndex, setActiveIndex] = useState(0)
  const [showOrder, setShowOrder] = useState(false)

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    )
  }

  if (error || !product) {
    return (
      <Layout>
        <div className="text-center py-20 text-gray-400 dark:text-gray-500">{t('common.error')}</div>
      </Layout>
    )
  }

  const name = lang === 'ar' ? product.name_ar : product.name_fr
  const description = lang === 'ar' ? product.description_ar : product.description_fr

  const mediaItems: MediaItem[] = [
    ...(product.images ?? []).map(img => ({ type: 'image' as const, data: img })),
    ...(product.videos ?? []).map(vid => ({ type: 'video' as const, data: vid })),
  ]
  const activeMedia = mediaItems[activeIndex]

  const discount = product.old_price && product.old_price > product.price
    ? Math.round(((product.old_price - product.price) / product.old_price) * 100)
    : null

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          to="/products"
          className={`inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 mb-6 transition-colors ${isRTL ? 'flex-row-reverse' : ''}`}
        >
          <ArrowLeft className={`w-4 h-4 ${isRTL ? 'rotate-180' : ''}`} />
          {t('product.back_to_products')}
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Gallery */}
          <div>
            <div className="aspect-square bg-gray-100 dark:bg-gray-800 rounded-2xl overflow-hidden mb-3">
              {!activeMedia && (
                <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-600">
                  <svg className="w-24 h-24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
              {activeMedia?.type === 'image' && (
                <img src={activeMedia.data.image_url} alt={name} className="w-full h-full object-cover" />
              )}
              {activeMedia?.type === 'video' && (
                <video src={activeMedia.data.video_url} controls className="w-full h-full object-contain bg-black" playsInline />
              )}
            </div>
            {mediaItems.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {mediaItems.map((item, i) => (
                  <button
                    key={item.data.id}
                    onClick={() => setActiveIndex(i)}
                    className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${
                      i === activeIndex
                        ? 'border-blue-500'
                        : 'border-gray-200 dark:border-gray-600'
                    }`}
                  >
                    {item.type === 'image'
                      ? <img src={item.data.image_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full bg-gray-800 flex items-center justify-center text-white text-xs">▶</div>
                    }
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product info */}
          <div>
            <div className="text-sm text-blue-600 dark:text-blue-400 font-medium mb-2">
              {lang === 'ar' ? product.category?.name_ar : product.category?.name_fr}
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-4">{name}</h1>

            <div className="flex flex-wrap gap-2 mb-4">
              {product.is_new && (
                <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-bold px-3 py-1 rounded-full">
                  {t('product.new_badge')}
                </span>
              )}
              {product.is_featured && (
                <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-bold px-3 py-1 rounded-full">
                  {t('product.popular_badge')}
                </span>
              )}
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                product.stock_available
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
              }`}>
                {product.stock_available ? t('product.available') : t('product.unavailable')}
              </span>
            </div>

            <div className="flex items-baseline gap-3 mb-6">
              <span className="text-3xl font-bold text-gray-900 dark:text-white">
                {product.price.toLocaleString()} {t('common.mad')}
              </span>
              {product.old_price && (
                <>
                  <span className="text-xl text-gray-400 dark:text-gray-500 line-through">
                    {product.old_price.toLocaleString()}
                  </span>
                  {discount && (
                    <span className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm font-bold px-2 py-0.5 rounded-full">
                      -{discount}%
                    </span>
                  )}
                </>
              )}
            </div>

            {/* CTA */}
            <div className="flex flex-col gap-3">
              {product.stock_available && (
                <button
                  onClick={() => setShowOrder(true)}
                  className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-bold py-4 rounded-xl transition-colors text-base"
                >
                  {t('order.btn')}
                </button>
              )}
              <WhatsAppButton productName={name} size="lg" fullWidth />
            </div>

            {description && (
              <div className="mt-8">
                <h2 className="font-semibold text-gray-900 dark:text-white mb-3">{t('product.description')}</h2>
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{description}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showOrder && <OrderModal product={product} onClose={() => setShowOrder(false)} />}
    </Layout>
  )
}
