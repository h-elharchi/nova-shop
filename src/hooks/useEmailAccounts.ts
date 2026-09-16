import { useState, useCallback, useEffect } from 'react'
import { loadEmailAccounts, disconnectEmailAccount, getGmailAuthUrl, triggerEmailSync } from '../lib/email'
import type { EmailAccount } from '../types'

export function useEmailAccounts() {
  const [accounts, setAccounts] = useState<EmailAccount[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [syncing, setSyncing]   = useState(false)
  const [syncMsg, setSyncMsg]   = useState<string | null>(null)

  const fetchAccounts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await loadEmailAccounts()
      setAccounts(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAccounts() }, [fetchAccounts])

  const connectGmail = useCallback(async (label: string): Promise<void> => {
    const url = await getGmailAuthUrl(label)
    window.location.href = url
  }, [])

  const disconnect = useCallback(async (accountId: string): Promise<void> => {
    await disconnectEmailAccount(accountId)
    setAccounts(prev => prev.filter(a => a.id !== accountId))
  }, [])

  const syncNow = useCallback(async (): Promise<void> => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const result = await triggerEmailSync()
      setSyncMsg(`${result.synced} email(s) importé(s)`)
      await fetchAccounts()
    } catch (err) {
      setSyncMsg(err instanceof Error ? err.message : 'Erreur sync')
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(null), 4000)
    }
  }, [fetchAccounts])

  return { accounts, loading, error, syncing, syncMsg, refetch: fetchAccounts, connectGmail, disconnect, syncNow }
}
