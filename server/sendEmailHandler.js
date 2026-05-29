import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const RESEND_API_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM_EMAIL = 'hola@ceorentable.com';
const DEFAULT_FROM_NAME = 'CEO Rentable OS';

let supabaseAnonClient = null;
let supabaseServiceClient = null;

function resolveRequestId(payload = {}, options = {}) {
  const fromOptions = `${options?.requestId || ''}`.trim();
  if (fromOptions) return fromOptions;

  const headers = options?.headers || {};
  const fromHeaders =
    headers['x-request-id'] ||
    headers['X-Request-Id'] ||
    headers['x-correlation-id'] ||
    headers['X-Correlation-Id'];
  const normalizedHeader = `${fromHeaders || ''}`.trim();
  if (normalizedHeader) return normalizedHeader;

  const fromPayload = `${payload?.requestId || payload?.request_id || ''}`.trim();
  if (fromPayload) return fromPayload;

  return randomUUID();
}

const LOG_MESSAGE_MAX_LEN = 300;
const EMAIL_MASK_REGEX = /\b([A-Z0-9._%+-]{1,64})@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;
const BEARER_MASK_REGEX = /(bearer\s+)[a-z0-9\-._~+/]+=*/gi;
const JWT_MASK_REGEX = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const API_KEY_MASK_REGEX = /\b(sk_(live|test)_[A-Za-z0-9]+|re_[A-Za-z0-9._-]+|AIza[0-9A-Za-z\-_]{20,})\b/g;
const TOKEN_ASSIGNMENT_REGEX = /\b(token|access_token|refresh_token|api[_-]?key|authorization)\s*[:=]\s*["']?([A-Za-z0-9\-._~+/=]{8,})["']?/gi;

function sanitizeLogString(value = '') {
  try {
    let sanitized = `${value || ''}`;

    sanitized = sanitized.replace(EMAIL_MASK_REGEX, (_, local, domain) => {
      const safeLocal = local.length <= 2 ? '**' : `${local.slice(0, 2)}***`;
      return `${safeLocal}@${domain}`;
    });

    sanitized = sanitized.replace(BEARER_MASK_REGEX, '$1***');
    sanitized = sanitized.replace(JWT_MASK_REGEX, '[JWT_MASKED]');
    sanitized = sanitized.replace(API_KEY_MASK_REGEX, '[API_KEY_MASKED]');
    sanitized = sanitized.replace(TOKEN_ASSIGNMENT_REGEX, '$1=[MASKED]');

    if (sanitized.length > LOG_MESSAGE_MAX_LEN) {
      sanitized = `${sanitized.slice(0, LOG_MESSAGE_MAX_LEN)}...[truncated]`;
    }

    return sanitized;
  } catch (_) {
    return '[SANITIZE_FAILED]';
  }
}

function sanitizeLogData(data = {}) {
  try {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return data;
    }

    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      if (value == null) {
        sanitized[key] = value;
        continue;
      }

      if (typeof value === 'string') {
        sanitized[key] = sanitizeLogString(value);
        continue;
      }

      if (typeof value === 'object') {
        sanitized[key] = sanitizeLogString(JSON.stringify(value));
        continue;
      }

      sanitized[key] = value;
    }

    return sanitized;
  } catch (_) {
    return { sanitize_error: true };
  }
}

function bestEffortLog(eventName, data = {}, level = 'info') {
  try {
    const safeData = sanitizeLogData(data);
    const record = {
      event_name: eventName,
      timestamp: new Date().toISOString(),
      ...safeData,
    };
    const line = JSON.stringify(record);

    if (level === 'error') {
      console.error(line);
      return;
    }
    if (level === 'warn') {
      console.warn(line);
      return;
    }
    console.info(line);
  } catch (_) {
    // Best-effort logging: nunca bloquear el flujo de envío
  }
}

