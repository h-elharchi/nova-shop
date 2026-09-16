import { Navigate } from 'react-router-dom'
import { useStaffAuth } from '../../hooks/useStaffAuth'

interface ProtectedRouteProps {
  children: React.ReactNode
  requiredRole?: 'admin' | 'agent'
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, profile, loading } = useStaffAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-bg">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Utilisateur non connecté
  if (!user) {
    return <Navigate to="/admin/login" replace />
  }

  // Compte explicitement désactivé (is_active: false).
  // Si profile est null (requête échouée / migration non exécutée), on ne bloque
  // pas pour ne pas enfermer les admins existants.
  if (profile !== null && !profile.is_active) {
    return <Navigate to="/admin/login" replace />
  }

  // Page réservée aux admins :
  // — Si le profil est chargé et que le rôle n'est pas 'admin' → /admin
  // — Si le profil est null (schema pas encore migré) → on laisse passer ;
  //   la protection réelle est assurée par la RLS côté Supabase.
  if (requiredRole === 'admin' && profile !== null && profile.role !== 'admin') {
    return <Navigate to="/admin" replace />
  }

  // Page réservée aux agents + admins :
  // — Même logique : si profil chargé et rôle invalide → login
  // — Si null → on laisse passer (RLS protège)
  if (requiredRole === 'agent' && profile !== null && !['admin', 'agent'].includes(profile.role)) {
    return <Navigate to="/admin/login" replace />
  }

  return <>{children}</>
}
