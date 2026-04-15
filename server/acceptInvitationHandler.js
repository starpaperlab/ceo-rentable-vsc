import { createClient } from '@supabase/supabase-js';

let supabaseAnonClient = null;
let supabaseServiceClient = null;

function normalizeEmail(value = '') {
  return `${value || ''}`.trim().toLowerCase();
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

async function authenticateRequest(payload = {}, { env = process.env, headers = {} } = {}) {
  const accessToken = getBearerToken(payload, headers);
  if (!accessToken) {
    return { ok: false, status: 401, error: 'Debes iniciar sesión para activar la invitación.' };
  }

  const anonClient = getSupabaseAnonClient(env);
  if (!anonClient) {
    return {
      ok: false,
      status: 500,
      error: 'Configuración incompleta: falta SUPABASE_URL / SUPABASE_ANON_KEY en servidor.',
    };
  }

  const { data, error } = await anonClient.auth.getUser(accessToken);
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

    const serviceClient = getSupabaseServiceClient(options.env || process.env);
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

    const { data: invitation, error: invitationError } = await serviceClient
      .from('user_invitations')
      .select('*')
      .eq('invitation_token', invitationToken)
      .ilike('email', userEmail)
      .maybeSingle();

    if (invitationError) {
      return {
        ok: false,
        status: 500,
        body: {
          success: false,
          code: 'INVITATION_LOOKUP_FAILED',
          error: invitationError.message || 'No se pudo validar la invitación.',
        },
      };
    }

    if (!invitation) {
      return {
        ok: true,
        status: 200,
        body: {
          success: true,
          data: {
            applied: false,
            reason: 'invitation_not_found',
          },
        },
      };
    }

    if (
      invitation.expires_at &&
      Number.isFinite(new Date(invitation.expires_at).getTime()) &&
      new Date(invitation.expires_at).getTime() <= Date.now()
    ) {
      return {
        ok: true,
        status: 200,
        body: {
          success: true,
          data: {
            applied: false,
            reason: 'invitation_expired',
          },
        },
      };
    }

    const role = `${invitation.role || 'user'}`.toLowerCase() === 'admin' ? 'admin' : 'user';
    const plan =
      invitation.plan ||
      (role === 'admin'
        ? 'admin'
        : invitation.has_access === true
          ? 'subscription'
          : 'free');
    const hasAccess = invitation.has_access !== false;
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
        updated_at: nowIso,
      },
      { onConflict: 'id' }
    );

    if (userUpsertError) {
      return {
        ok: false,
        status: 500,
        body: {
          success: false,
          code: 'INVITATION_USER_UPDATE_FAILED',
          error: userUpsertError.message || 'No se pudo activar el acceso.',
        },
      };
    }

    if (invitation.status !== 'accepted') {
      const { error: invitationUpdateError } = await serviceClient
        .from('user_invitations')
        .update({
          status: 'accepted',
          accepted_at: nowIso,
          accepted_user_id: auth.user.id,
          updated_at: nowIso,
        })
        .eq('id', invitation.id);

      if (invitationUpdateError) {
        return {
          ok: false,
          status: 500,
          body: {
            success: false,
            code: 'INVITATION_UPDATE_FAILED',
            error: invitationUpdateError.message || 'No se pudo marcar la invitación como aceptada.',
          },
        };
      }
    }

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
      status: 500,
      body: {
        success: false,
        code: 'INVITATION_INTERNAL_ERROR',
        error: error?.message || 'Error interno activando invitación.',
      },
    };
  }
}