function normalizeRecipients(to) {
  if (Array.isArray(to)) {
    return to.map((item) => `${item || ''}`.trim()).filter(Boolean);
  }
  const one = `${to || ''}`.trim();
  return one ? [one] : [];
}

function toErrorMessage(payload = {}) {
  return payload?.error?.message || payload?.message || 'No se pudo enviar el email';
}

function extractEmail(raw = '') {
  const value = `${raw || ''}`.trim();
  if (!value) return '';
  const match = value.match(/<([^>]+)>/);
  if (match?.[1]) return match[1].trim();
  return value;
}

function formatFromAddress(rawFrom = '') {
  const value = `${rawFrom || ''}`.trim();
  if (value.includes('<') && value.includes('>')) return value;
  const email = extractEmail(value) || DEFAULT_FROM_EMAIL;
  return `${DEFAULT_FROM_NAME} <${email}>`;
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

async function getUserRoleViaRls({ env = process.env, fetchImpl = fetch, token, userId }) {
  const url = `${env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''}`.trim();
  const anonKey = `${env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ''}`.trim();
  if (!url || !anonKey || !token || !userId) {
    return { role: null };
  }

  const endpoint = `${url.replace(/\/$/, '')}/rest/v1/users?select=role&id=eq.${encodeURIComponent(userId)}&limit=1`;
  const response = await fetchImpl(endpoint, {
    method: 'GET',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    return {
      role: null,
      error:
        errorPayload?.message ||
        errorPayload?.error ||
        `RLS role lookup failed with status ${response.status}`,
    };
  }

  const rows = await response.json().catch(() => []);
  const role = `${rows?.[0]?.role || ''}`.trim().toLowerCase();
  return { role: role || null };
}

async function authenticateEmailRequest(payload = {}, { env = process.env, headers = {}, fetchImpl = fetch } = {}) {
  const token = getBearerToken(payload, headers);
  if (!token) {
    return { ok: false, status: 401, error: 'Debes iniciar sesión para enviar correos.' };
  }

  const anonClient = getSupabaseAnonClient(env);
  if (!anonClient) {
    return {
      ok: false,
      status: 500,
      error: 'Configuración incompleta: falta SUPABASE_URL / SUPABASE_ANON_KEY en servidor.',
    };
  }

  const { data: authData, error: authError } = await anonClient.auth.getUser(token);
  if (authError || !authData?.user?.id) {
    const reason = authError?.message ? ` ${authError.message}` : '';
    return {
      ok: false,
      status: 401,
      error: `Sesión inválida o expirada.${reason}`,
    };
  }

  const user = authData.user;
  const requestedScope = `${payload.scope || 'user'}`.toLowerCase();
  if (requestedScope !== 'admin') {
    return { ok: true, userId: user.id, role: 'user' };
  }

  const serviceClient = getSupabaseServiceClient(env);
  if (serviceClient) {
    const { data: profile, error: profileError } = await serviceClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (!profileError && `${profile?.role || ''}`.toLowerCase() === 'admin') {
      return { ok: true, userId: user.id, role: 'admin' };
    }
  }

  const roleFromRls = await getUserRoleViaRls({
    env,
    fetchImpl,
    token,
    userId: user.id,
  });
  if (roleFromRls.role === 'admin') {
    return { ok: true, userId: user.id, role: 'admin' };
  }

  const roleFromJwt =
    `${user?.app_metadata?.role || user?.user_metadata?.role || ''}`.trim().toLowerCase();
  if (roleFromJwt === 'admin') {
    return { ok: true, userId: user.id, role: 'admin' };
  }

  const detail = roleFromRls.error ? ` (${roleFromRls.error})` : '';
  return {
    ok: false,
    status: 403,
    error: `Solo administradoras pueden enviar este tipo de correo.${detail}`,
  };
}

export function validateSendEmailPayload(payload = {}) {
  const recipients = normalizeRecipients(payload.to);
  const subject = `${payload.subject || ''}`.trim();
  const html = `${payload.html || ''}`.trim();
  const text = `${payload.text || ''}`.trim();

  if (!recipients.length) {
    return { valid: false, error: 'Debes indicar al menos un destinatario.' };
  }
  if (!subject) {
    return { valid: false, error: 'El asunto es obligatorio.' };
  }
  if (!html && !text) {
    return { valid: false, error: 'El contenido del email está vacío.' };
  }

  return { valid: true, recipients, subject, html, text };
}

export async function sendEmailWithResend(payload = {}, { env = process.env, fetchImpl = fetch } = {}) {
  const apiKey = `${env.RESEND_API_KEY || ''}`.trim();
  if (!apiKey) {
    return {
      ok: false,
      status: 500,
      body: {
        success: false,
        code: 'RESEND_NOT_CONFIGURED',
        error: 'Falta RESEND_API_KEY en el entorno del servidor.',
      },
    };
  }

  const from = formatFromAddress(env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL);
  const replyTo = extractEmail(payload.replyTo || env.RESEND_REPLY_TO || env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL);

  const check = validateSendEmailPayload(payload);
  if (!check.valid) {
    return {
      ok: false,
      status: 400,
      body: { success: false, code: 'INVALID_PAYLOAD', error: check.error },
    };
  }

  const response = await fetchImpl(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: check.recipients,
      subject: check.subject,
      html: check.html || undefined,
      text: check.text || undefined,
      reply_to: replyTo || undefined,
    }),
  });

  const payloadResend = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      status: response.status || 502,
      body: {
        success: false,
        code: 'RESEND_ERROR',
        error: toErrorMessage(payloadResend),
        provider: payloadResend,
      },
    };
  }

  return {
    ok: true,
    status: 200,
    body: {
      success: true,
      messageId: payloadResend?.id || null,
    },
  };
}

