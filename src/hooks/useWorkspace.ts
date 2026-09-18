import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { InteractionWithDetails, InteractionChannel, UnifiedWrapUpData } from '../types/interactions'

// État principal du workspace (singleton via WorkspaceProvider dans App.tsx)
export function useWorkspace(agentId: string | null) {
  const [activeInteraction, setActiveInteraction] = useState<InteractionWithDetails | null>(null)
  const [myInteractions, setMyInteractions]       = useState<InteractionWithDetails[]>([])
  const [queueCounts, setQueueCounts]             = useState({ chat: 0, email: 0, callback: 0, total: 0 })
  const [loading, setLoading]                     = useState(true)

  const channelRef   = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const instanceId   = useRef(`${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
  const mounted      = useRef(true)
  const activatingRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [])

  const mapRow = (row: Record<string, unknown>): InteractionWithDetails => {
    const c = row.customers as Record<string, string | null> | null
    const d = row.crc_disposition_codes as Record<string, string | null> | null
    return {
      ...(row as unknown as InteractionWithDetails),
      customer_first_name: c?.first_name ?? null,
      customer_last_name:  c?.last_name  ?? null,
      customer_phone:      c?.phone       ?? null,
      customer_email:      c?.email       ?? null,
      customer_number:     c?.customer_number ?? null,
      agent_first_name:    null,
      agent_last_name:     null,
      disposition_code:    d?.code        ?? null,
      disposition_name_fr: d?.name_fr     ?? null,
      disposition_name_ar: d?.name_ar     ?? null,
    }
  }

  const refreshMine = useCallback(async () => {
    if (!agentId) return

    const mineRes = await supabase
      .from('interactions')
      .select(`*, customers!customer_id(first_name,last_name,phone,email,customer_number), crc_disposition_codes!disposition_code_id(code,name_fr,name_ar)`)
      .eq('assigned_agent_id', agentId)
      .in('status', ['assigned', 'active', 'pending_customer', 'wrap_up'])
      .order('assigned_at', { ascending: true })

    if (!mounted.current) return

    // Pas d'étape "Activer" manuelle : toute interaction qui m'est assignée
    // (offre acceptée, ou assignation directe en mode "direct") passe aussitôt en
    // "active" pour que je puisse la traiter tout de suite ; je clôture avec "Terminer".
    const mapped = (mineRes.data ?? []).map(mapRow).map(i => {
      if (i.status === 'assigned' && !activatingRef.current.has(i.id)) {
        activatingRef.current.add(i.id)
        const done = () => activatingRef.current.delete(i.id)
        supabase.rpc('activate_interaction', { p_interaction_id: i.id }).then(done, done)
        return { ...i, status: 'active' as const }
      }
      return i
    })
    setMyInteractions(mapped)

    // Mettre à jour l'interaction active si elle est dans la liste
    setActiveInteraction(prev => {
      if (!prev) return null
      const updated = mapped.find(i => i.id === prev.id)
      return updated ?? null
    })
    setLoading(false)
  }, [agentId]) // eslint-disable-line

  const refreshQueue = useCallback(async () => {
    const { data } = await supabase
      .from('interactions')
      .select('channel')
      .eq('status', 'queued')

    if (!mounted.current || !data) return
    const counts = { chat: 0, email: 0, callback: 0, total: 0 }
    ;(data as { channel: InteractionChannel }[]).forEach(r => {
      counts[r.channel]++
      counts.total++
    })
    setQueueCounts(counts)
  }, [])

  const refresh = useCallback(async () => {
    await Promise.all([refreshMine(), refreshQueue()])
  }, [refreshMine, refreshQueue])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    if (!agentId) return
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    const channel = supabase
      .channel(`workspace-${instanceId.current}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interactions' }, (payload) => {
        if (mounted.current) refresh()
        // Nouvelle interaction en file (ou remise en file après refus/expiration/transfert) :
        // relancer la distribution tout de suite plutôt que d'attendre le prochain tick.
        const row = payload.new as { status?: string } | null
        if (row?.status === 'queued') supabase.rpc('route_interactions')
      })
      .subscribe()
    channelRef.current = channel
    return () => {
      if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null }
    }
  }, [agentId, refresh])

  // Filet de sécurité : relance la distribution périodiquement, en complément du
  // déclenchement réactif ci-dessus (Realtime) et du cron serveur, au cas où l'un
  // des deux manquerait un événement. Court intervalle pour garder la notification
  // sous ~2s même si le relais Realtime est raté.
  useEffect(() => {
    if (!agentId) return
    supabase.rpc('route_interactions')
    const interval = setInterval(() => {
      supabase.rpc('route_interactions')
    }, 2000)
    return () => clearInterval(interval)
  }, [agentId])

  const openInteraction = useCallback((interaction: InteractionWithDetails) => {
    setActiveInteraction(interaction)
  }, [])

  const closePanel = useCallback(() => {
    setActiveInteraction(null)
  }, [])

  const startWrapUp = useCallback(async (id: string): Promise<boolean> => {
    const { error } = await supabase.rpc('start_wrap_up', { p_interaction_id: id })
    if (!error) await refresh()
    return !error
  }, [refresh])

  const closeInteraction = useCallback(async (
    id: string,
    wrapUp: UnifiedWrapUpData,
  ): Promise<boolean> => {
    const { error } = await supabase.rpc('close_interaction', {
      p_interaction_id:  id,
      p_outcome:         wrapUp.outcome,
      p_disposition_id:  wrapUp.dispositionId,
      p_notes:           wrapUp.notes || null,
      p_reschedule_at:   wrapUp.rescheduleAt,
      p_return_to_queue: wrapUp.continuation === 'requeue',
    })
    if (!error) {
      await refresh()
      setActiveInteraction(null)
    }
    return !error
  }, [refresh])

  const transferInteraction = useCallback(async (
    id: string,
    targetAgentId: string,
    note?: string,
  ): Promise<boolean> => {
    const { error } = await supabase.rpc('transfer_interaction', {
      p_interaction_id:  id,
      p_target_agent_id: targetAgentId,
      p_note:            note ?? null,
    })
    if (!error) {
      await refresh()
      setActiveInteraction(null)
    }
    return !error
  }, [refresh])

  return {
    activeInteraction,
    myInteractions,
    queueCounts,
    loading,
    openInteraction,
    closePanel,
    startWrapUp,
    closeInteraction,
    transferInteraction,
    refresh,
  }
}
