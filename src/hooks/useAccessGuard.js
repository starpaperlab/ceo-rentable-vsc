import { useAuth } from '@/lib/AuthContext';

export function useAccessGuard() {
  const {
    user,
    userProfile,
    isLoadingAuth,
    isLoadingProfile,
    isAdmin,
    hasAccess,
  } = useAuth();

  const isLoading = isLoadingAuth || isLoadingProfile;
  const isRegistered = !user || Boolean(userProfile);

  return {
    user,
    userProfile,
    isLoading,
    isRegistered,
    isAdmin: isAdmin(),
    hasAccess: hasAccess(),
  };
}
