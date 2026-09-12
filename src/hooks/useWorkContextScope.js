import { useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { useWorkContext } from '@/contexts/WorkContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
  fetchOwnedRows,
  isMissingColumnError,
  resolveWorkContextOwnership,
} from '@/lib/supabaseOwnership';

function normalizeEmail(value = '') {
  return `${value || ''}`.trim().toLowerCase();
}

function sortRows(rows = [], orderBy = 'created_at', ascending = false) {
  if (!orderBy) return rows;

  return [...rows].sort((a, b) => {
    const av = a?.[orderBy];
    const bv = b?.[orderBy];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;

    const ad = new Date(av).getTime();
    const bd = new Date(bv).getTime();
    let diff;
    if (!Number.isNaN(ad) && !Number.isNaN(bd)) diff = ad - bd;
    else if (typeof av === 'number' && typeof bv === 'number') diff = av - bv;
    else diff = `${av}`.localeCompare(`${bv}`);

    return ascending ? diff : -diff;
  });
}

export function useWorkContextScope() {
  const { user, userProfile, isAdmin } = useAuth();
  const { activeBrand, activeBrandId, activeView, activeUserId, activeUser } = useWorkContext();
  const { activeWorkspace, activeWorkspaceId, isLegacyWorkspaceMode, canWrite, canWriteModule } = useWorkspace();

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
  const enabled = adminMode || Boolean(activeWorkspaceId || scopedOwnership.ownerId || scopedOwnership.ownerEmail);

  const fetchRows = async (options = {}) => {
    const {
      table,
      orderBy = 'created_at',
      ascending = false,
      filters = [],
      includeUnbranded = true,
    } = options;

    // Los miembros de un equipo deben leer los datos del negocio, no solamente
    // las filas cuyo user_id coincide con su propia cuenta. RLS decide qué
    // módulos puede consultar cada miembro dentro del workspace.
    if (!adminMode && !isLegacyWorkspaceMode && activeWorkspaceId && table) {
      const runWorkspaceQuery = async ({ includeBrand = true } = {}) => {
        let query = supabase
          .from(table)
          .select('*')
          .eq('workspace_id', activeWorkspaceId);

        filters.forEach((filter) => {
          if (filter?.column) query = query.eq(filter.column, filter.value);
        });

        if (includeBrand && activeBrandId) {
          query = includeUnbranded
            ? query.or(`brand_profile_id.eq.${activeBrandId},brand_profile_id.is.null`)
            : query.eq('brand_profile_id', activeBrandId);
        }

        const { data, error } = await query;
        return { data: data || [], error };
      };

      let result = await runWorkspaceQuery({ includeBrand: true });

      if (
        result.error &&
        activeBrandId &&
        (isMissingColumnError(result.error, `${table}.brand_profile_id`) ||
          isMissingColumnError(result.error, 'brand_profile_id'))
      ) {
        result = await runWorkspaceQuery({ includeBrand: false });
      }

      if (!result.error) {
        return sortRows(result.data, orderBy, ascending);
      }

      // Algunas tablas de configuración todavía conservan el esquema legado.
      // Solo en ese caso usamos el ownership anterior para no romper histórico.
      if (
        !isMissingColumnError(result.error, `${table}.workspace_id`) &&
        !isMissingColumnError(result.error, 'workspace_id')
      ) {
        throw result.error;
      }
    }

    return fetchOwnedRows({
      ...options,
      ownerId: scopedOwnership.ownerId,
      ownerEmail: scopedOwnership.ownerEmail,
      adminMode: scopedOwnership.adminMode,
      brandProfileId: activeBrandId,
      includeUnbranded,
    });
  };

  return {
    activeBrandId,
    activeBrand,
    activeUser,
    activeUserId,
    activeView,
    activeWorkspace,
    activeWorkspaceId,
    adminMode,
    canWrite,
    canWriteModule,
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
