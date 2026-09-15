export const WHATSAPP_NUMBER = '212606732531'

export function buildWhatsAppUrl(message: string): string {
  const encoded = encodeURIComponent(message)
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`
}

export function getOrderMessage(productName: string, lang: 'fr' | 'ar'): string {
  if (lang === 'ar') {
    return `السلام عليكم، أريد طلب المنتج: ${productName}.`
  }
  return `Bonjour, je souhaite commander le produit : ${productName}.`
}

export function openWhatsApp(message: string): void {
  window.open(buildWhatsAppUrl(message), '_blank', 'noopener,noreferrer')
}
