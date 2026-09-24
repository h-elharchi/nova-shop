import { Link } from 'react-router-dom'
import { ArrowRight, Truck, MessageCircle, Shield, Star } from 'lucide-react'
import { useI18n } from '../../context/LanguageContext'
import { useProducts } from '../../hooks/useProducts'
import { useCategories } from '../../hooks/useCategories'
import { getTopLevel } from '../../lib/categories'
import { ProductCard } from '../../components/products/ProductCard'
import { WhatsAppButton } from '../../components/whatsapp/WhatsAppButton'
import { Layout } from '../../components/layout/Layout'

export function HomePage() {
  const { t, lang, isRTL } = useI18n()
  const { products: newProducts } = useProducts({ onlyAvailable: undefined })
  const { products: featuredProducts } = useProducts({})
  const { categories: allCategories } = useCategories()
  const categories = getTopLevel(allCategories)

  const newItems = newProducts.filter(p => p.is_new).slice(0, 10)
  const featured = featuredProducts.filter(p => p.is_featured).slice(0, 10)

  return (
    <Layout>
      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-600 to-blue-800 dark:from-blue-900 dark:to-dark-surface text-white py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className={`text-4xl md:text-5xl font-bold mb-4 ${isRTL ? 'font-arabic' : ''}`}>
            {t('hero.title')}
          </h1>
          <p className={`text-xl text-blue-100 mb-8 ${isRTL ? 'font-arabic' : ''}`}>
            {t('hero.subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/products"
              className="inline-flex items-center justify-center gap-2 bg-white text-blue-600 font-semibold px-8 py-4 rounded-xl hover:bg-blue-50 transition-colors"
            >
              {t('hero.cta')}
              <ArrowRight className={`w-5 h-5 ${isRTL ? 'rotate-180' : ''}`} />
            </Link>
            <WhatsAppButton size="lg" />
          </div>
        </div>
      </section>

      {/* New arrivals */}
      {newItems.length > 0 && (
        <section className="py-16 px-4 bg-gray-50 dark:bg-dark-surface transition-colors duration-200">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('sections.new_arrivals')}</h2>
              <Link to="/products" className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium transition-colors">
                {t('sections.view_all')}
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
              {newItems.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          </div>
        </section>
      )}

      {/* Featured */}
      {featured.length > 0 && (
        <section className="py-16 px-4 bg-white dark:bg-dark-bg transition-colors duration-200">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('sections.popular_products')}</h2>
              <Link to="/products" className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium transition-colors">
                {t('sections.view_all')}
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
              {featured.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          </div>
        </section>
      )}

      {/* Categories */}
      {categories.length > 0 && (
        <section className="py-16 px-4 bg-gray-50 dark:bg-dark-surface transition-colors duration-200">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">{t('sections.categories')}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {categories.map(cat => (
                <Link
                  key={cat.id}
                  to={`/categories/${cat.slug}`}
                  className="bg-white dark:bg-dark-card rounded-2xl p-6 text-center shadow-sm hover:shadow-md dark:hover:shadow-black/20 transition-all duration-200 border border-gray-100 dark:border-dark-border group"
                >
                  {cat.image_url && (
                    <img
                      src={cat.image_url}
                      alt={lang === 'ar' ? cat.name_ar : cat.name_fr}
                      className="w-16 h-16 object-cover rounded-xl mx-auto mb-3"
                      loading="lazy"
                    />
                  )}
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {lang === 'ar' ? cat.name_ar : cat.name_fr}
                  </h3>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Why NOVA SHOP */}
      <section className="py-16 px-4 bg-white dark:bg-dark-bg transition-colors duration-200">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-12">{t('sections.why_nova')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: <Truck className="w-8 h-8 text-blue-600 dark:text-blue-400" />, title: t('sections.delivery'), desc: lang === 'ar' ? 'توصيل سريع وموثوق في جميع مدن المغرب' : 'Livraison rapide et fiable dans tout le Maroc' },
              { icon: <MessageCircle className="w-8 h-8 text-green-500 dark:text-green-400" />, title: t('sections.easy_order'), desc: lang === 'ar' ? 'اطلب منتجك ببساطة عبر واتساب' : 'Commandez facilement via WhatsApp en quelques secondes' },
              { icon: <Shield className="w-8 h-8 text-amber-500 dark:text-amber-400" />, title: lang === 'ar' ? 'منتجات موثوقة' : 'Produits sélectionnés', desc: lang === 'ar' ? 'نختار أفضل المنتجات بعناية لضمان رضاك' : 'Chaque produit est sélectionné avec soin pour votre satisfaction' },
            ].map((item, i) => (
              <div key={i} className="text-center p-6 bg-white dark:bg-dark-card rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border transition-colors duration-200">
                <div className="flex justify-center mb-4">{item.icon}</div>
                <h3 className="font-bold text-gray-900 dark:text-white mb-2">{item.title}</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-16 px-4 bg-green-500 dark:bg-green-900">
        <div className="max-w-3xl mx-auto text-center">
          <Star className="w-12 h-12 text-white mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-4">
            {lang === 'ar' ? 'اطلب الآن عبر واتساب' : 'Commandez maintenant sur WhatsApp'}
          </h2>
          <p className="text-green-100 mb-8">
            {lang === 'ar' ? 'نحن متاحون للرد على استفساراتك' : 'Nous sommes disponibles pour répondre à toutes vos questions'}
          </p>
          <WhatsAppButton size="lg" />
        </div>
      </section>
    </Layout>
  )
}
