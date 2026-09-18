import { useEffect, useRef } from 'react'

const RINGTONE_URL = '/nova-shop/sounds/ringtone.mp3'

// Joue en boucle la sonnerie tant que `active` est vrai (proposition d'interaction en attente
// de réponse de l'agent), et l'arrête dès que `active` repasse à faux (acceptée, refusée, expirée).
export function useRingtone(active: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio(RINGTONE_URL)
      audio.loop = true
      audioRef.current = audio
    }
    const audio = audioRef.current

    if (active) {
      audio.currentTime = 0
      audio.play().catch(() => { /* lecture bloquée par le navigateur — ignoré */ })
    } else {
      audio.pause()
      audio.currentTime = 0
    }

    return () => {
      audio.pause()
    }
  }, [active])
}