export async function handleSendEmailPayload(payload = {}, options = {}) {
  const requestId = resolveRequestId(payload, options);
  const startedAt = Date.now();
  const scope = `${payload?.scope || 'user'}`.toLowerCase();
  const recipientCount = normalizeRecipients(payload?.to).length;

  bestEffortLog('email.send.attempt', {
    request_id: requestId,
    scope,
    recipient_count: recipientCount,
  });

  const logResult = (result, { userId = null, role = null } = {}) => {
    const success = Boolean(result?.ok ?? result?.body?.success);
    bestEffortLog(
      'email.send.result',
      {
        request_id: requestId,
        scope,
        recipient_count: recipientCount,
        user_id: userId,
        role,
        status: result?.status ?? null,
        success,
        code: result?.body?.code || null,
        duration_ms: Date.now() - startedAt,
      },
      success ? 'info' : 'warn'
    );
  };

  try {
    const authCheck = await authenticateEmailRequest(payload, options);
    if (!authCheck.ok) {
      const result = {
        ok: false,
        status: authCheck.status || 401,
        body: {
          success: false,
          code: 'EMAIL_SEND_UNAUTHORIZED',
          error: authCheck.error || 'No autorizado',
        },
      };
      logResult(result, { userId: null, role: null });
      return result;
    }

    const result = await sendEmailWithResend(payload, options);
    logResult(result, { userId: authCheck.userId || null, role: authCheck.role || null });
    return result;
  } catch (error) {
    bestEffortLog(
      'api.error',
      {
        request_id: requestId,
        endpoint: '/api/send-email',
        scope,
        recipient_count: recipientCount,
        error_code: 'SEND_EMAIL_INTERNAL_ERROR',
        error_message: error?.message || 'Error interno enviando email.',
        duration_ms: Date.now() - startedAt,
      },
      'error'
    );

    const result = {
      ok: false,
      status: 500,
      body: {
        success: false,
        code: 'SEND_EMAIL_INTERNAL_ERROR',
        error: error?.message || 'Error interno enviando email.',
      },
    };
    logResult(result, { userId: null, role: null });
    return result;
  }
}
