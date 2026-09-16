import { useState, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Customer } from '../types'

interface CustomerFilters {
  search?: string
}

export function useCustomers(filters: CustomerFilters = {}) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    setError(null)

    let query = supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false })

    if (filters.search?.trim()) {
      const s = `%${filters.search.trim()}%`
      query = query.or(`first_name.ilike.${s},last_name.ilike.${s},phone.ilike.${s},email.ilike.${s}`)
    }

    const { data, error: err } = await query
    if (err) {
      setError(err.message)
    } else {
      setCustomers((data ?? []) as Customer[])
    }
    setLoading(false)
  }, [filters.search])

  useEffect(() => { fetchCustomers() }, [fetchCustomers])

  const updateNotes = useCallback(async (customerId: string, notes: string): Promise<boolean> => {
    const { error: err } = await supabase
      .from('customers')
      .update({ notes })
      .eq('id', customerId)
    if (!err) {
      setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, notes } : c))
    }
    return !err
  }, [])

  const upsertCustomer = useCallback(async (
    phone: string,
    firstName: string,
    lastName: string,
    email?: string
  ): Promise<Customer | null> => {
    const { data, error: err } = await supabase
      .from('customers')
      .upsert(
        { phone, first_name: firstName, last_name: lastName, email: email || null },
        { onConflict: 'phone' }
      )
      .select()
      .single()

    if (err) return null
    return data as Customer
  }, [])

  const findByPhone = useCallback(async (phone: string): Promise<Customer | null> => {
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('phone', phone)
      .single()
    return (data as Customer | null)
  }, [])

  return {
    customers,
    loading,
    error,
    refetch: fetchCustomers,
    updateNotes,
    upsertCustomer,
    findByPhone,
  }
}
