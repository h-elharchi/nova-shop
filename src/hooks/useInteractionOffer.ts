import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { InteractionWithDetails } from '../types/interactions'

function mapRow(row: Record<string, unknown>): InteractionWithDetails {
  const c = row.customers as Record<string, string | null> | null
  return {
    ...(row as unknown as InteractionWithDetails),
    customer_first_name: c?.first_name ?? null,
    customer_last_name:  c?.last_name  ?? null,
    customer_phone:      c?.phone       ?? null,
    customer_email:      c?.email       ?? null,
    customer_number:     c?.customer_number ?? null,
    agent_first_name:    null,
    agent_last_name:     null,
    disposition_code:    null,
    disposition_name_fr: null,
    disposition_name_ar: null,
  }
}

// Singleton (instancié une seule fois dans AgentProvider) : surveille les
// propositions d'interaction pour l'agent quelle que soit la page admin active,
// pour que la notification + sonnerie fonctionnent même hors de /admin/workspace.
export function useInteractionOffer(agentId: string | null) {
  const [offeredInteraction, setOfferedInteraction] = useState<InteractionWithDetails | null>(null)

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const instanceId = useRef(`${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
  const mounted    = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const refreshOffer = useCallback(async () => {
    if (!agentId) { setOfferedInteraction(null); return }
    const { data } = await supabase
      .from('interactions')
      .select(`*, customers!customer_id(first_name,last_name,phone,email,customer_number)`)
      .eq('offered_to', agentId)
      .eq('status', 'offered')
      .gt('offer_expires_at', new Date().toISOString())
      .order('offer_expires_at', { ascending: true })
      .limit(1)
    if (!mounted.current) return
    setOfferedInteraction(data?.[0] ? mapRow(data[0] as Record<string, unknown>) : null)
  }, [agentId])

  useEffect(() => { refreshOffer() }, [refreshOffer])

  useEffect(() => {
    if (!agentId) return
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    const channel = supabase
      .channel(`offer-${instanceId.current}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interactions' }, (payload) => {
        if (mounted.current) refreshOffer()
        // Nouvelle interaction en file (ou remise en file après refus/expiration/transfert) :
        // relancer la distribution tout de suite. Global (pas seulement sur /admin/workspace),
        // pour que la notification + sonnerie marchent peu importe la page admin active.
        const row = payload.new as { status?: string } | null
        if (row?.status === 'queued') supabase.rpc('route_interactions')
      })
      .subscribe()
    channelRef.current = channel
    return () => {
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null }
    }
  }, [agentId, refreshOffer])

  // Filet de sécurité indépendant du Realtime, global à toute page admin :
  // garantit que la distribution avance et que la carte/sonnerie apparaît sous
  // ~2s même si l'événement postgres_changes est raté ou retardé.
  useEffect(() => {
    if (!agentId) return
    supabase.rpc('route_interactions')
    const interval = setInterval(() => {
      supabase.rpc('route_interactions')
      refreshOffer()
    }, 2000)
    return () => clearInterval(interval)
  }, [agentId, refreshOffer])

  const acceptOffer = useCallback(async (): Promise<boolean> => {
    if (!offeredInteraction) return false
    const { error } = await supabase.rpc('accept_interaction_offer', {
      p_interaction_id: offeredInteraction.id,
    })
    if (!error) await refreshOffer()
    return !error
  }, [offeredInteraction, refreshOffer])

  const rejectOffer = useCallback(async (): Promise<boolean> => {
    if (!offeredInteraction) return false
    const { error } = await supabase.rpc('reject_interaction_offer', {
      p_interaction_id: offeredInteraction.id,
    })
    if (!error) await refreshOffer()
    return !error
  }, [offeredInteraction, refreshOffer])

  return { offeredInteraction, acceptOffer, rejectOffer }
}
