import { createClient } from '@supabase/supabase-js';

let supabaseServiceClient = null;

const MIN_PASSWORD_LENGTH = 6;

function normalizeEmail(value = '') {
  return `${value || ''}`.trim().toLowerCase();
}

class InvitationActivationError extends Error {
  constructor(message, { status = 400, code = 'INVITATION_ACTIVATION_FAILED' } = {}) {
    super(message);
    this.name = 'InvitationActivationError';
    this.status = status;
    this.code = code;
  }
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

async function createInvitedAuthUser({ supabase, email, password, fullName }) {
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
    throw new InvitationActivationError(
      'No se pudo crear la cuenta invitada. Si ya tienes una cuenta, inicia sesión o recupera tu contraseña.',
      { status: 409, code: 'INVITATION_ACCOUNT_EXISTS_OR_UNAVAILABLE' }
    );
  }

  return createdAuth.user.id;
}

async function claimInvitation(supabase, { token, email, acceptedUserId = null }) {
  const { data, error } = await supabase.rpc('claim_user_invitation', {
    p_token: token,
    p_email: email,
    p_accepted_user_id: acceptedUserId,
  });

  if (error) {
    throw new InvitationActivationError('No se pudo validar la invitación.', {
      status: 500,
      code: 'INVITATION_CLAIM_FAILED',
    });
  }

  if (!data?.id) {
    throw new InvitationActivationError('La invitación expiró, fue revocada o ya fue utilizada.', {
      status: 410,
      code: 'INVITATION_NOT_AVAILABLE',
    });
  }

  return data;
}

async function releaseInvitationClaim(supabase, invitationId) {
  if (!invitationId) return false;
  const { data, error } = await supabase.rpc('release_user_invitation_claim', {
    p_invitation_id: invitationId,
  });
  return !error && data === true;
}

async function finalizeInvitation(supabase, invitationId, userId) {
  const { data, error } = await supabase.rpc('finalize_user_invitation', {
    p_invitation_id: invitationId,
    p_accepted_user_id: userId,
  });

  if (error || data !== true) {
    throw new InvitationActivationError('La cuenta fue creada, pero la invitación no pudo finalizarse.', {
      status: 500,
      code: 'INVITATION_FINALIZE_FAILED',
    });
  }
}

export async function handleActivateInvitationPayload(
  payload = {},
  { env = process.env, serviceClient = null } = {}
) {
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

    const supabase = serviceClient || getSupabaseServiceClient(env);
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

    const invitation = await claimInvitation(supabase, { token, email });
    const nowIso = new Date().toISOString();
    const role = 'user';
    const allowedPlans = new Set(['free', 'founder', 'founder_lifetime', 'monthly', 'subscription']);
    const requestedPlan = `${invitation.plan || ''}`.trim().toLowerCase();
    const plan = allowedPlans.has(requestedPlan) ? requestedPlan : 'free';
    const hasAccess = invitation.has_access === true;
    const finalName = fullName || `${invitation.full_name || ''}`.trim() || null;
    let userId = null;

    try {
      const { data: existingProfile, error: existingProfileError } = await supabase
        .from('users')
        .select('id')
        .ilike('email', email)
        .maybeSingle();

      if (existingProfileError) {
        throw new InvitationActivationError('No se pudo comprobar la cuenta invitada.', {
          status: 500,
          code: 'INVITATION_ACCOUNT_CHECK_FAILED',
        });
      }

      if (existingProfile?.id) {
        throw new InvitationActivationError(
          'Esta cuenta ya existe. Inicia sesión o utiliza la recuperación de contraseña.',
          { status: 409, code: 'INVITATION_EXISTING_ACCOUNT' }
        );
      }

      userId = await createInvitedAuthUser({
        supabase,
        email,
        password,
        fullName: finalName,
      });
    } catch (accountError) {
      if (!userId) {
        await releaseInvitationClaim(supabase, invitation.id);
      }
      throw accountError;
    }

    const { error: profileError } = await supabase.from('users').upsert(
      {
        id: userId,
        email,
        full_name: finalName,
        role,
        plan,
        has_access: hasAccess,
        access_source: invitation.access_source || 'manual_lifetime',
        is_lifetime: invitation.is_lifetime === true,
        onboarding_completed: false,
        updated_at: nowIso,
      },
      { onConflict: 'id' }
    );

    if (profileError) {
      throw new InvitationActivationError('No se pudo inicializar el perfil invitado.', {
        status: 500,
        code: 'USER_PROFILE_UPDATE_FAILED',
      });
    }

    await finalizeInvitation(supabase, invitation.id, userId);

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
      status: error?.status || 500,
      body: {
        success: false,
        code: error?.code || 'INVITATION_ACTIVATION_INTERNAL_ERROR',
        error: error?.message || 'Error interno activando la invitacion.',
      },
    };
  }
}
