import { useState, useEffect } from 'react'
import { MessageSquare, Mail, Phone } from 'lucide-react'
import { useI18n } from '../../../context/LanguageContext'
import type { InteractionWithDetails, InteractionChannel } from '../../../types/interactions'

const CHANNEL_ICON: Record<InteractionChannel, typeof MessageSquare> = {
  chat: MessageSquare,
  email: Mail,
  callback: Phone,
}

const CHANNEL_COLOR: Record<InteractionChannel, string> = {
  chat: 'text-blue-600 dark:text-blue-400',
  email: 'text-purple-600 dark:text-purple-400',
  callback: 'text-orange-600 dark:text-orange-400',
}

// Notification globale (montée dans AgentProvider) — visible sur n'importe quelle
// page admin, pas seulement le Workspace, pour que l'agent ne rate jamais une offre.
export function OfferCard({ interaction, onAccept, onReject }: {
  interaction: InteractionWithDetails
  onAccept: () => void
  onReject: () => void
}) {
  const { t } = useI18n()
  const [secsLeft, setSecsLeft] = useState<number>(() => {
    if (!interaction.offer_expires_at) return 20
    return Math.max(0, Math.floor((new Date(interaction.offer_expires_at).getTime() - Date.now()) / 1000))
  })

  useEffect(() => {
    if (!interaction.offer_expires_at) return
    const id = setInterval(() => {
      const left = Math.max(0, Math.floor((new Date(interaction.offer_expires_at!).getTime() - Date.now()) / 1000))
      setSecsLeft(left)
      if (left === 0) clearInterval(id)
    }, 1000)
    return () => clearInterval(id)
  }, [interaction.offer_expires_at])

  const Icon = CHANNEL_ICON[interaction.channel]

  return (
    <div className="fixed top-16 inset-x-3 md:inset-x-auto md:top-4 md:right-4 z-50 md:w-80 bg-white dark:bg-dark-card rounded-2xl shadow-2xl border-2 border-blue-500 dark:border-blue-400 p-4 animate-pulse-once">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
          <Icon className={`w-4 h-4 ${CHANNEL_COLOR[interaction.channel]}`} />
          <span>{t('interactions.offer_title')}</span>
        </div>
        <span className="text-sm font-bold text-orange-500">{secsLeft}s</span>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
        {interaction.customer_first_name} {interaction.customer_last_name}
        {interaction.subject && <span className="text-gray-400"> — {interaction.subject}</span>}
      </p>
      <div className="flex gap-2">
        <button onClick={onReject}
          className="flex-1 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl">
          {t('interactions.offer_reject')}
        </button>
        <button onClick={onAccept}
          className="flex-1 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl">
          {t('interactions.offer_accept')}
        </button>
      </div>
    </div>
  )
}
