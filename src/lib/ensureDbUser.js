import { supabase } from '@/lib/supabase';
import { extractMissingColumnFromError, isMissingColumnError, isMissingTableError } from '@/lib/supabaseOwnership';

function isMissingUsersColumn(error, column) {
  return (
    isMissingColumnError(error, `users.${column}`) ||
    isMissingColumnError(error, column)
  );
}

export async function ensureDbUserRecord({ user, userProfile }) {
  const userId = user?.id || userProfile?.id;
  if (!userId) {
    throw new Error('No hay sesión activa para guardar datos.');
  }

  const email = (userProfile?.email || user?.email || '').trim().toLowerCase();
  const fullName =
    userProfile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    email.split('@')[0] ||
    'Usuaria';

  const payload = {
    id: userId,
    email,
    full_name: fullName,
    phone: userProfile?.phone ?? user?.user_metadata?.phone ?? null,
    role: userProfile?.role || 'user',
    plan: userProfile?.plan || 'free',
    has_access: userProfile?.has_access ?? true,
    onboarding_completed: userProfile?.onboarding_completed ?? true,
    currency: userProfile?.currency || 'USD',
    timezone: userProfile?.timezone || 'America/Santo_Domingo',
    updated_at: new Date().toISOString(),
  };

  const candidate = { ...payload };
  const removableColumns = [
    'phone',
    'role',
    'plan',
    'has_access',
    'onboarding_completed',
    'currency',
    'timezone',
    'updated_at',
  ];

  for (let attempt = 0; attempt < removableColumns.length + 4; attempt += 1) {
    const { data, error } = await supabase
      .from('users')
      .upsert(candidate, { onConflict: 'id' })
      .select('*')
      .maybeSingle();

    if (!error) return data;

    if (isMissingTableError(error, 'users')) {
      throw new Error('La tabla users no existe en Supabase. Ejecuta la migración de esquema.');
    }

    const missingColumn = extractMissingColumnFromError(error);
    if (missingColumn && Object.prototype.hasOwnProperty.call(candidate, missingColumn)) {
      delete candidate[missingColumn];
      continue;
    }

    const removable = removableColumns.find(
      (column) => Object.prototype.hasOwnProperty.call(candidate, column) && isMissingUsersColumn(error, column)
    );

    if (removable) {
      delete candidate[removable];
      continue;
    }

    throw error;
  }

  throw new Error('No se pudo sincronizar el perfil de usuario en la base de datos.');
}
