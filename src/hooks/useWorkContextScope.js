import { useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useWorkContext } from '@/contexts/WorkContext';
import { fetchOwnedRows, resolveWorkContextOwnership } from '@/lib/supabaseOwnership';

function normalizeEmail(value = '') {
  return `${value || ''}`.trim().toLowerCase();
}

export function useWorkContextScope() {
  const { user, userProfile, isAdmin } = useAuth();
  const { activeBrand, activeBrandId, activeView, activeUserId, activeUser } = useWorkContext();
  const ownerId = user?.id || userProfile?.id || null;
  const ownerEmail = normalizeEmail(userProfile?.email || user?.email || '');
  const adminMode = isAdmin?.() === true;

  const scopedOwnership = useMemo(
    () => resolveWorkContextOwnership({
      ownerId,
      ownerEmail,
      adminMode,
      activeView,
      activeUserId,
      activeUser,
    }),
    [activeUser, activeUserId, activeView, adminMode, ownerEmail, ownerId]
  );

  const writeOwnerId = scopedOwnership.adminMode ? ownerId : scopedOwnership.ownerId;
  const writeOwnerEmail = scopedOwnership.adminMode ? ownerEmail : scopedOwnership.ownerEmail;
  const queryKey = [ownerId, ownerEmail, adminMode, activeBrandId, activeView, activeUserId];
  const enabled = adminMode || Boolean(ownerId || ownerEmail);

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
    adminMode,
    enabled,
    fetchRows,
    ownerEmail,
    ownerId,
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
