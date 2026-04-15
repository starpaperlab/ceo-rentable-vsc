import { createClient } from '@supabase/supabase-js';

let supabaseServiceClient = null;

const MIN_PASSWORD_LENGTH = 6;

function normalizeEmail(value = '') {
  return `${value || ''}`.trim().toLowerCase();
}

function getSupabaseServiceClient(env = process.env) {
  if (supabaseServiceClient) return supabaseServiceClient;

  const url = `${env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''}`.trim();
  const serviceRole = `${env.SUPABASE_SERVICE_ROLE_KEY || ''}`.trim();
  if (!url || !serviceRole) return null;

  supabaseServiceClient = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return supabaseServiceClient;
}

async function resolveOrCreateAuthUser({ supabase, email, password, fullName }) {
  const nowIso = new Date().toISOString();

  const { data: profile } = await supabase
    .from('users')
    .select('id')
    .ilike('email', email)
    .maybeSingle();

  if (profile?.id) {
    const { error: updateAuthError } = await supabase.auth.admin.updateUserById(profile.id, {
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName || undefined,
      },
    });

    if (updateAuthError) {
      throw new Error(updateAuthError.message || 'No se pudo actualizar la cuenta existente.');
    }

    return profile.id;
  }

  const { data: createdAuth, error: createAuthError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName || undefined,
      has_access: true,
      onboarding_completed: false,
    },
  });

  if (createAuthError || !createdAuth?.user?.id) {
    throw new Error(createAuthError?.message || 'No se pudo crear la cuenta.');
  }

  const userId = createdAuth.user.id;

  const { error: ensureUserError } = await supabase.from('users').upsert(
    {
      id: userId,
      email,
      full_name: fullName || null,
      role: 'user',
      plan: 'free',
      has_access: true,
      onboarding_completed: false,
      updated_at: nowIso,
    },
    { onConflict: 'id' }
  );

  if (ensureUserError) {
    throw new Error(ensureUserError.message || 'No se pudo inicializar el perfil.');
  }

  return userId;
}

export async function handleActivateInvitationPayload(payload = {}, { env = process.env } = {}) {
  try {
    const token = `${payload.token || ''}`.trim();
    const email = normalizeEmail(payload.email);
    const password = `${payload.password || ''}`;
    const fullName = `${payload.fullName || ''}`.trim();

    if (!token) {
      return {
        status: 400,
        body: {
          success: false,
          code: 'INVITE_TOKEN_REQUIRED',
          error: 'Falta el token de invitacion.',
        },
      };
    }

    if (!email) {
      return {
        status: 400,
        body: {
          success: false,
          code: 'INVITE_EMAIL_REQUIRED',
          error: 'Falta el correo de invitacion.',
        },
      };
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return {
        status: 400,
        body: {
          success: false,
          code: 'PASSWORD_TOO_SHORT',
          error: 'La contrasena debe tener al menos 6 caracteres.',
        },
      };
    }

    const supabase = getSupabaseServiceClient(env);
    if (!supabase) {
      return {
        status: 500,
        body: {
          success: false,
          code: 'SUPABASE_SERVICE_NOT_CONFIGURED',
          error: 'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.',
        },
      };
    }

    const { data: invitation, error: invitationError } = await supabase
      .from('user_invitations')
      .select('*')
      .eq('invitation_token', token)
      .ilike('email', email)
      .maybeSingle();

    if (invitationError) {
      return {
        status: 500,
        body: {
          success: false,
          code: 'INVITATION_LOOKUP_FAILED',
          error: invitationError.message || 'No se pudo validar la invitacion.',
        },
      };
    }

    if (!invitation) {
      return {
        status: 404,
        body: {
          success: false,
          code: 'INVITATION_NOT_FOUND',
          error: 'La invitacion no existe o ya no esta disponible.',
        },
      };
    }

    if (
      invitation.expires_at &&
      Number.isFinite(new Date(invitation.expires_at).getTime()) &&
      new Date(invitation.expires_at).getTime() <= Date.now()
    ) {
      return {
        status: 410,
        body: {
          success: false,
          code: 'INVITATION_EXPIRED',
          error: 'La invitacion expiro. Solicita una nueva invitacion.',
        },
      };
    }

    if (`${invitation.status || ''}`.toLowerCase() === 'revoked') {
      return {
        status: 403,
        body: {
          success: false,
          code: 'INVITATION_REVOKED',
          error: 'Esta invitacion fue cancelada por administracion.',
        },
      };
    }

    const nowIso = new Date().toISOString();
    const role = `${invitation.role || 'user'}`.toLowerCase() === 'admin' ? 'admin' : 'user';
    const plan = `${invitation.plan || ''}`.trim() || (role === 'admin' ? 'admin' : 'free');
    const hasAccess = invitation.has_access !== false;
    const finalName = fullName || `${invitation.full_name || ''}`.trim() || null;

    const userId =
      invitation.accepted_user_id ||
      (await resolveOrCreateAuthUser({
        supabase,
        email,
        password,
        fullName: finalName,
      }));

    if (invitation.accepted_user_id) {
      const { error: updateAuthError } = await supabase.auth.admin.updateUserById(invitation.accepted_user_id, {
        password,
        email_confirm: true,
        user_metadata: {
          full_name: finalName || undefined,
        },
      });

      if (updateAuthError) {
        return {
          status: 500,
          body: {
            success: false,
            code: 'AUTH_UPDATE_FAILED',
            error: updateAuthError.message || 'No se pudo actualizar la contrasena.',
          },
        };
      }
    }

    const { error: profileError } = await supabase.from('users').upsert(
      {
        id: userId,
        email,
        full_name: finalName,
        role,
        plan,
        has_access: hasAccess,
        onboarding_completed: false,
        updated_at: nowIso,
      },
      { onConflict: 'id' }
    );

    if (profileError) {
      return {
        status: 500,
        body: {
          success: false,
          code: 'USER_PROFILE_UPDATE_FAILED',
          error: profileError.message || 'No se pudo habilitar el acceso de la cuenta.',
        },
      };
    }

    const { error: updateInvitationError } = await supabase
      .from('user_invitations')
      .update({
        full_name: finalName,
        status: 'accepted',
        accepted_user_id: userId,
        accepted_at: nowIso,
        has_access: hasAccess,
        updated_at: nowIso,
      })
      .eq('id', invitation.id);

    if (updateInvitationError) {
      return {
        status: 500,
        body: {
          success: false,
          code: 'INVITATION_UPDATE_FAILED',
          error: updateInvitationError.message || 'No se pudo finalizar la invitacion.',
        },
      };
    }

    await supabase
      .from('audit_logs')
      .insert({
        admin_id: invitation.invited_by || null,
        action: 'invitation_activated_with_password',
        target_user_id: userId,
        details: {
          invitation_id: invitation.id,
          email,
          role,
          plan,
        },
        created_at: nowIso,
      })
      .then(() => {})
      .catch(() => {});

    return {
      status: 200,
      body: {
        success: true,
        data: {
          userId,
          email,
          role,
          plan,
          has_access: hasAccess,
        },
      },
    };
  } catch (error) {
    return {
      status: 500,
      body: {
        success: false,
        code: 'INVITATION_ACTIVATION_INTERNAL_ERROR',
        error: error?.message || 'Error interno activando la invitacion.',
      },
    };
  }
}

