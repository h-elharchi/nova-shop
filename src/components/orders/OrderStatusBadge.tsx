import { useI18n } from '../../context/LanguageContext'
import type { OrderStatus } from '../../types'

interface Props { status: OrderStatus }

const config: Record<OrderStatus, { bg: string; text: string; key: string }> = {
  new:         { bg: 'bg-blue-100 dark:bg-blue-900/30',    text: 'text-blue-700 dark:text-blue-300',    key: 'order.status_new'         },
  assigned:    { bg: 'bg-indigo-100 dark:bg-indigo-900/30',text: 'text-indigo-700 dark:text-indigo-300', key: 'order.status_assigned'     },
  contacted:   { bg: 'bg-yellow-100 dark:bg-yellow-900/30',text: 'text-yellow-700 dark:text-yellow-300', key: 'order.status_contacted'    },
  unreachable: { bg: 'bg-orange-100 dark:bg-orange-900/30',text: 'text-orange-700 dark:text-orange-300', key: 'order.status_unreachable'  },
  callback:    { bg: 'bg-purple-100 dark:bg-purple-900/30',text: 'text-purple-700 dark:text-purple-300', key: 'order.status_callback'     },
  confirmed:   { bg: 'bg-green-100 dark:bg-green-900/30',  text: 'text-green-700 dark:text-green-300',   key: 'order.status_confirmed'    },
  processing:  { bg: 'bg-teal-100 dark:bg-teal-900/30',    text: 'text-teal-700 dark:text-teal-300',     key: 'order.status_processing'   },
  shipped:     { bg: 'bg-cyan-100 dark:bg-cyan-900/30',    text: 'text-cyan-700 dark:text-cyan-300',     key: 'order.status_shipped'      },
  delivered:   { bg: 'bg-emerald-100 dark:bg-emerald-900/30',text:'text-emerald-700 dark:text-emerald-300',key:'order.status_delivered'   },
  returned:    { bg: 'bg-rose-100 dark:bg-rose-900/30',    text: 'text-rose-700 dark:text-rose-300',     key: 'order.status_returned'     },
  cancelled:   { bg: 'bg-red-100 dark:bg-red-900/30',      text: 'text-red-700 dark:text-red-300',       key: 'order.status_cancelled'    },
  on_hold:     { bg: 'bg-gray-100 dark:bg-gray-700',       text: 'text-gray-600 dark:text-gray-300',     key: 'order.status_on_hold'      },
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
