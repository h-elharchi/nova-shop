import { createContext, useContext } from 'react'
import type { Language } from '../types'

interface LanguageContextType {
  lang: Language
  setLang: (lang: Language) => void
  t: (path: string) => string
  isRTL: boolean
  dir: 'ltr' | 'rtl'
}

export const LanguageContext = createContext<LanguageContextType | null>(null)

export function useI18n(): LanguageContextType {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useI18n must be used within LanguageProvider')
  return ctx
}
