import { MessageCircle } from 'lucide-react'
import { buildWhatsAppUrl } from '../../lib/whatsapp'

export function WhatsAppFloat() {
  return (
    <a
      href={buildWhatsAppUrl('Bonjour, je souhaite avoir plus d\'informations.')}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-20 right-4 z-50 bg-green-500 hover:bg-green-600 text-white p-3.5 rounded-full shadow-lg transition-all hover:scale-110 md:hidden"
      aria-label="WhatsApp"
    >
      <MessageCircle className="w-6 h-6" />
    </a>
  )
}
