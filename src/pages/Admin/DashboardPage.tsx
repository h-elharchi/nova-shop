import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Package, CheckCircle, XCircle, Star, Sparkles, Tag, ShoppingCart, Phone } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useI18n } from '../../context/LanguageContext'
import { useOrderStats } from '../../hooks/useOrders'
import { OrderStatusBadge } from '../../components/orders/OrderStatusBadge'
import { AdminLayout } from './AdminLayout'

interface ProductStats {
  total: number
  active: number
  inactive: number
  featured: number
  new_products: number
  categories: number
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}j`
}

export function AdminDashboard() {
  const { t } = useI18n()
  const [stats, setStats] = useState<ProductStats>({ total: 0, active: 0, inactive: 0, featured: 0, new_products: 0, categories: 0 })
  const [loadingProducts, setLoadingProducts] = useState(true)
  const { stats: orderStats, recent, loading: loadingOrders } = useOrderStats()

  useEffect(() => {
    async function fetchStats() {
      const [products, categories] = await Promise.all([
        supabase.from('products').select('is_active,is_featured,is_new'),
        supabase.from('categories').select('id', { count: 'exact', head: true }),
      ])
      const p = products.data ?? []
      setStats({
        total: p.length,
        active: p.filter((x: { is_active: boolean }) => x.is_active).length,
        inactive: p.filter((x: { is_active: boolean }) => !x.is_active).length,
        featured: p.filter((x: { is_featured: boolean }) => x.is_featured).length,
        new_products: p.filter((x: { is_new: boolean }) => x.is_new).length,
        categories: categories.count ?? 0,
      })
      setLoadingProducts(false)
    }
    fetchStats()
  }, [])

  const productCards = [
    { label: t('admin.total_products'), value: stats.total, icon: <Package className="w-6 h-6 text-blue-600 dark:text-blue-400" />, bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: t('admin.active_products'), value: stats.active, icon: <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />, bg: 'bg-green-50 dark:bg-green-900/30' },
    { label: t('admin.inactive_products'), value: stats.inactive, icon: <XCircle className="w-6 h-6 text-red-500 dark:text-red-400" />, bg: 'bg-red-50 dark:bg-red-900/30' },
    { label: t('admin.featured_products'), value: stats.featured, icon: <Star className="w-6 h-6 text-amber-500 dark:text-amber-400" />, bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: t('admin.new_products'), value: stats.new_products, icon: <Sparkles className="w-6 h-6 text-purple-600 dark:text-purple-400" />, bg: 'bg-purple-50 dark:bg-purple-900/30' },
    { label: t('admin.total_categories'), value: stats.categories, icon: <Tag className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />, bg: 'bg-indigo-50 dark:bg-indigo-900/30' },
  ]

  const orderCards = [
    { label: t('order.orders_new'), value: orderStats.new, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: t('order.orders_contacted'), value: orderStats.contacted, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/30' },
    { label: t('order.orders_confirmed'), value: orderStats.confirmed, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/30' },
    { label: t('order.orders_completed'), value: orderStats.completed, color: 'text-gray-600 dark:text-gray-300', bg: 'bg-gray-100 dark:bg-gray-700/50' },
    { label: t('order.orders_cancelled'), value: orderStats.cancelled, color: 'text-red-500 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/30' },
  ]

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('admin.dashboard')}</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{t('admin.welcome')}</p>
      </div>

      {/* Product stats */}
      {loadingProducts ? (
        <div className="flex justify-center py-10">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          {productCards.map((card) => (
            <div key={card.label} className="bg-white dark:bg-dark-card rounded-2xl shadow-sm border border-gray-100 dark:border-dark-border p-5 transition-colors duration-200">
              <div className={`w-12 h-12 ${card.bg} rounded-xl flex items-center justify-center mb-3`}>
                {card.icon}
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{card.value}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{card.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Order stats */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          {t('order.orders')}
        </h2>
        <Link to="/admin/orders" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
          {t('sections.view_all')}
        </Link>
      </div>

      {loadingOrders ? (
        <div className="flex justify-center py-6">
          <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            {orderCards.map((card) => (
              <div key={card.label} className={`${card.bg} rounded-xl p-4 text-center transition-colors duration-200`}>
                <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
                <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">{card.label}</div>
              </div>
            ))}
          </div>

          {/* Recent orders */}
          {recent.length > 0 && (
            <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-dark-border shadow-sm overflow-hidden transition-colors duration-200">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-dark-border">
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{t('order.recent_orders')}</h3>
              </div>
              <ul className="divide-y divide-gray-50 dark:divide-dark-border">
                {recent.map((order) => (
                  <li key={order.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {order.customer_first_name} {order.customer_last_name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{order.product_name}</p>
                    </div>
                    <a
                      href={`tel:${order.customer_phone}`}
                      className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 shrink-0"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      {order.customer_phone}
                    </a>
                    <OrderStatusBadge status={order.status} />
                    <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{timeAgo(order.created_at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {recent.length === 0 && (
            <p className="text-center text-gray-400 dark:text-gray-500 text-sm py-6">{t('order.no_orders')}</p>
          )}
        </>
      )}
    </AdminLayout>
  )
}
