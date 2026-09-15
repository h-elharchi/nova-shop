import { useState, useEffect, useCallback } from 'react'
import { translations } from '../i18n/translations'
import type { Language } from '../types'

const STORAGE_KEY = 'nova-shop-lang'

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const keys = path.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current && typeof current === 'object' && key in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[key]
    } else {
      return path
    }
  }
  return typeof current === 'string' ? current : path
}

export function useLanguage() {
  const [lang, setLangState] = useState<Language>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return (stored === 'fr' || stored === 'ar') ? stored : 'fr'
  })

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((newLang: Language) => {
    localStorage.setItem(STORAGE_KEY, newLang)
    setLangState(newLang)
  }, [])

  const t = useCallback((path: string): string => {
    const dict = translations[lang] as unknown as Record<string, unknown>
    return getNestedValue(dict, path)
  }, [lang])

  const isRTL = lang === 'ar'
  const dir: 'ltr' | 'rtl' = isRTL ? 'rtl' : 'ltr'

  return { lang, setLang, t, isRTL, dir }
}
