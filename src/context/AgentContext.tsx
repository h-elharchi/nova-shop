import { createContext, useContext } from 'react'
import { useChatPresence } from '../hooks/useChatPresence'
import { useInteractionOffer } from '../hooks/useInteractionOffer'
import { useRingtone } from '../hooks/useRingtone'
import { OfferCard } from '../components/chat/admin/OfferCard'
import type { ChatAgent, ChatAgentStatus } from '../types/chat'
import type { InteractionWithDetails } from '../types/interactions'

interface AgentContextValue {
  myStatus: ChatAgentStatus
  myPauseReasonId: string | null
  myActiveCount: number
  agents: ChatAgent[]
  waitingCount: number
  statusDuration: number
  setStatus: (status: ChatAgentStatus, pauseReasonId?: string | null) => Promise<void>
  offeredInteraction: InteractionWithDetails | null
  acceptOffer: () => Promise<boolean>
  rejectOffer: () => Promise<boolean>
}

const AgentContext = createContext<AgentContextValue | null>(null)

export function AgentProvider({ userId, children }: { userId: string | null; children: React.ReactNode }) {
  const presence = useChatPresence(userId)
  const offer = useInteractionOffer(userId)

  // Sonnerie + notification globales : actives quelle que soit la page admin
  // affichée, pas seulement /admin/workspace.
  useRingtone(!!offer.offeredInteraction)

  const value: AgentContextValue = { ...presence, ...offer }

  return (
    <AgentContext.Provider value={value}>
      {children}
      {offer.offeredInteraction && (
        <OfferCard
          interaction={offer.offeredInteraction}
          onAccept={offer.acceptOffer}
          onReject={offer.rejectOffer}
        />
      )}
    </AgentContext.Provider>
  )
}

export function useAgentCtx(): AgentContextValue {
  const ctx = useContext(AgentContext)
  if (!ctx) throw new Error('useAgentCtx must be used within AgentProvider')
  return ctx
}
