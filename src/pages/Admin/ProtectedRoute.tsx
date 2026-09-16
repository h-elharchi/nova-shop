import { Navigate } from 'react-router-dom'
import { useStaffAuth } from '../../hooks/useStaffAuth'

interface ProtectedRouteProps {
  children: React.ReactNode
  // 'admin' → réservé aux admins uniquement (gestion users, catalogue, catégories)
  // 'agent' → authentification seule, rôle non vérifié
  //           (dashboard, chat, commandes, compte)
  //           La protection réelle vient de la RLS Supabase côté serveur.
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

  // Utilisateur non connecté → login
  if (!user) {
    return <Navigate to="/admin/login" replace />
  }

  // Compte explicitement désactivé (seulement si profil chargé)
  if (profile !== null && profile.is_active === false) {
    return <Navigate to="/admin/login" replace />
  }

  // Pages réservées aux admins seulement :
  // Bloque uniquement si le profil est chargé ET que le rôle est confirmé non-admin.
  // Si profil null (migration non exécutée ou profil manquant), on laisse passer —
  // la RLS protège côté Supabase.
  if (requiredRole === 'admin' && profile !== null && profile.role !== 'admin') {
    return <Navigate to="/admin" replace />
  }

  // Pages agent (requiredRole='agent') : authentification seule.
  // On ne vérifie PAS le rôle ici pour rester compatible avec l'ancien schéma
  // (profiles.role = 'user' par défaut avant migration supabase-accounts.sql).

  return <>{children}</>
}
