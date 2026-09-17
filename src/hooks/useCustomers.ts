import { useState, useCallback, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { CustomerView, CustomerAddress, AuditLogEntry } from '../types/interactions'

export interface CustomerFilters {
  search?: string
  status?: 'active' | 'archived' | 'blocked' | 'all'
  page?: number
  pageSize?: number
}

export function useCustomers(filters: CustomerFilters = {}) {
  const [customers, setCustomers] = useState<CustomerView[]>([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)

    const page     = filters.page     ?? 1
    const pageSize = filters.pageSize ?? 30
    const from     = (page - 1) * pageSize
    const to       = from + pageSize - 1

    let query = supabase
      .from('customers_view')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    const statusFilter = filters.status ?? 'active'
    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    } else {
      // Exclure anonymisés et merged par défaut
      query = query.not('status', 'in', '("anonymized","merged")')
    }

    if (filters.search?.trim()) {
      const s = `%${filters.search.trim()}%`
      query = query.or(
        `first_name.ilike.${s},last_name.ilike.${s},phone.ilike.${s},email.ilike.${s},customer_number.ilike.${s}`
      )
    }

    const { data, error: err, count } = await query
    if (!mounted.current) return
    if (err) { setError(err.message) } else {
      setCustomers((data ?? []) as CustomerView[])
      setTotal(count ?? 0)
    }
    setLoading(false)
  }, [filters.search, filters.status, filters.page, filters.pageSize])

  useEffect(() => { fetch() }, [fetch])

  const updateNotes = useCallback(async (customerId: string, notes: string): Promise<boolean> => {
    const { error: err } = await supabase
      .from('customers')
      .update({ notes })
      .eq('id', customerId)
    if (!err) setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, notes } : c))
    return !err
  }, [])

  const updateCustomer = useCallback(async (
    customerId: string,
    updates: Partial<Pick<CustomerView, 'first_name' | 'last_name' | 'phone' | 'phone2' | 'whatsapp_phone' | 'email' | 'email2' | 'preferred_lang' | 'tags' | 'notes'>>,
    version: number,
  ): Promise<boolean> => {
    const { data, error: err } = await supabase
      .from('customers')
      .update(updates)
      .eq('id', customerId)
      .eq('version', version)
      .select('version')
      .single()

    if (err || !data) return false
    setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, ...updates, version: (data as { version: number }).version } : c))
    return true
  }, [])

  const createCustomer = useCallback(async (
    phone: string,
    firstName: string,
    lastName: string,
    email?: string,
    source?: string,
  ): Promise<CustomerView | null> => {
    const { data, error: err } = await supabase
      .from('customers')
      .insert({
        phone,
        first_name: firstName,
        last_name:  lastName,
        email:      email ?? null,
        source:     source ?? 'phone',
      })
      .select('*')
      .single()

    if (err) return null
    await fetch()
    return data as CustomerView
  }, [fetch])

  const archiveCustomer = useCallback(async (customerId: string, reason?: string): Promise<boolean> => {
    const { error: err } = await supabase.rpc('archive_customer', {
      p_customer_id: customerId,
      p_reason:      reason ?? null,
    })
    if (!err) await fetch()
    return !err
  }, [fetch])

  const restoreCustomer = useCallback(async (customerId: string): Promise<boolean> => {
    const { error: err } = await supabase.rpc('restore_customer', {
      p_customer_id: customerId,
    })
    if (!err) await fetch()
    return !err
  }, [fetch])

  const deleteCustomer = useCallback(async (
    customerId: string,
    reason: string,
  ): Promise<'deleted' | 'anonymized' | null> => {
    const { data, error: err } = await supabase.rpc('delete_customer', {
      p_customer_id: customerId,
      p_reason:      reason,
    })
    if (err) return null
    await fetch()
    return data as 'deleted' | 'anonymized'
  }, [fetch])

  const checkDuplicate = useCallback(async (
    phone: string,
    email?: string,
    excludeId?: string,
  ) => {
    const { data } = await supabase.rpc('check_customer_duplicate', {
      p_phone:      phone,
      p_email:      email ?? null,
      p_exclude_id: excludeId ?? null,
    })
    return data as { customer_id: string; customer_number: string; first_name: string; last_name: string; status: string }[] | null
  }, [])

  const findByPhone = useCallback(async (phone: string): Promise<CustomerView | null> => {
    const { data } = await supabase
      .from('customers_view')
      .select('*')
      .eq('phone', phone)
      .single()
    return (data as CustomerView | null)
  }, [])

  return {
    customers,
    total,
    loading,
    error,
    refetch: fetch,
    updateNotes,
    updateCustomer,
    createCustomer,
    archiveCustomer,
    restoreCustomer,
    deleteCustomer,
    checkDuplicate,
    findByPhone,
  }
}

// ─── Hook : adresses d'un client ─────────────────────────────

export function useCustomerAddresses(customerId: string | null) {
  const [addresses, setAddresses] = useState<CustomerAddress[]>([])
  const [loading, setLoading]     = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const fetch = useCallback(async () => {
    if (!customerId) return
    setLoading(true)
    const { data } = await supabase
      .from('customer_addresses')
      .select('*')
      .eq('customer_id', customerId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })

    if (!mounted.current) return
    setAddresses((data ?? []) as CustomerAddress[])
    setLoading(false)
  }, [customerId])

  useEffect(() => { fetch() }, [fetch])

  const addAddress = useCallback(async (
    addr: Omit<CustomerAddress, 'id' | 'customer_id' | 'created_at' | 'updated_at'>,
  ): Promise<boolean> => {
    if (!customerId) return false
    const { error } = await supabase
      .from('customer_addresses')
      .insert({ ...addr, customer_id: customerId })
    if (!error) await fetch()
    return !error
  }, [customerId, fetch])

  const updateAddress = useCallback(async (
    addressId: string,
    updates: Partial<Omit<CustomerAddress, 'id' | 'customer_id' | 'created_at'>>,
  ): Promise<boolean> => {
    const { error } = await supabase
      .from('customer_addresses')
      .update(updates)
      .eq('id', addressId)
    if (!error) await fetch()
    return !error
  }, [fetch])

  const deleteAddress = useCallback(async (addressId: string): Promise<boolean> => {
    const { error } = await supabase
      .from('customer_addresses')
      .delete()
      .eq('id', addressId)
    if (!error) await fetch()
    return !error
  }, [fetch])

  const setDefault = useCallback(async (addressId: string): Promise<boolean> => {
    return updateAddress(addressId, { is_default: true })
  }, [updateAddress])

  return { addresses, loading, refetch: fetch, addAddress, updateAddress, deleteAddress, setDefault }
}

// ─── Hook : historique audit d'un client ─────────────────────

export function useCustomerAudit(customerId: string | null) {
  const [audit, setAudit]   = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(false)

  const fetch = useCallback(async () => {
    if (!customerId) return
    setLoading(true)
    const { data } = await supabase.rpc('get_customer_audit', { p_customer_id: customerId })
    setAudit((data ?? []) as AuditLogEntry[])
    setLoading(false)
  }, [customerId])

  useEffect(() => { fetch() }, [fetch])

  return { audit, loading, refetch: fetch }
}
