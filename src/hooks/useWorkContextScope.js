import { useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useWorkContext } from '@/contexts/WorkContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { fetchOwnedRows, resolveWorkContextOwnership } from '@/lib/supabaseOwnership';

function normalizeEmail(value = '') {
  return `${value || ''}`.trim().toLowerCase();
}

export function useWorkContextScope() {
  const { user, userProfile, isAdmin } = useAuth();
  const { activeBrand, activeBrandId, activeView, activeUserId, activeUser } = useWorkContext();
  const { activeWorkspace, activeWorkspaceId, isLegacyWorkspaceMode } = useWorkspace();

  const authenticatedUserId = user?.id || userProfile?.id || null;
  const authenticatedEmail = normalizeEmail(userProfile?.email || user?.email || '');
  const adminMode = isAdmin?.() === true;

  // Para usuarias normales, los datos operativos pertenecen al negocio activo.
  // En modo legado conservamos exactamente el ownership histórico por usuaria.
  const workspaceOwnerId = !isLegacyWorkspaceMode && activeWorkspace?.owner_user_id
    ? activeWorkspace.owner_user_id
    : authenticatedUserId;

  const baseOwnerId = adminMode ? authenticatedUserId : workspaceOwnerId;
  const baseOwnerEmail = authenticatedEmail;

  const scopedOwnership = useMemo(
    () => resolveWorkContextOwnership({
      ownerId: baseOwnerId,
      ownerEmail: baseOwnerEmail,
      adminMode,
      activeView,
      activeUserId,
      activeUser,
    }),
    [activeUser, activeUserId, activeView, adminMode, baseOwnerEmail, baseOwnerId]
  );

  const writeOwnerId = scopedOwnership.adminMode ? authenticatedUserId : scopedOwnership.ownerId;
  const writeOwnerEmail = authenticatedEmail;
  const queryKey = [authenticatedUserId, authenticatedEmail, adminMode, activeWorkspaceId, activeBrandId, activeView, activeUserId];
  const enabled = adminMode || Boolean(scopedOwnership.ownerId || scopedOwnership.ownerEmail);

  const fetchRows = (options = {}) => fetchOwnedRows({
    ...options,
    ownerId: scopedOwnership.ownerId,
    ownerEmail: scopedOwnership.ownerEmail,
    adminMode: scopedOwnership.adminMode,
    brandProfileId: activeBrandId,
    includeUnbranded: options.includeUnbranded ?? true,
  });

  return {
    activeBrandId,
    activeBrand,
    activeUser,
    activeUserId,
    activeView,
    activeWorkspace,
    activeWorkspaceId,
    adminMode,
    enabled,
    fetchRows,
    ownerEmail: authenticatedEmail,
    ownerId: authenticatedUserId,
    queryKey,
    scopedAdminMode: scopedOwnership.adminMode,
    scopedOwnerEmail: scopedOwnership.ownerEmail,
    scopedOwnerId: scopedOwnership.ownerId,
    user,
    userProfile,
    writeOwnerEmail,
    writeOwnerId,
  };
}
