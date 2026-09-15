import { createContext, useContext } from 'react'

interface ThemeContextType {
  isDark: boolean
  toggleTheme: () => void
}

export const ThemeContext = createContext<ThemeContextType | null>(null)

export function useThemeCtx(): ThemeContextType {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useThemeCtx must be used within ThemeProvider')
  return ctx
}
