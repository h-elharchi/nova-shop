import { createContext, useContext } from 'react'
import { useChatPresence } from '../hooks/useChatPresence'
import type { ChatAgent, ChatAgentStatus } from '../types/chat'

interface AgentContextValue {
  myStatus: ChatAgentStatus
  myPauseReasonId: string | null
  myActiveCount: number
  agents: ChatAgent[]
  waitingCount: number
  statusDuration: number
  setStatus: (status: ChatAgentStatus, pauseReasonId?: string | null) => Promise<void>
}

const AgentContext = createContext<AgentContextValue | null>(null)

export function AgentProvider({ userId, children }: { userId: string | null; children: React.ReactNode }) {
  const presence = useChatPresence(userId)
  return <AgentContext.Provider value={presence}>{children}</AgentContext.Provider>
}

export function useAgentCtx(): AgentContextValue {
  const ctx = useContext(AgentContext)
  if (!ctx) throw new Error('useAgentCtx must be used within AgentProvider')
  return ctx
}
