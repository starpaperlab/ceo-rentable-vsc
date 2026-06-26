import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';

export const WORK_VIEW_MODES = {
  OWN_RECORDS: 'own_records',
  ALL_USERS: 'all_users',
  SPECIFIC_USER: 'specific_user',
};

const STORAGE_PREFIX = 'ceo-rentable-work-context';

const WorkContext = createContext(null);

function sortBrands(brands = []) {
  return [...brands].sort((a, b) => {
    if (a.is_default && !b.is_default) return -1;
    if (!a.is_default && b.is_default) return 1;
    return `${a.name || ''}`.localeCompare(`${b.name || ''}`);
  });
}

function getStorageKey(userId) {
  return userId ? `${STORAGE_PREFIX}:${userId}` : STORAGE_PREFIX;
}

function readStoredContext(userId) {
  if (typeof window === 'undefined' || !userId) {
    return {};
  }

  try {
    return JSON.parse(window.localStorage.getItem(getStorageKey(userId)) || '{}');
  } catch {
    return {};
  }
}

function writeStoredContext(userId, value) {
  if (typeof window === 'undefined' || !userId) {
    return;
  }

  window.localStorage.setItem(getStorageKey(userId), JSON.stringify(value));
}

export function WorkContextProvider({ children }) {
  const { user, userProfile, isAdmin } = useAuth();
  const isAdminUser = Boolean(isAdmin?.());
  const userId = user?.id || userProfile?.id || null;
  const [brands, setBrands] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeBrandId, setActiveBrandIdState] = useState(null);
  const [activeView, setActiveViewState] = useState(WORK_VIEW_MODES.OWN_RECORDS);
  const [activeUserId, setActiveUserIdState] = useState(null);

  const persistContext = useCallback(
    (patch) => {
      if (!userId) return;

      const current = readStoredContext(userId);
      writeStoredContext(userId, {
        ...current,
        ...patch,
      });
    },
    [userId]
  );

  useEffect(() => {
    if (!userId) {
      setBrands([]);
      setUsers([]);
      setActiveBrandIdState(null);
      setActiveViewState(WORK_VIEW_MODES.OWN_RECORDS);
      setActiveUserIdState(null);
      return;
    }

    const stored = readStoredContext(userId);
    setActiveBrandIdState(stored.activeBrandId || null);
    setActiveViewState(
      isAdminUser && Object.values(WORK_VIEW_MODES).includes(stored.activeView)
        ? stored.activeView
        : WORK_VIEW_MODES.OWN_RECORDS
    );
    setActiveUserIdState(isAdminUser ? stored.activeUserId || null : null);
  }, [isAdminUser, userId]);

  useEffect(() => {
    let cancelled = false;

    async function loadContextOptions() {
      if (!userId) return;

      setIsLoading(true);
      setError(null);

      try {
        const { data: brandRows, error: brandsError } = await supabase
          .from('brand_profiles')
          .select('id,user_id,name,legal_name,brand_color,is_default,created_at,updated_at')
          .order('is_default', { ascending: false })
          .order('name', { ascending: true });

        if (brandsError) {
          throw brandsError;
        }

        let userRows = [];
        if (isAdminUser) {
          const { data, error: usersError } = await supabase
            .from('users')
            .select('id,email,full_name,role,plan')
            .order('full_name', { ascending: true });

          if (usersError) {
            throw usersError;
          }
          userRows = data || [];
        }

        if (cancelled) return;

        setBrands(sortBrands(brandRows || []));
        setUsers(userRows);
      } catch (loadError) {
        if (cancelled) return;
        console.warn('No se pudo cargar el contexto de trabajo:', loadError?.message || loadError);
        setError(loadError);
        setBrands([]);
        setUsers([]);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadContextOptions();

    return () => {
      cancelled = true;
    };
  }, [isAdminUser, userId]);

  useEffect(() => {
    if (!userId || brands.length === 0) {
      return;
    }

    const stored = readStoredContext(userId);
    const storedBrandStillExists = stored.activeBrandId && brands.some((brand) => brand.id === stored.activeBrandId);
    if (stored.activeBrandId && !storedBrandStillExists) {
      setActiveBrandIdState(null);
      persistContext({ activeBrandId: null });
      return;
    }

    if (!stored.activeBrandId && !isAdminUser) {
      const preferredBrand = brands.find((brand) => brand.is_default) || brands[0];
      setActiveBrandIdState(preferredBrand?.id || null);
      persistContext({ activeBrandId: preferredBrand?.id || null });
    }
  }, [brands, isAdminUser, persistContext, userId]);

  const setActiveBrandId = useCallback(
    (brandId) => {
      const nextBrandId = brandId || null;
      setActiveBrandIdState(nextBrandId);
      persistContext({ activeBrandId: nextBrandId });
    },
    [persistContext]
  );

  const setActiveView = useCallback(
    (viewMode) => {
      const nextView = isAdminUser && Object.values(WORK_VIEW_MODES).includes(viewMode)
        ? viewMode
        : WORK_VIEW_MODES.OWN_RECORDS;
      setActiveViewState(nextView);
      persistContext({
        activeView: nextView,
        activeUserId: nextView === WORK_VIEW_MODES.SPECIFIC_USER ? activeUserId : null,
      });
      if (nextView !== WORK_VIEW_MODES.SPECIFIC_USER) {
        setActiveUserIdState(null);
      }
    },
    [activeUserId, isAdminUser, persistContext]
  );

  const setActiveUserId = useCallback(
    (nextUserId) => {
      const safeUserId = isAdminUser ? nextUserId || null : null;
      setActiveUserIdState(safeUserId);
      setActiveViewState(safeUserId ? WORK_VIEW_MODES.SPECIFIC_USER : WORK_VIEW_MODES.OWN_RECORDS);
      persistContext({
        activeUserId: safeUserId,
        activeView: safeUserId ? WORK_VIEW_MODES.SPECIFIC_USER : WORK_VIEW_MODES.OWN_RECORDS,
      });
    },
    [isAdminUser, persistContext]
  );

  const activeBrand = useMemo(
    () => brands.find((brand) => brand.id === activeBrandId) || null,
    [activeBrandId, brands]
  );

  const activeUser = useMemo(
    () => users.find((row) => row.id === activeUserId) || null,
    [activeUserId, users]
  );

  const value = useMemo(
    () => ({
      activeBrand,
      activeBrandId,
      activeUser,
      activeUserId,
      activeView: isAdminUser ? activeView : WORK_VIEW_MODES.OWN_RECORDS,
      brands,
      error,
      isAdminUser,
      isLoading,
      setActiveBrandId,
      setActiveUserId,
      setActiveView,
      users,
    }),
    [
      activeBrand,
      activeBrandId,
      activeUser,
      activeUserId,
      activeView,
      brands,
      error,
      isAdminUser,
      isLoading,
      setActiveBrandId,
      setActiveUserId,
      setActiveView,
      users,
    ]
  );

  return <WorkContext.Provider value={value}>{children}</WorkContext.Provider>;
}

export function useWorkContext() {
  const context = useContext(WorkContext);
  if (!context) {
    throw new Error('useWorkContext debe ser usado dentro de WorkContextProvider');
  }
  return context;
}
