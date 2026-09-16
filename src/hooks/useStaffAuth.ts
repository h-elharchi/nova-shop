import { useAuth } from './useAuth'
import { useProfile } from './useProfile'

export function useStaffAuth() {
  const { user, loading: authLoading, signIn, signOut } = useAuth()
  const { profile, loading: profileLoading, updateProfile, refetch } = useProfile(user?.id ?? null)

  // Loading jusqu'à ce que auth ET profile soient résolus
  const loading = authLoading || (user !== null && profileLoading)

  const isAdmin = profile?.role === 'admin' && profile?.is_active === true
  const isAgent = (profile?.role === 'agent' || profile?.role === 'admin') && profile?.is_active === true

  return { user, profile, loading, isAdmin, isAgent, signIn, signOut, updateProfile, refetchProfile: refetch }
}
