import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';

const WorkspaceContext = createContext(null);

function isWorkspaceSchemaMissing(error) {
  const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  return (
    error?.code === 'PGRST205' ||
    text.includes('workspace_members') && text.includes('schema cache') ||
    text.includes('workspaces') && text.includes('schema cache') ||
    text.includes('could not find the table')
  );
}

function legacyWorkspaceFor(user) {
  const metadata = user?.user_metadata || {};
  return {
    id: null,
    name: metadata.business_name || metadata.full_name || user?.email || 'Mi empresa',
    owner_user_id: user?.id || null,
    role: 'owner',
    status: 'active',
    legacy: true,
  };
}

export function WorkspaceProvider({ children }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState(null);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  const [workspaceError, setWorkspaceError] = useState(null);

  const storageKey = user?.id ? `ceo-rentable-active-workspace:${user.id}` : null;

  const loadWorkspaces = useCallback(async () => {
    if (!user?.id) {
      setWorkspaces([]);
      setActiveWorkspaceIdState(null);
      setWorkspaceError(null);
      return;
    }

    setIsLoadingWorkspace(true);
    setWorkspaceError(null);

    try {
      const { data: memberships, error: membershipsError } = await supabase
        .from('workspace_members')
        .select('workspace_id,role,status,created_at')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: true });

      if (membershipsError) {
        if (isWorkspaceSchemaMissing(membershipsError)) {
          const legacy = legacyWorkspaceFor(user);
          setWorkspaces([legacy]);
          setActiveWorkspaceIdState(null);
          return;
        }
        throw membershipsError;
      }

      let activeMemberships = memberships || [];

      if (activeMemberships.length === 0) {
        const preferredName = user?.user_metadata?.business_name || user?.user_metadata?.full_name || 'Mi empresa';
        const { error: ensureError } = await supabase.rpc('ensure_personal_workspace', { p_name: preferredName });
        if (ensureError) {
          if (isWorkspaceSchemaMissing(ensureError)) {
            const legacy = legacyWorkspaceFor(user);
            setWorkspaces([legacy]);
            setActiveWorkspaceIdState(null);
            return;
          }
          throw ensureError;
        }

        const { data: refreshedMemberships, error: refreshedError } = await supabase
          .from('workspace_members')
          .select('workspace_id,role,status,created_at')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: true });
        if (refreshedError) throw refreshedError;
        activeMemberships = refreshedMemberships || [];
      }

      const ids = activeMemberships.map((item) => item.workspace_id).filter(Boolean);
      if (ids.length === 0) {
        const legacy = legacyWorkspaceFor(user);
        setWorkspaces([legacy]);
        setActiveWorkspaceIdState(null);
        return;
      }

      const { data: workspaceRows, error: workspacesError } = await supabase
        .from('workspaces')
        .select('id,name,slug,owner_user_id,country_code,currency_code,timezone,logo_url,brand_primary_color,brand_accent_color,settings,created_at,updated_at')
        .in('id', ids);
      if (workspacesError) throw workspacesError;

      const membershipByWorkspace = new Map(activeMemberships.map((item) => [item.workspace_id, item]));
      const normalized = (workspaceRows || [])
        .map((workspace) => ({
          ...workspace,
          role: membershipByWorkspace.get(workspace.id)?.role || 'member',
          status: membershipByWorkspace.get(workspace.id)?.status || 'active',
          legacy: false,
        }))
        .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));

      setWorkspaces(normalized);

      const stored = storageKey ? window.localStorage.getItem(storageKey) : null;
      const nextId = normalized.some((workspace) => workspace.id === stored)
        ? stored
        : normalized[0]?.id || null;
      setActiveWorkspaceIdState(nextId);
      if (storageKey && nextId) window.localStorage.setItem(storageKey, nextId);
    } catch (error) {
      console.error('Workspace initialization failed', error);
      setWorkspaceError(error);
      const legacy = legacyWorkspaceFor(user);
      setWorkspaces([legacy]);
      setActiveWorkspaceIdState(null);
    } finally {
      setIsLoadingWorkspace(false);
    }
  }, [storageKey, user]);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  const setActiveWorkspaceId = useCallback((workspaceId) => {
    if (!workspaceId) return false;
    if (!workspaces.some((workspace) => workspace.id === workspaceId)) return false;
    setActiveWorkspaceIdState(workspaceId);
    if (storageKey) window.localStorage.setItem(storageKey, workspaceId);
    return true;
  }, [storageKey, workspaces]);

  const activeWorkspace = useMemo(() => {
    if (activeWorkspaceId) {
      return workspaces.find((workspace) => workspace.id === activeWorkspaceId) || workspaces[0] || null;
    }
    return workspaces[0] || null;
  }, [activeWorkspaceId, workspaces]);

  const value = useMemo(() => ({
    workspaces,
    activeWorkspace,
    activeWorkspaceId: activeWorkspace?.id || null,
    isLegacyWorkspaceMode: Boolean(activeWorkspace?.legacy),
    isLoadingWorkspace,
    workspaceError,
    setActiveWorkspaceId,
    refreshWorkspaces: loadWorkspaces,
  }), [activeWorkspace, isLoadingWorkspace, loadWorkspaces, setActiveWorkspaceId, workspaceError, workspaces]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace debe usarse dentro de WorkspaceProvider');
  return context;
}
