import { useI18n } from '../../context/LanguageContext'
import type { OrderStatus } from '../../types'

interface Props { status: OrderStatus }

const config: Record<OrderStatus, { bg: string; text: string; key: string }> = {
  new:       { bg: 'bg-blue-100 dark:bg-blue-900/30',   text: 'text-blue-700 dark:text-blue-300',   key: 'order.status_new' },
  contacted: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', key: 'order.status_contacted' },
  confirmed: { bg: 'bg-green-100 dark:bg-green-900/30',  text: 'text-green-700 dark:text-green-300',  key: 'order.status_confirmed' },
  cancelled: { bg: 'bg-red-100 dark:bg-red-900/30',     text: 'text-red-700 dark:text-red-300',     key: 'order.status_cancelled' },
  completed: { bg: 'bg-gray-100 dark:bg-gray-700',      text: 'text-gray-600 dark:text-gray-300',   key: 'order.status_completed' },
}

export function OrderStatusBadge({ status }: Props) {
  const { t } = useI18n()
  const c = config[status] ?? config.new
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      {t(c.key)}
    </span>
  )
}
