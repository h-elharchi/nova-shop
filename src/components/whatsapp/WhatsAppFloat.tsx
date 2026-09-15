import { MessageCircle } from 'lucide-react'
import { buildWhatsAppUrl } from '../../lib/whatsapp'

export function WhatsAppFloat() {
  return (
    <a
      href={buildWhatsAppUrl('Bonjour, je souhaite avoir plus d\'informations.')}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 bg-green-500 hover:bg-green-600 text-white p-4 rounded-full shadow-lg transition-all hover:scale-110 md:hidden"
      aria-label="WhatsApp"
    >
      <MessageCircle className="w-6 h-6" />
    </a>
  )
}
