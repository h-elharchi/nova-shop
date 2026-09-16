import { useEffect, useRef, useCallback } from 'react'

function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.3)
  } catch { /* noop — AudioContext not available */ }
}

export function useNotifications(waitingCount: number, soundEnabled: boolean) {
  const prevCount  = useRef(waitingCount)
  const baseTitle  = useRef(document.title)

  // Tab badge via document.title
  useEffect(() => {
    if (waitingCount > 0) {
      document.title = `(${waitingCount}) ${baseTitle.current}`
    } else {
      document.title = baseTitle.current
    }
  }, [waitingCount])

  // Sound + browser notification on new conversation
  useEffect(() => {
    if (waitingCount > prevCount.current) {
      if (soundEnabled) playNotifSound()
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Nouvelle conversation', {
          body: `${waitingCount} client(s) en attente`,
          icon: '/nova-shop/favicon.ico',
          tag: 'nova-chat-waiting',
        })
      }
    }
    prevCount.current = waitingCount
  }, [waitingCount, soundEnabled])

  const requestPermission = useCallback(async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission()
    }
  }, [])

  return { requestPermission }
}
