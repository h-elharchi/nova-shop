import { Header } from './Header'
import { Footer } from './Footer'
import { WhatsAppFloat } from '../whatsapp/WhatsAppFloat'
import { ChatButton } from '../chat/ChatButton'

interface LayoutProps {
  children: React.ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-dark-bg transition-colors duration-200">
      <Header />
      <main className="flex-1">
        {children}
      </main>
      <Footer />
      <WhatsAppFloat />
      <ChatButton />
    </div>
  )
}
