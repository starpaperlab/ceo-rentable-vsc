import { createClient } from '@supabase/supabase-js';

let supabaseAnonClient = null;
let supabaseServiceClient = null;

function normalizeEmail(value = '') {
  return `${value || ''}`.trim().toLowerCase();
}

class InvitationAcceptanceError extends Error {
  constructor(message, { status = 400, code = 'INVITATION_ACCEPTANCE_FAILED' } = {}) {
    super(message);
    this.name = 'InvitationAcceptanceError';
    this.status = status;
    this.code = code;
  }
}

function getBearerToken(payload = {}, headers = {}) {
  const fromPayload = `${payload.accessToken || ''}`.trim();
  if (fromPayload) return fromPayload;

  const authHeader =
    headers.authorization ||
    headers.Authorization ||
    headers.AUTHORIZATION ||
    '';

  const match = `${authHeader}`.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function getSupabaseAnonClient(env = process.env) {
  if (supabaseAnonClient) return supabaseAnonClient;

  const url = `${env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''}`.trim();
  const anon = `${env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ''}`.trim();
  if (!url || !anon) return null;

  supabaseAnonClient = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return supabaseAnonClient;
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

async function authenticateRequest(
  payload = {},
  { env = process.env, headers = {}, anonClient = null } = {}
) {
  const accessToken = getBearerToken(payload, headers);
  if (!accessToken) {
    return { ok: false, status: 401, error: 'Debes iniciar sesión para activar la invitación.' };
  }

  const authClient = anonClient || getSupabaseAnonClient(env);
  if (!authClient) {
    return {
      ok: false,
      status: 500,
      error: 'Configuración incompleta: falta SUPABASE_URL / SUPABASE_ANON_KEY en servidor.',
    };
  }

  const { data, error } = await authClient.auth.getUser(accessToken);
  if (error || !data?.user?.id) {
    return {
      ok: false,
      status: 401,
      error: `Sesión inválida o expirada.${error?.message ? ` ${error.message}` : ''}`,
    };
  }

  return {
    ok: true,
    accessToken,
    user: data.user,
  };
}

async function claimInvitation(supabase, { token, email, userId }) {
  const { data, error } = await supabase.rpc('claim_user_invitation', {
    p_token: token,
    p_email: email,
    p_accepted_user_id: userId,
  });

  if (error) {
    throw new InvitationAcceptanceError('No se pudo validar la invitación.', {
      status: 500,
      code: 'INVITATION_CLAIM_FAILED',
    });
  }

  if (!data?.id) {
    throw new InvitationAcceptanceError('La invitación expiró, fue revocada o ya fue utilizada.', {
      status: 410,
      code: 'INVITATION_NOT_AVAILABLE',
    });
  }

  return data;
}

async function finalizeInvitation(supabase, invitationId, userId) {
  const { data, error } = await supabase.rpc('finalize_user_invitation', {
    p_invitation_id: invitationId,
    p_accepted_user_id: userId,
  });

  if (error || data !== true) {
    throw new InvitationAcceptanceError('No se pudo finalizar la invitación.', {
      status: 500,
      code: 'INVITATION_FINALIZE_FAILED',
    });
  }
}

export async function handleAcceptInvitationPayload(payload = {}, options = {}) {
  try {
    const auth = await authenticateRequest(payload, options);
    if (!auth.ok) {
      return {
        ok: false,
        status: auth.status || 401,
        body: {
          success: false,
          code: 'INVITATION_AUTH_REQUIRED',
          error: auth.error || 'No autorizado',
        },
      };
    }

    const invitationToken = `${payload.token || ''}`.trim();
    if (!invitationToken) {
      return {
        ok: false,
        status: 400,
        body: {
          success: false,
          code: 'INVITATION_TOKEN_REQUIRED',
          error: 'Falta el token de invitación.',
        },
      };
    }

    const userEmail = normalizeEmail(auth.user.email);
    const requestEmail = normalizeEmail(payload.email);
    if (!userEmail) {
      return {
        ok: false,
        status: 403,
        body: {
          success: false,
          code: 'INVITATION_AUTH_EMAIL_REQUIRED',
          error: 'La sesión autenticada no tiene un correo válido para aceptar la invitación.',
        },
      };
    }

    if (requestEmail && userEmail && requestEmail !== userEmail) {
      return {
        ok: false,
        status: 403,
        body: {
          success: false,
          code: 'INVITATION_EMAIL_MISMATCH',
          error: 'Debes iniciar sesión con el mismo correo que recibió la invitación.',
        },
      };
    }

    const serviceClient = options.serviceClient || getSupabaseServiceClient(options.env || process.env);
    if (!serviceClient) {
      return {
        ok: false,
        status: 500,
        body: {
          success: false,
          code: 'SUPABASE_SERVICE_NOT_CONFIGURED',
          error: 'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.',
        },
      };
    }

    const invitation = await claimInvitation(serviceClient, {
      token: invitationToken,
      email: userEmail,
      userId: auth.user.id,
    });

    const role = 'user';
    const allowedPlans = new Set(['free', 'founder', 'founder_lifetime', 'monthly', 'subscription']);
    const requestedPlan = `${invitation.plan || ''}`.trim().toLowerCase();
    const plan = allowedPlans.has(requestedPlan) ? requestedPlan : 'free';
    const hasAccess = invitation.has_access === true;
    const nowIso = new Date().toISOString();
    const fullName =
      `${invitation.full_name || auth.user.user_metadata?.full_name || auth.user.user_metadata?.name || ''}`.trim() ||
      null;

    const { error: userUpsertError } = await serviceClient.from('users').upsert(
      {
        id: auth.user.id,
        email: userEmail,
        full_name: fullName,
        role,
        plan,
        has_access: hasAccess,
        access_source: invitation.access_source || 'manual_lifetime',
        is_lifetime: invitation.is_lifetime === true,
        updated_at: nowIso,
      },
      { onConflict: 'id' }
    );

    if (userUpsertError) {
      throw new InvitationAcceptanceError('No se pudo activar el perfil invitado.', {
        status: 500,
        code: 'INVITATION_USER_UPDATE_FAILED',
      });
    }

    await finalizeInvitation(serviceClient, invitation.id, auth.user.id);

    await serviceClient.from('audit_logs').insert({
      admin_id: invitation.invited_by || null,
      action: 'invitation_accepted_via_api',
      target_user_id: auth.user.id,
      details: {
        invitation_id: invitation.id,
        email: userEmail,
        role,
        plan,
      },
      created_at: nowIso,
    }).then(() => {}).catch(() => {});

    return {
      ok: true,
      status: 200,
      body: {
        success: true,
        data: {
          applied: true,
          role,
          plan,
          has_access: hasAccess,
        },
      },
    };
  } catch (error) {
    return {
      ok: false,
      status: error?.status || 500,
      body: {
        success: false,
        code: error?.code || 'INVITATION_INTERNAL_ERROR',
        error: error?.message || 'Error interno activando invitación.',
      },
    };
  }
}
