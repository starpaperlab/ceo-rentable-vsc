import { useAuth } from '@/lib/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';

export function useAccessGuard() {
  const {
    user,
    userProfile,
    isLoadingAuth,
    isLoadingProfile,
    isAdmin,
    hasAccess,
  } = useAuth();
  const { workspaces, isLoadingWorkspace } = useWorkspace();

  const isLoading = isLoadingAuth || isLoadingProfile || isLoadingWorkspace;
  const isRegistered = !user || Boolean(userProfile);
  const hasTeamSeat = (workspaces || []).some(
    (workspace) => !workspace?.legacy && workspace?.status === 'active' && workspace?.role !== 'owner'
  );

  return {
    user,
    userProfile,
    isLoading,
    isRegistered,
    isAdmin: isAdmin(),
    hasAccess: hasAccess() || hasTeamSeat,
  };
}
