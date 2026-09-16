import { useState, useEffect } from 'react'
import { loadQuickReplies } from '../lib/chat'
import type { CrcQuickReply } from '../types/chat'

export function useQuickReplies() {
  const [quickReplies, setQuickReplies] = useState<CrcQuickReply[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadQuickReplies().then(data => {
      setQuickReplies(data)
      setLoading(false)
    })
  }, [])

  return { quickReplies, loading }
}
