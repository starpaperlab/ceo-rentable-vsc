import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

const DEFAULT_ROLE = 'user';
const DEFAULT_PLAN = 'free';
const DEFAULT_CURRENCY = 'USD';
const DEFAULT_TIMEZONE = 'America/Santo_Domingo';
const LEGACY_PROFILE_COLUMNS = ['id', 'email', 'full_name'];
const RECOVERY_INTENT = 'password_recovery';
const ENV_ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const FALLBACK_ADMIN_EMAILS = new Set(['ceorentable@gmail.com', ...ENV_ADMIN_EMAILS]);

function hasRecoveryParams() {
  if (typeof window === 'undefined') {
    return false;
  }

  const payload = `${window.location.search} ${window.location.hash}`.toLowerCase();
  return payload.includes('type=recovery') || payload.includes('mode=reset');
}

function formatAuthError(error) {
  if (!error?.message) {
    return new Error('Ocurrio un error inesperado con la autenticacion.');
  }

  const rawMessage = error.message.toLowerCase();

  if (rawMessage.includes('invalid login credentials')) {
    return new Error('Correo o contrasena incorrectos.');
  }

  if (rawMessage.includes('email not confirmed')) {
    return new Error('Debes confirmar tu correo antes de iniciar sesion.');
  }

  if (rawMessage.includes('user already registered')) {
    return new Error('Ese correo ya esta registrado. Inicia sesion o recupera tu contrasena.');
  }

  if (rawMessage.includes('password should be at least')) {
    return new Error('La contrasena debe tener al menos 6 caracteres.');
  }

  if (
    rawMessage.includes('email rate limit exceeded') ||
    rawMessage.includes('over_email_send_rate_limit') ||
    rawMessage.includes('rate limit')
  ) {
    return new Error('Alcanzaste el limite de correos de recuperacion. Espera unos minutos y usa el ultimo enlace recibido.');
  }

  return new Error(error.message);
}

function isMissingUsersColumnError(error) {
  const message = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase();
  return (
    (message.includes('column users.') && message.includes('does not exist')) ||
    (message.includes('could not find the') &&
      message.includes('column of') &&
      message.includes("'users'") &&
      message.includes('schema cache'))
  );
}

function isLegacyProfileShape(profile) {
  if (!profile) {
    return false;
  }

  return !('has_access' in profile) && !('plan' in profile) && !('role' in profile);
}

function formatProfileError(error) {
  if (isMissingUsersColumnError(error)) {
    return new Error(
      'Tu cuenta existe, pero la base de datos todavia tiene el esquema legacy. Ya ajustamos el login para compatibilidad, pero falta ejecutar la migracion de Supabase Fase 2 para activar roles, planes y accesos.'
    );
  }

  if (!error?.message) {
    return new Error('No pudimos sincronizar tu perfil.');
  }

  return new Error(error.message);
}

async function touchLastLogin(userId) {
  const { error } = await supabase
    .from('users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) {
    if (isMissingUsersColumnError(error)) {
      return;
    }
    console.warn('No se pudo registrar el ultimo login:', error.message);
  }
}

