import { useEffect, useState } from 'react'
import { User, ShoppingBag, MessageSquare, Clock } from 'lucide-react'
import { useI18n } from '../../../context/LanguageContext'
import { loadClientCard360 } from '../../../lib/chat'
import type { ClientCard360 as ClientCard360Type } from '../../../types/chat'

interface ClientCard360Props {
  phone: string
  firstName: string
  lastName: string
}

const statusBadge: Record<string, string> = {
  closed:  'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
  active:  'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  timeout: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  waiting: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
}

const orderBadge: Record<string, string> = {
  completed: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  cancelled: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  confirmed: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  new:       'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
}

export function ClientCard360({ phone, firstName, lastName }: ClientCard360Props) {
  const { t } = useI18n()
  const [card, setCard] = useState<ClientCard360Type | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setCard(null)
    loadClientCard360(phone).then(data => {
      setCard(data)
      setLoading(false)
    })
  }, [phone])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-5 overflow-y-auto h-full">
      {/* Client header */}
      <div className="flex items-center gap-3 pb-3 border-b border-gray-100 dark:border-dark-border">
        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
          <User className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <div className="font-semibold text-gray-900 dark:text-white text-sm">{firstName} {lastName}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500">{phone}</div>
        </div>
      </div>

      {/* Orders */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <ShoppingBag className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
            {t('chat.admin_card_orders')}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
            {card?.orders?.length ?? 0}
          </span>
        </div>
        {!card?.orders?.length ? (
          <p className="text-xs text-gray-400 dark:text-gray-500 pl-6">{t('chat.admin_card_no_orders')}</p>
        ) : (
          <div className="space-y-1.5">
            {card.orders.slice(0, 6).map(o => (
              <div key={o.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-medium text-gray-900 dark:text-white truncate">{o.product_name}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{o.product_price} MAD</span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-xs text-gray-400 dark:text-gray-500">{new Date(o.created_at).toLocaleDateString()}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${orderBadge[o.status] ?? orderBadge.new}`}>{o.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Conversation history */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
            {t('chat.admin_card_history')}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
            {card?.conversations?.length ?? 0}
          </span>
        </div>
        {!card?.conversations?.length ? (
          <p className="text-xs text-gray-400 dark:text-gray-500 pl-6">{t('chat.admin_card_no_history')}</p>
        ) : (
          <div className="space-y-1.5">
            {card.conversations.slice(0, 6).map(c => (
              <div key={c.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusBadge[c.status] ?? statusBadge.closed}`}>
                    {c.status}
                  </span>
                  <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                    <Clock className="w-3 h-3" />
                    {new Date(c.created_at).toLocaleDateString()}
                  </div>
                </div>
                {c.internal_notes && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 break-words">{c.internal_notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
