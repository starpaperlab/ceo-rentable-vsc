import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const RESEND_API_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM_EMAIL = 'hola@ceorentable.com';
const DEFAULT_FROM_NAME = 'CEO Rentable OS';
const RESEND_PUBLIC_ERROR_MESSAGE = 'No fue posible enviar el email en este momento.';
const AUTH_PUBLIC_ERROR_MESSAGE = 'Sesión inválida o expirada.';
const AUTHORIZATION_PUBLIC_ERROR_MESSAGE = 'Solo administradoras pueden enviar este tipo de correo.';

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

async function authenticateEmailRequest(
  payload = {},
  {
    env = process.env,
    headers = {},
    fetchImpl = fetch,
    anonClient = null,
    serviceClient = null,
  } = {}
) {
  const token = getBearerToken(payload, headers);
  if (!token) {
    return { ok: false, status: 401, error: 'Debes iniciar sesión para enviar correos.' };
  }

  const authClient = anonClient || getSupabaseAnonClient(env);
  if (!authClient) {
    return {
      ok: false,
      status: 500,
      error: 'Configuración incompleta: falta SUPABASE_URL / SUPABASE_ANON_KEY en servidor.',
    };
  }

  let authData = null;
  try {
    const authResult = await authClient.auth.getUser(token);
    authData = authResult?.data || null;
    if (authResult?.error || !authData?.user?.id) {
      return {
        ok: false,
        status: 401,
        error: AUTH_PUBLIC_ERROR_MESSAGE,
      };
    }
  } catch (_) {
    return {
      ok: false,
      status: 401,
      error: AUTH_PUBLIC_ERROR_MESSAGE,
    };
  }

  const user = authData.user;
  const adminClient = serviceClient || getSupabaseServiceClient(env);
  if (adminClient) {
    const { data: profile, error: profileError } = await adminClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (!profileError && `${profile?.role || ''}`.toLowerCase() === 'admin') {
      return { ok: true, userId: user.id, role: 'admin' };
    }

    return {
      ok: false,
      status: 403,
      error: 'Solo administradoras verificadas pueden enviar correos.',
    };
  }

  // Fail closed while still allowing deployments that intentionally omit the
  // service-role client: this lookup reads the authoritative public.users.role
  // through the caller's own RLS session. Client-provided scope and JWT user
  // metadata never participate in authorization.
  const roleFromRls = await getUserRoleViaRls({
    env,
    fetchImpl,
    token,
    userId: user.id,
  });
  if (roleFromRls.role === 'admin') {
    return { ok: true, userId: user.id, role: 'admin' };
  }

  return {
    ok: false,
    status: 403,
    error: AUTHORIZATION_PUBLIC_ERROR_MESSAGE,
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

  let response;
  try {
    response = await fetchImpl(RESEND_API_URL, {
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
  } catch (_) {
    return {
      ok: false,
      status: 503,
      body: {
        success: false,
        code: 'RESEND_ERROR',
        error: RESEND_PUBLIC_ERROR_MESSAGE,
      },
    };
  }

  const payloadResend = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      status: response.status || 502,
      body: {
        success: false,
        code: 'RESEND_ERROR',
        error: RESEND_PUBLIC_ERROR_MESSAGE,
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

const CAMPAIGN_SEGMENTS = new Set(['all', 'with_access', 'without_access', 'admins', 'unconfirmed', 'manual', 'csv']);
const CAMPAIGN_MAX_RECIPIENTS = 100;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const PROD_APP_URL = 'https://app.ceorentable.com';
const LOCALHOST_URL_REGEX = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?/gi;
const RELATIVE_LOGO_REGEX = /(src\s*=\s*["'])\/brand\/isotipo\.png(["'])/gi;
const TEMPLATE_FOOTER_HTML = `
  <div data-ceo-footer="1" style="text-align:center;margin-top:22px;color:#8a7f85;font-size:12px;line-height:1.5;">
    CEO Rentable OS™ · Tu sistema financiero inteligente<br/>
    Preguntas: <a href="mailto:hola@ceorentable.com" style="color:#D45387;text-decoration:none;">hola@ceorentable.com</a>
  </div>
`;
const DEFAULT_TEMPLATE_VARIABLES = {
  name: 'Emprendedora',
  full_name: 'Emprendedora',
  email: 'hola@ceorentable.com',
  business_name: 'Tu negocio',
  amount: 'RD$0.00',
  currency: 'DOP',
  plan: 'CEO Rentable OS™',
  login_link: `${PROD_APP_URL}/login`,
  invite_link: `${PROD_APP_URL}/activar-acceso`,
  cta_text: 'Abrir CEO Rentable OS™',
  cta_url: PROD_APP_URL,
  promo_title: 'Una oportunidad especial para ti',
  promo_price: 'RD$0.00',
  promo_description: 'Queremos ayudarte a seguir avanzando con mayor claridad financiera.',
  expiry_date: 'Próximamente',
  subject_line: 'Actualización importante de CEO Rentable OS™',
  headline: 'Tenemos una actualización para ti',
  body_text: 'Gracias por formar parte de CEO Rentable OS™.',
};

function normalizeOrigin(raw = '') {
  const value = `${raw || ''}`.trim();
  if (!value) return '';
  try {
    return new URL(value).origin.replace(/\/$/, '');
  } catch {
    return '';
  }
}

function isLocalOrigin(url = '') {
  const lower = `${url || ''}`.toLowerCase();
  return lower.includes('localhost') || lower.includes('127.0.0.1') || lower.includes('0.0.0.0');
}

function resolveAppUrl(env = process.env) {
  const configured = normalizeOrigin(env.APP_URL || env.VITE_APP_URL || env.VITE_PUBLIC_APP_URL || '');
  if (configured && !isLocalOrigin(configured)) return configured;
  return PROD_APP_URL;
}

function normalizeEmailValue(value = '') {
  return `${value || ''}`.trim().toLowerCase();
}

function isValidEmail(value = '') {
  return EMAIL_REGEX.test(normalizeEmailValue(value));
}

function ensureFooterHtml(html = '') {
  const normalized = `${html || ''}`.trim();
  if (!normalized) return TEMPLATE_FOOTER_HTML;
  if (normalized.includes('data-ceo-footer="1"')) return normalized;

  const lower = normalized.toLowerCase();
  if (lower.includes('hola@ceorentable.com') && lower.includes('ceo rentable os')) {
    return normalized;
  }

  return `${normalized}${TEMPLATE_FOOTER_HTML}`;
}

function normalizeTemplateHtmlAssets(html = '', env = process.env) {
  let normalized = `${html || ''}`;
  if (!normalized) return '';

  const appUrl = resolveAppUrl(env);
  const logoUrl = `${appUrl}/brand/isotipo.png`;

  normalized = normalized.replace(LOCALHOST_URL_REGEX, appUrl);
  normalized = normalized.replace(RELATIVE_LOGO_REGEX, `$1${logoUrl}$2`);
  return normalized;
}

function normalizeTemplateRecord(template = {}) {
  const active = template?.is_active ?? template?.active ?? true;
  return {
    ...template,
    active,
    subject: `${template?.subject || ''}`.trim(),
    html: `${template?.html_content || template?.html_body || ''}`.trim(),
    text: `${template?.text_content || template?.body || ''}`.trim(),
    variables: Array.isArray(template?.variables) ? template.variables : [],
  };
}

function interpolateTemplateString(text = '', variables = {}) {
  return Object.entries(variables).reduce((acc, [key, value]) => {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    return acc.replace(regex, value ?? '');
  }, `${text || ''}`);
}

function buildTemplateVariables(recipient = {}, variableDefaults = {}, env = process.env) {
  const appUrl = resolveAppUrl(env);
  const runtimeDefaults = {
    login_link: `${appUrl}/login`,
    invite_link: `${appUrl}/activar-acceso`,
    cta_url: appUrl,
  };

  const variables = {
    ...DEFAULT_TEMPLATE_VARIABLES,
    ...runtimeDefaults,
    ...variableDefaults,
    ...recipient,
    name: recipient?.name || recipient?.full_name || variableDefaults?.name || DEFAULT_TEMPLATE_VARIABLES.name,
    full_name:
      recipient?.full_name ||
      recipient?.name ||
      variableDefaults?.full_name ||
      variableDefaults?.name ||
      DEFAULT_TEMPLATE_VARIABLES.full_name,
    email: recipient?.email || variableDefaults?.email || DEFAULT_TEMPLATE_VARIABLES.email,
  };

  variables.login_link = recipient?.login_link || variableDefaults?.login_link || runtimeDefaults.login_link;
  variables.invite_link = recipient?.invite_link || variableDefaults?.invite_link || runtimeDefaults.invite_link;
  variables.cta_url = recipient?.cta_url || variableDefaults?.cta_url || runtimeDefaults.cta_url;

  return variables;
}

function normalizeImportedRecipients(rawRecipients = [], fallbackSourceType = 'manual') {
  const recipients = [];
  const invalidRecipients = [];
  const seen = new Set();
  let duplicatesRemoved = 0;

  for (const rawRecipient of Array.isArray(rawRecipients) ? rawRecipients : []) {
    const email = normalizeEmailValue(
      rawRecipient?.email || rawRecipient?.recipient_email || rawRecipient?.to_email || rawRecipient
    );

    if (!isValidEmail(email)) {
      invalidRecipients.push({
        email: rawRecipient?.email || rawRecipient?.recipient_email || rawRecipient?.to_email || `${rawRecipient || ''}`.trim(),
        name: rawRecipient?.name || rawRecipient?.recipient_name || '',
      });
      continue;
    }

    if (seen.has(email)) {
      duplicatesRemoved += 1;
      continue;
    }

    seen.add(email);
    recipients.push({
      email,
      name: `${rawRecipient?.name || rawRecipient?.recipient_name || rawRecipient?.full_name || ''}`.trim(),
      plan: `${rawRecipient?.plan || ''}`.trim(),
      amount: `${rawRecipient?.amount || ''}`.trim(),
      login_link: `${rawRecipient?.login_link || ''}`.trim(),
      invite_link: `${rawRecipient?.invite_link || ''}`.trim(),
      source_type: `${rawRecipient?.source_type || fallbackSourceType || 'manual'}`.trim(),
    });
  }

  return {
    recipients,
    invalidRecipients,
    duplicatesRemoved,
  };
}

async function listAllAuthUsers(serviceClient) {
  const allUsers = [];
  let page = 1;
  const perPage = 500;

  while (page <= 20) {
    const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users || [];
    if (users.length === 0) break;

    allUsers.push(...users);
    if (users.length < perPage) break;
    page += 1;
  }

  return allUsers;
}

async function loadRegisteredRecipients(segment, serviceClient) {
  const authUsers = await listAllAuthUsers(serviceClient);
  let { data: profiles, error: profilesError } = await serviceClient
    .from('users')
    .select('id,email,full_name,role,plan,has_access,business_name');

  if (profilesError) {
    const message = `${profilesError?.message || ''} ${profilesError?.details || ''}`.toLowerCase();
    if (message.includes('business_name')) {
      ({ data: profiles, error: profilesError } = await serviceClient
        .from('users')
        .select('id,email,full_name,role,plan,has_access'));
    }
  }

  if (profilesError) throw profilesError;

  const profilesById = new Map((profiles || []).map((profile) => [profile.id, profile]));
  const recipients = [];

  for (const authUser of authUsers) {
    const email = normalizeEmailValue(authUser?.email);
    if (!isValidEmail(email)) continue;

    const profile = profilesById.get(authUser.id) || {};
    const confirmed = Boolean(authUser?.email_confirmed_at || authUser?.confirmed_at);
    const hasAccess = profile?.has_access === true;
    const role = `${profile?.role || authUser?.app_metadata?.role || authUser?.user_metadata?.role || 'user'}`
      .trim()
      .toLowerCase();

    if (segment === 'with_access' && !hasAccess) continue;
    if (segment === 'without_access' && hasAccess) continue;
    if (segment === 'admins' && role !== 'admin') continue;
    if (segment === 'unconfirmed' && confirmed) continue;

    recipients.push({
      email,
      name:
        `${profile?.full_name || authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || email}`.trim() ||
        email,
      full_name:
        `${profile?.full_name || authUser?.user_metadata?.full_name || authUser?.user_metadata?.name || email}`.trim() ||
        email,
      user_id: authUser.id,
      plan: `${profile?.plan || ''}`.trim(),
      role,
      has_access: hasAccess,
      confirmed,
      business_name: `${profile?.business_name || authUser?.user_metadata?.business_name || ''}`.trim(),
      source_type: 'registered',
    });
  }

  return recipients;
}

async function loadTemplateById(serviceClient, templateId) {
  const { data, error } = await serviceClient
    .from('email_templates')
    .select('*')
    .eq('id', templateId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error('No encontramos el template seleccionado.');
  }

  const template = normalizeTemplateRecord(data);
  if (!template.active) {
    throw new Error('El template seleccionado está inactivo. Actívalo antes de enviar.');
  }
  if (!template.subject || (!template.html && !template.text)) {
    throw new Error('El template seleccionado no tiene contenido suficiente para enviar.');
  }

  return template;
}

async function buildCampaignAudience(payload = {}, { env = process.env, serviceClient }) {
  const segment = `${payload?.segment || 'all'}`.trim().toLowerCase();
  if (!CAMPAIGN_SEGMENTS.has(segment)) {
    throw new Error('El segmento seleccionado no es válido.');
  }

  if (segment === 'manual' || segment === 'csv') {
    const normalized = normalizeImportedRecipients(payload?.recipients || [], segment);
    return {
      segment,
      recipients: normalized.recipients,
      invalidRecipients: normalized.invalidRecipients,
      duplicatesRemoved: normalized.duplicatesRemoved,
      totalAvailable: normalized.recipients.length,
    };
  }

  const registeredRecipients = await loadRegisteredRecipients(segment, serviceClient);
  return {
    segment,
    recipients: registeredRecipients,
    invalidRecipients: [],
    duplicatesRemoved: 0,
    totalAvailable: registeredRecipients.length,
  };
}

async function createCampaignRecord({
  serviceClient,
  adminUserId,
  template,
  segment,
  totalRecipients,
  variableDefaults = {},
  campaignName = '',
}) {
  const basePayload = {
    admin_id: adminUserId,
    template_id: template.id,
    name:
      `${campaignName || ''}`.trim() ||
      `Campaña ${template.name} - ${new Date().toLocaleDateString('es-DO')}`,
    description: `Envío ${segment} desde Admin Panel`,
    target_segment: segment,
    custom_variables: variableDefaults,
    status: 'sending',
    recipients_count: totalRecipients,
    recipient_count: totalRecipients,
    sent_count: 0,
    failed_count: 0,
    started_at: new Date().toISOString(),
  };

  const attempts = [
    basePayload,
    (() => {
      const fallback = { ...basePayload };
      delete fallback.target_segment;
      delete fallback.custom_variables;
      delete fallback.recipients_count;
      return fallback;
    })(),
  ];

  for (const attempt of attempts) {
    const { data, error } = await serviceClient
      .from('email_campaigns')
      .insert(attempt)
      .select('*')
      .single();

    if (!error) return data;
  }

  return null;
}

async function finalizeCampaignRecord(serviceClient, campaignId, patch = {}) {
  if (!campaignId) return;
  const attempts = [
    patch,
    (() => {
      const fallback = { ...patch };
      delete fallback.recipients_count;
      return fallback;
    })(),
  ];

  for (const attempt of attempts) {
    const { error } = await serviceClient
      .from('email_campaigns')
      .update(attempt)
      .eq('id', campaignId);

    if (!error) return;
  }
}

async function createEmailLogRecord(serviceClient, payload = {}) {
  const attempts = [
    {
      user_id: payload.user_id || null,
      template_id: payload.template_id || null,
      campaign_id: payload.campaign_id || null,
      type: payload.type || 'template',
      to_email: payload.to_email || null,
      recipient_email: payload.recipient_email || payload.to_email || null,
      recipient_name: payload.recipient_name || null,
      email: payload.email || payload.recipient_email || payload.to_email || null,
      name: payload.name || payload.recipient_name || null,
      subject: payload.subject || null,
      status: payload.status || 'pending',
      metadata: payload.metadata || {},
      timestamp: new Date().toISOString(),
      created_at: new Date().toISOString(),
    },
  ];

  for (const attempt of attempts) {
    const { data, error } = await serviceClient
      .from('email_logs')
      .insert(attempt)
      .select('*')
      .single();

    if (!error) return data;
  }

  return null;
}

async function updateEmailLogRecord(serviceClient, logId, patch = {}) {
  if (!logId) return;

  const payload = {
    ...patch,
    updated_at: new Date().toISOString(),
  };

  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);

  await serviceClient.from('email_logs').update(payload).eq('id', logId);
}

function buildPreviewSummary({ template, audience, variableDefaults = {} }) {
  return {
    template: {
      id: template.id,
      name: template.name,
      subject: template.subject,
    },
    segment: audience.segment,
    counts: {
      total: audience.totalAvailable,
      valid: audience.recipients.length,
      invalid: audience.invalidRecipients.length,
      duplicates_removed: audience.duplicatesRemoved,
      limit: CAMPAIGN_MAX_RECIPIENTS,
      over_limit: audience.recipients.length > CAMPAIGN_MAX_RECIPIENTS,
    },
    recipients: audience.recipients.slice(0, CAMPAIGN_MAX_RECIPIENTS).map((recipient) => ({
      email: recipient.email,
      name: recipient.name || '',
      source_type: recipient.source_type || 'registered',
      has_access: recipient.has_access === true,
      role: recipient.role || 'user',
      confirmed: recipient.confirmed !== false,
      plan: recipient.plan || '',
    })),
    invalidRecipients: audience.invalidRecipients,
    variableDefaults,
  };
}

async function previewCampaignEmails(payload = {}, { env = process.env }) {
  const serviceClient = getSupabaseServiceClient(env);
  if (!serviceClient) {
    throw new Error('Configuración incompleta: falta SUPABASE_SERVICE_ROLE_KEY en el servidor.');
  }

  const templateId = `${payload?.templateId || ''}`.trim();
  if (!templateId) {
    throw new Error('Debes seleccionar un template para continuar.');
  }

  const template = await loadTemplateById(serviceClient, templateId);
  const audience = await buildCampaignAudience(payload, { env, serviceClient });

  if (audience.recipients.length === 0) {
    throw new Error('No encontramos destinatarios válidos para este envío.');
  }

  return buildPreviewSummary({
    template,
    audience,
    variableDefaults: payload?.variableDefaults || {},
  });
}

async function sendCampaignEmails(payload = {}, { env = process.env, fetchImpl = fetch, adminUserId }) {
  const serviceClient = getSupabaseServiceClient(env);
  if (!serviceClient) {
    throw new Error('Configuración incompleta: falta SUPABASE_SERVICE_ROLE_KEY en el servidor.');
  }

  const templateId = `${payload?.templateId || ''}`.trim();
  if (!templateId) {
    throw new Error('Debes seleccionar un template para continuar.');
  }

  const template = await loadTemplateById(serviceClient, templateId);
  const audience = await buildCampaignAudience(payload, { env, serviceClient });
  const recipients = audience.recipients.slice(0, CAMPAIGN_MAX_RECIPIENTS);

  if (audience.recipients.length === 0) {
    throw new Error('No encontramos destinatarios válidos para este envío.');
  }

  if (audience.recipients.length > CAMPAIGN_MAX_RECIPIENTS) {
    throw new Error(`Por seguridad, cada envío está limitado a ${CAMPAIGN_MAX_RECIPIENTS} destinatarios.`);
  }

  const campaign = await createCampaignRecord({
    serviceClient,
    adminUserId,
    template,
    segment: audience.segment,
    totalRecipients: recipients.length,
    variableDefaults: payload?.variableDefaults || {},
    campaignName: payload?.campaignName || '',
  });

  let sent = 0;
  let failed = 0;
  const results = [];

  for (const recipient of recipients) {
    const variables = buildTemplateVariables(recipient, payload?.variableDefaults || {}, env);
    const subject = interpolateTemplateString(template.subject, variables);
    const html = ensureFooterHtml(
      normalizeTemplateHtmlAssets(interpolateTemplateString(template.html, variables), env)
    );
    const text = interpolateTemplateString(template.text, variables);

    const log = await createEmailLogRecord(serviceClient, {
      user_id: adminUserId,
      template_id: template.id,
      campaign_id: campaign?.id || null,
      type: 'template',
      to_email: recipient.email,
      recipient_email: recipient.email,
      recipient_name: recipient.name || null,
      email: recipient.email,
      name: recipient.name || null,
      subject,
      status: 'pending',
      metadata: {
        variables,
        template_name: template.name,
        source_type: recipient.source_type || 'registered',
        segment: audience.segment,
        recipient_user_id: recipient.user_id || null,
      },
    });

    const sendResult = await sendEmailWithResend(
      {
        to: recipient.email,
        subject,
        html,
        text,
      },
      { env, fetchImpl }
    );

    if (sendResult.ok) {
      sent += 1;
      await updateEmailLogRecord(serviceClient, log?.id, {
        status: 'sent',
        sent_at: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        provider_message_id: sendResult.body?.messageId || null,
      });
      results.push({
        email: recipient.email,
        status: 'sent',
      });
      continue;
    }

    failed += 1;
    await updateEmailLogRecord(serviceClient, log?.id, {
      status: 'failed',
      error_message: sendResult.body?.error || 'No se pudo enviar el correo.',
      timestamp: new Date().toISOString(),
    });
    results.push({
      email: recipient.email,
      status: 'failed',
      error: sendResult.body?.error || 'No se pudo enviar el correo.',
    });
  }

  await finalizeCampaignRecord(serviceClient, campaign?.id, {
    status: failed > 0 && sent === 0 ? 'failed' : 'completed',
    recipients_count: recipients.length,
    recipient_count: recipients.length,
    sent_count: sent,
    failed_count: failed,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  return {
    success: true,
    campaignId: campaign?.id || null,
    counts: {
      total: recipients.length,
      sent,
      failed,
      invalid: audience.invalidRecipients.length,
      limit: CAMPAIGN_MAX_RECIPIENTS,
    },
    results,
  };
}

export async function handleSendEmailPayload(payload = {}, options = {}) {
  const requestId = resolveRequestId(payload, options);
  const startedAt = Date.now();
  const scope = `${payload?.scope || 'user'}`.toLowerCase();
  const action = `${payload?.action || 'send_email'}`.trim().toLowerCase();
  const recipientCount =
    action === 'preview_campaign' || action === 'send_campaign'
      ? Array.isArray(payload?.recipients)
        ? payload.recipients.length
        : 0
      : normalizeRecipients(payload?.to).length;

  bestEffortLog('email.send.attempt', {
    request_id: requestId,
    scope,
    action,
    recipient_count: recipientCount,
  });

  const logResult = (result, { userId = null, role = null } = {}) => {
    const success = Boolean(result?.ok ?? result?.body?.success);
    bestEffortLog(
      'email.send.result',
      {
        request_id: requestId,
        scope,
        action,
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

    let result;
    if (action === 'preview_campaign') {
      const preview = await previewCampaignEmails(payload, {
        env: options?.env || process.env,
      });
      result = {
        ok: true,
        status: 200,
        body: {
          success: true,
          ...preview,
        },
      };
    } else if (action === 'send_campaign') {
      const sendSummary = await sendCampaignEmails(payload, {
        env: options?.env || process.env,
        fetchImpl: options?.fetchImpl || fetch,
        adminUserId: authCheck.userId || null,
      });
      result = {
        ok: true,
        status: 200,
        body: sendSummary,
      };
    } else {
      result = await sendEmailWithResend(payload, options);
    }

    logResult(result, { userId: authCheck.userId || null, role: authCheck.role || null });
    return result;
  } catch (error) {
    const errorMessage = error?.message || 'Error interno enviando email.';
    const lowerMessage = `${errorMessage}`.toLowerCase();
    const status =
      error?.status ||
      (lowerMessage.includes('configuración incompleta') ||
      lowerMessage.includes('supabase_service_role_key') ||
      lowerMessage.includes('resend_api_key')
        ? 500
        : 400);

    bestEffortLog(
      'api.error',
      {
        request_id: requestId,
        endpoint: '/api/send-email',
        scope,
        action,
        recipient_count: recipientCount,
        error_code: 'SEND_EMAIL_INTERNAL_ERROR',
        error_message: errorMessage,
        duration_ms: Date.now() - startedAt,
      },
      'error'
    );

    const result = {
      ok: false,
      status,
      body: {
        success: false,
        code: 'SEND_EMAIL_INTERNAL_ERROR',
        error: errorMessage,
      },
    };
    logResult(result, { userId: null, role: null });
    return result;
  }
}
