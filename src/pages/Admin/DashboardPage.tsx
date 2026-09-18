import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Package, CheckCircle, XCircle, Star, Sparkles, Tag, ShoppingCart, Phone } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useI18n } from '../../context/LanguageContext'
import { useOrderStats } from '../../hooks/useOrders'
import { OrderStatusBadge } from '../../components/orders/OrderStatusBadge'
import { AdminLayout } from './AdminLayout'
import type { OrderStatus } from '../../types'

const STATUS_CONFIG: Record<OrderStatus, { bg: string; text: string; border: string }> = {
  new:         { bg: 'bg-blue-50 dark:bg-blue-900/20',      text: 'text-blue-700 dark:text-blue-300',      border: 'border-blue-100 dark:border-blue-800/40' },
  assigned:    { bg: 'bg-indigo-50 dark:bg-indigo-900/20',  text: 'text-indigo-700 dark:text-indigo-300',  border: 'border-indigo-100 dark:border-indigo-800/40' },
  contacted:   { bg: 'bg-yellow-50 dark:bg-yellow-900/20',  text: 'text-yellow-700 dark:text-yellow-300',  border: 'border-yellow-100 dark:border-yellow-800/40' },
  unreachable: { bg: 'bg-orange-50 dark:bg-orange-900/20',  text: 'text-orange-700 dark:text-orange-300',  border: 'border-orange-100 dark:border-orange-800/40' },
  callback:    { bg: 'bg-purple-50 dark:bg-purple-900/20',  text: 'text-purple-700 dark:text-purple-300',  border: 'border-purple-100 dark:border-purple-800/40' },
  confirmed:   { bg: 'bg-green-50 dark:bg-green-900/20',    text: 'text-green-700 dark:text-green-300',    border: 'border-green-100 dark:border-green-800/40' },
  processing:  { bg: 'bg-teal-50 dark:bg-teal-900/20',      text: 'text-teal-700 dark:text-teal-300',      border: 'border-teal-100 dark:border-teal-800/40' },
  shipped:     { bg: 'bg-cyan-50 dark:bg-cyan-900/20',      text: 'text-cyan-700 dark:text-cyan-300',      border: 'border-cyan-100 dark:border-cyan-800/40' },
  delivered:   { bg: 'bg-emerald-50 dark:bg-emerald-900/20',text: 'text-emerald-700 dark:text-emerald-300',border: 'border-emerald-100 dark:border-emerald-800/40' },
  returned:    { bg: 'bg-rose-50 dark:bg-rose-900/20',      text: 'text-rose-700 dark:text-rose-300',      border: 'border-rose-100 dark:border-rose-800/40' },
  cancelled:   { bg: 'bg-red-50 dark:bg-red-900/20',        text: 'text-red-700 dark:text-red-300',        border: 'border-red-100 dark:border-red-800/40' },
  on_hold:     { bg: 'bg-gray-50 dark:bg-gray-700/30',      text: 'text-gray-600 dark:text-gray-300',      border: 'border-gray-100 dark:border-gray-700' },
}

const STATUS_ORDER: OrderStatus[] = [
  'new', 'assigned', 'contacted', 'unreachable', 'callback',
  'confirmed', 'processing', 'shipped', 'delivered',
  'returned', 'cancelled', 'on_hold',
]

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
  const { byStatus, recent, loading: loadingOrders } = useOrderStats()

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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3 mb-6">
            {STATUS_ORDER.map(status => {
              const cfg = STATUS_CONFIG[status]
              return (
                <Link
                  key={status}
                  to={`/admin/orders?status=${status}`}
                  className={`${cfg.bg} border ${cfg.border} rounded-xl p-4 text-center transition-all duration-200 hover:scale-[1.02] hover:shadow-sm`}
                >
                  <div className={`text-2xl font-bold ${cfg.text}`}>{byStatus[status]}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">{t(`order.status_${status}`)}</div>
                </Link>
              )
            })}
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