function normalizeProfile(authUser, profile = null, overrides = {}) {
  const metadata = authUser?.user_metadata ?? {};
  const isLegacyProfile = isLegacyProfileShape(profile);
  const email = (overrides.email || profile?.email || authUser?.email || '').trim().toLowerCase();
  const isFallbackAdmin = FALLBACK_ADMIN_EMAILS.has(email);
  const fullName =
    overrides.full_name ||
    overrides.fullName ||
    profile?.full_name ||
    metadata.full_name ||
    metadata.name ||
    email.split('@')[0] ||
    'Usuaria';
  const role = isFallbackAdmin
    ? 'admin'
    : overrides.role || metadata.role || profile?.role || DEFAULT_ROLE;
  const plan = isFallbackAdmin
    ? 'admin'
    : overrides.plan ||
      metadata.plan ||
      profile?.plan ||
      (isLegacyProfile ? 'founder' : role === 'admin' ? 'admin' : DEFAULT_PLAN);
  const hasAccess = isFallbackAdmin
    ? true
    : overrides.has_access ??
      metadata.has_access ??
      profile?.has_access ??
      (isLegacyProfile ? true : role === 'admin');
  const onboardingCompleted =
    overrides.onboarding_completed ??
    metadata.onboarding_completed ??
    profile?.onboarding_completed ??
    (isLegacyProfile ? true : false);

  return {
    ...(profile ?? {}),
    id: profile?.id || authUser.id,
    email,
    full_name: fullName,
    phone: overrides.phone ?? metadata.phone ?? profile?.phone ?? null,
    role,
    plan,
    has_access: hasAccess,
    onboarding_completed: onboardingCompleted,
    currency: overrides.currency || metadata.currency || profile?.currency || DEFAULT_CURRENCY,
    timezone: overrides.timezone || metadata.timezone || profile?.timezone || DEFAULT_TIMEZONE,
    legacy_profile: isLegacyProfile,
    created_at: profile?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function buildFallbackProfileFromAuth(authUser, overrides = {}) {
  return normalizeProfile(
    authUser,
    {
      id: authUser.id,
      email: authUser.email,
      full_name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || null,
      role: 'user',
      plan: 'founder',
      has_access: true,
      onboarding_completed: true,
      legacy_profile: true,
    },
    overrides
  );
}

function buildProfilePayload(authUser, overrides = {}, currentProfile = null) {
  const normalizedProfile = normalizeProfile(authUser, currentProfile, overrides);

  return {
    id: normalizedProfile.id,
    email: normalizedProfile.email,
    full_name: normalizedProfile.full_name,
    phone: normalizedProfile.phone,
    role: normalizedProfile.role,
    plan: normalizedProfile.plan,
    has_access: normalizedProfile.has_access,
    onboarding_completed: normalizedProfile.onboarding_completed,
    currency: normalizedProfile.currency,
    timezone: normalizedProfile.timezone,
    updated_at: normalizedProfile.updated_at,
  };
}

function buildLegacyProfilePayload(authUser, overrides = {}, currentProfile = null) {
  const normalizedProfile = normalizeProfile(authUser, currentProfile, overrides);

  return LEGACY_PROFILE_COLUMNS.reduce((payload, key) => {
    payload[key] = normalizedProfile[key];
    return payload;
  }, {});
}

async function fetchUserProfile(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

async function upsertOwnProfile(authUser, overrides = {}, currentProfile = null) {
  const payload = buildProfilePayload(authUser, overrides, currentProfile);
  const legacyPayload = buildLegacyProfilePayload(authUser, overrides, currentProfile);

  const writeProfile = async (profilePayload) => {
    const { data, error } = await supabase
      .from('users')
      .upsert(profilePayload, { onConflict: 'id' })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return normalizeProfile(authUser, data, overrides);
  };

  try {
    return await writeProfile(payload);
  } catch (error) {
    if (!isMissingUsersColumnError(error)) {
      throw error;
    }

    return writeProfile(legacyPayload);
  }
}

async function ensureUserProfile(authUser, overrides = {}) {
  const existingProfile = await fetchUserProfile(authUser.id);

  if (!existingProfile) {
    return upsertOwnProfile(authUser, overrides);
  }

  const normalizedExistingProfile = normalizeProfile(authUser, existingProfile, overrides);
  const nextProfile = buildProfilePayload(authUser, overrides, existingProfile);

  const hasProfileChanges = [
    'email',
    'full_name',
    'phone',
    'role',
    'plan',
    'has_access',
    'onboarding_completed',
    'currency',
    'timezone',
  ].some((key) => nextProfile[key] !== existingProfile[key]);

  if (!hasProfileChanges) {
    return normalizedExistingProfile;
  }

  const updateProfile = async (profilePayload) => {
    const { data, error } = await supabase
      .from('users')
      .update(profilePayload)
      .eq('id', authUser.id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return normalizeProfile(authUser, data, overrides);
  };

  try {
    return await updateProfile(nextProfile);
  } catch (error) {
    if (!isMissingUsersColumnError(error)) {
      throw error;
    }

    return updateProfile(buildLegacyProfilePayload(authUser, overrides, existingProfile));
  }
}

function isMissingApplyInvitationFunction(error) {
  const message = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase();
  return (
    error?.code === 'PGRST202' ||
    message.includes('could not find the function public.apply_pending_invitation')
  );
}

async function applyPendingInvitationIfAny(authUser) {
  try {
    const { data, error } = await supabase.rpc('apply_pending_invitation');
    if (error) {
      if (isMissingApplyInvitationFunction(error)) {
        return null;
      }
      console.warn('No se pudo aplicar invitacion pendiente:', error.message);
      return null;
    }

    if (!data?.applied) {
      return null;
    }

    return ensureUserProfile(authUser, {
      role: data.role || undefined,
      plan: data.plan || undefined,
      has_access: data.has_access ?? undefined,
    });
  } catch (error) {
    console.warn('No se pudo sincronizar invitacion pendiente:', error?.message || error);
    return null;
  }
}

export function getRedirectPathForRole(profile) {
  if (!profile) {
    return '/login';
  }

  if (profile.role === 'admin') {
    return '/AdminPanel';
  }

  if (profile.has_access && profile.onboarding_completed === false) {
    return '/Onboarding';
  }

  return '/';
}

export function useProvideAuth() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authIntent, setAuthIntent] = useState(() => (hasRecoveryParams() ? RECOVERY_INTENT : null));

  const hydrateFromSession = async (nextSession, overrides = {}, options = {}) => {
    setSession(nextSession ?? null);

    const nextUser = nextSession?.user ?? null;
    setUser(nextUser);

    if (!nextUser) {
      setUserProfile(null);
      setIsLoadingProfile(false);
      return null;
    }

    setIsLoadingProfile(true);

    try {
      let profile = await ensureUserProfile(nextUser, overrides);
      const invitationProfile = await applyPendingInvitationIfAny(nextUser);
      if (invitationProfile) {
        profile = invitationProfile;
      }
      setAuthError(null);
      setUserProfile(profile);
      return profile;
    } catch (error) {
      const formattedError = formatProfileError(error);
      console.error('Error sincronizando perfil de usuario:', error);

      if (options.allowFallbackProfile !== false) {
        const fallbackProfile = buildFallbackProfileFromAuth(nextUser, overrides);
        console.warn(
          'Aplicando perfil fallback por compatibilidad mientras reparamos la base:',
          formattedError.message
        );
        setUserProfile(fallbackProfile);
        setAuthError(formattedError);
        return fallbackProfile;
      }

      setUserProfile(null);
      setAuthError(formattedError);
      if (options.throwOnProfileError) {
        throw formattedError;
      }
      return null;
    } finally {
      setIsLoadingProfile(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      setIsLoadingAuth(true);

      try {
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          throw error;
        }

        if (!isMounted) {
          return;
        }

        await hydrateFromSession(data.session);
      } catch (error) {
        console.error('Error cargando sesion inicial:', error);
        if (isMounted) {
          setAuthError(formatAuthError(error));
          setUser(null);
          setUserProfile(null);
          setSession(null);
          setIsLoadingProfile(false);
        }
      } finally {
        if (isMounted) {
          setIsLoadingAuth(false);
        }
      }
    };

    bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) {
        return;
      }

      if (event === 'PASSWORD_RECOVERY') {
        setAuthIntent(RECOVERY_INTENT);
      } else if (event === 'SIGNED_OUT') {
        setAuthIntent(null);
      } else if (hasRecoveryParams()) {
        setAuthIntent(RECOVERY_INTENT);
      }

      setIsLoadingAuth(true);

      void (async () => {
        await hydrateFromSession(nextSession);
        if (isMounted) {
          setIsLoadingAuth(false);
        }
      })();
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const refreshUserProfile = async () => {
    if (!user) {
      setUserProfile(null);
      return null;
    }

    setIsLoadingProfile(true);

    try {
      const profile = await ensureUserProfile(user);
      setUserProfile(profile);
      return profile;
    } catch (error) {
      const fallbackProfile = buildFallbackProfileFromAuth(user);
      setUserProfile(fallbackProfile);
      setAuthError(formatProfileError(error));
      return fallbackProfile;

    } finally {
      setIsLoadingProfile(false);
    }
  };

  const login = async (email, password) => {
    setAuthError(null);

    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      throw formatAuthError(error);
    }

    const profile = await hydrateFromSession(data.session, {}, { throwOnProfileError: true });
    if (data.user?.id) {
      await touchLastLogin(data.user.id);
    }

    return {
      user: data.user ?? data.session?.user ?? null,
      profile,
      redirectTo: getRedirectPathForRole(profile),
    };
  };

  const register = async ({ email, password, fullName, phone = '' }) => {
    setAuthError(null);

    const normalizedEmail = email.trim().toLowerCase();
    const trimmedName = fullName.trim();

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          full_name: trimmedName,
          phone: phone.trim() || null,
          role: DEFAULT_ROLE,
          plan: DEFAULT_PLAN,
          has_access: false,
          onboarding_completed: false,
          currency: DEFAULT_CURRENCY,
          timezone: DEFAULT_TIMEZONE,
        },
      },
    });

    if (error) {
      throw formatAuthError(error);
    }

    let profile = null;

    if (data.session) {
      profile = await hydrateFromSession(data.session, {
        full_name: trimmedName,
        phone: phone.trim() || null,
        plan: DEFAULT_PLAN,
        role: DEFAULT_ROLE,
        has_access: false,
        onboarding_completed: false,
      });
    } else if (data.user) {
      try {
        profile = await upsertOwnProfile(data.user, {
          full_name: trimmedName,
          phone: phone.trim() || null,
          plan: DEFAULT_PLAN,
          role: DEFAULT_ROLE,
          has_access: false,
          onboarding_completed: false,
        });
      } catch (profileError) {
        console.warn('El perfil se completara al confirmar el correo:', profileError.message);
      }
    }

    return {
      user: data.user ?? null,
      profile,
      needsEmailConfirmation: !data.session,
      redirectTo: data.session ? getRedirectPathForRole(profile) : '/login',
    };
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw formatAuthError(error);
    }

    setAuthError(null);
    setSession(null);
    setUser(null);
    setUserProfile(null);
    setAuthIntent(null);
  };

  const requestPasswordReset = async (email, redirectTo) => {
    const normalizedEmail = email.trim().toLowerCase();
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo,
    });

    if (error) {
      throw formatAuthError(error);
    }

    return true;
  };

  const updatePassword = async (password) => {
    const { data, error } = await supabase.auth.updateUser({ password });

    if (error) {
      throw formatAuthError(error);
    }

    const profile = await refreshUserProfile();
    setAuthIntent(null);

    return {
      user: data.user ?? null,
      profile,
      redirectTo: getRedirectPathForRole(profile),
    };
  };

  const clearAuthIntent = () => {
    setAuthIntent(null);
  };

  const isAdmin = () => userProfile?.role === 'admin';
  const hasAccess = () => isAdmin() || userProfile?.has_access === true;

  return {
    session,
    user,
    userProfile,
    authError,
    isLoadingAuth,
    isLoadingProfile,
    authInitialized: !isLoadingAuth,
    isLoadingPublicSettings: false,
    authIntent,
    isPasswordRecovery: authIntent === RECOVERY_INTENT,
    login,
    register,
    signup: register,
    logout,
    requestPasswordReset,
    updatePassword,
    clearAuthIntent,
    isAdmin,
    hasAccess,
    refreshUserProfile,
    getRedirectPathForRole,
  };
}
