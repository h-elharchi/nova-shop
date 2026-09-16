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

  if (!user) {
    return <Navigate to="/admin/login" replace />
  }

  // Compte désactivé
  if (profile && !profile.is_active) {
    return <Navigate to="/admin/login" replace />
  }

  // Page réservée aux admins
  if (requiredRole === 'admin' && profile?.role !== 'admin') {
    return <Navigate to="/admin" replace />
  }

  // Page réservée aux agents et admins
  if (requiredRole === 'agent' && !['admin', 'agent'].includes(profile?.role ?? '')) {
    return <Navigate to="/admin/login" replace />
  }

  return <>{children}</>
}
