import { MessageCircle } from 'lucide-react'
import { useI18n } from '../../context/LanguageContext'
import { openWhatsApp, getOrderMessage } from '../../lib/whatsapp'
import type { Language } from '../../types'

interface WhatsAppButtonProps {
  productName?: string
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
}

export function WhatsAppButton({ productName, size = 'md', fullWidth = false }: WhatsAppButtonProps) {
  const { t, lang } = useI18n()

  const handleClick = () => {
    const message = productName
      ? getOrderMessage(productName, lang as Language)
      : 'Bonjour, je souhaite avoir plus d\'informations.'
    openWhatsApp(message)
  }

  const sizeClasses = {
    sm: 'text-sm px-3 py-1.5 gap-1.5',
    md: 'text-sm px-4 py-2 gap-2',
    lg: 'text-base px-6 py-3 gap-2',
  }

  const iconSize = {
    sm: 'w-4 h-4',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  }

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center justify-center bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-colors ${sizeClasses[size]} ${fullWidth ? 'w-full' : ''}`}
    >
      <MessageCircle className={iconSize[size]} />
      <span>{productName ? t('product.order_whatsapp') : t('footer.whatsapp')}</span>
    </button>
  )
}
