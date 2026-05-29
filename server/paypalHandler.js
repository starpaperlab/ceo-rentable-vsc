import { createClient } from '@supabase/supabase-js';

let supabaseAnonClient = null;
let supabaseServiceClient = null;

const PAYPAL_API_BASES = {
  sandbox: 'https://api-m.sandbox.paypal.com',
  live: 'https://api-m.paypal.com',
};

const DEFAULT_PLANS = {
  basico: {
    code: 'basico',
    name: 'Plan Básico',
    amount: '27.00',
    currency: 'USD',
  },
  pro: {
    code: 'pro',
    name: 'Plan Pro',
    amount: '47.00',
    currency: 'USD',
  },
};

function normalizePlanCode(value = '') {
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

function resolveAppUrl(env = process.env) {
  return `${env.APP_URL || env.VITE_APP_URL || 'https://app.ceorentable.com'}`.replace(/\/+$/, '');
}

function resolvePayPalApiBase(env = process.env) {
  const explicitBase = `${env.PAYPAL_API_BASE || ''}`.trim().replace(/\/+$/, '');
  if (explicitBase) return explicitBase;

  const environment = `${env.PAYPAL_ENVIRONMENT || 'sandbox'}`.trim().toLowerCase();
  return PAYPAL_API_BASES[environment] || PAYPAL_API_BASES.sandbox;
}

function resolvePlan(planCode, env = process.env) {
  const normalized = normalizePlanCode(planCode);
  const base = DEFAULT_PLANS[normalized];
  if (!base) return null;

  const amountEnvName = `PAYPAL_PLAN_${normalized.toUpperCase()}_AMOUNT`;
  const currencyEnvName = `PAYPAL_PLAN_${normalized.toUpperCase()}_CURRENCY`;

  const amount = `${env[amountEnvName] || base.amount}`.trim();
  const currency = `${env[currencyEnvName] || env.PAYPAL_CURRENCY || base.currency}`.trim().toUpperCase();

  return {
    ...base,
    amount,
    currency,
  };
}

async function authenticate(payload = {}, { env = process.env, headers = {} } = {}) {
  const token = getBearerToken(payload, headers);
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: 'Debes iniciar sesión para continuar al pago.',
    };
  }

  const anonClient = getSupabaseAnonClient(env);
  if (!anonClient) {
    return {
      ok: false,
      status: 500,
      error: 'Configuración incompleta de Supabase en servidor.',
    };
  }

  const { data, error } = await anonClient.auth.getUser(token);
  if (error || !data?.user?.id) {
    return {
      ok: false,
      status: 401,
      error: `Sesión inválida o expirada.${error?.message ? ` ${error.message}` : ''}`,
    };
  }

  return {
    ok: true,
    user: data.user,
    token,
  };
}

async function getPayPalAccessToken({ env = process.env, fetchImpl = fetch } = {}) {
  const clientId = `${env.PAYPAL_CLIENT_ID || ''}`.trim();
  const clientSecret = `${env.PAYPAL_CLIENT_SECRET || ''}`.trim();
  if (!clientId || !clientSecret) {
    return {
      ok: false,
      status: 500,
      error: 'Faltan PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET en el servidor.',
    };
  }

  const apiBase = resolvePayPalApiBase(env);
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetchImpl(`${apiBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    return {
      ok: false,
      status: response.status || 502,
      error: payload?.error_description || payload?.error || 'No se pudo autenticar con PayPal.',
    };
  }

  return {
    ok: true,
    accessToken: payload.access_token,
    apiBase,
  };
}

function findApprovalUrl(orderPayload = {}) {
  const links = Array.isArray(orderPayload?.links) ? orderPayload.links : [];
  const approve = links.find((link) => `${link?.rel || ''}`.toLowerCase() === 'approve');
  return approve?.href || null;
}

async function createOrderWithPayPal(input, { env = process.env, fetchImpl = fetch } = {}) {
  const auth = await getPayPalAccessToken({ env, fetchImpl });
  if (!auth.ok) {
    return {
      ok: false,
      status: auth.status || 500,
      body: {
        success: false,
        code: 'PAYPAL_AUTH_FAILED',
        error: auth.error,
      },
    };
  }

  const appUrl = resolveAppUrl(env);
  const returnUrl = `${appUrl}/payment-success?provider=paypal`;
  const cancelUrl = `${appUrl}/payment-cancel?provider=paypal`;

  const response = await fetchImpl(`${auth.apiBase}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: input.plan.code,
          custom_id: input.userId,
          description: `${input.plan.name} - CEO Rentable OS`,
          amount: {
            currency_code: input.plan.currency,
            value: input.plan.amount,
          },
        },
      ],
      application_context: {
        brand_name: 'CEO Rentable OS',
        landing_page: 'LOGIN',
        user_action: 'PAY_NOW',
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  const approvalUrl = findApprovalUrl(payload);

  if (!response.ok || !payload?.id || !approvalUrl) {
    return {
      ok: false,
      status: response.status || 502,
      body: {
        success: false,
        code: 'PAYPAL_ORDER_CREATE_FAILED',
        error: payload?.message || payload?.error_description || 'No se pudo crear la orden de PayPal.',
      },
    };
  }

  return {
    ok: true,
    status: 200,
    body: {
      success: true,
      orderId: payload.id,
      approvalUrl,
      approval_url: approvalUrl,
      status: payload.status || 'CREATED',
      plan: input.plan,
    },
  };
}

function isMissingTableError(error, tableName = '') {
  const text = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  const table = `${tableName}`.toLowerCase();
  return (
    error?.code === 'PGRST205' ||
    text.includes('could not find the table') ||
    (table && text.includes(`table 'public.${table}'`))
  );
}

async function savePayPalOrderIfTableExists(input, result, env = process.env) {
  const serviceClient = getSupabaseServiceClient(env);
  if (!serviceClient || !result?.body?.orderId) return;

  const now = new Date().toISOString();
  const { error } = await serviceClient.from('paypal_orders').insert({
    user_id: input.userId,
    paypal_order_id: result.body.orderId,
    plan_code: input.plan.code,
    amount: Number(input.plan.amount),
    currency: input.plan.currency,
    status: `${result.body.status || 'CREATED'}`.toLowerCase(),
    approval_url: result.body.approvalUrl,
    created_at: now,
    updated_at: now,
  });

  if (error && !isMissingTableError(error, 'paypal_orders')) {
    throw error;
  }
}

export async function handleCreatePayPalOrderPayload(payload = {}, options = {}) {
  try {
    const auth = await authenticate(payload, options);
    if (!auth.ok) {
      return {
        ok: false,
        status: auth.status || 401,
        body: {
          success: false,
          code: 'PAYPAL_ORDER_UNAUTHORIZED',
          error: auth.error || 'No autorizado.',
        },
      };
    }

    const planCode = normalizePlanCode(payload.planCode || payload.plan);
    const plan = resolvePlan(planCode, options.env || process.env);
    if (!plan) {
      return {
        ok: false,
        status: 400,
        body: {
          success: false,
          code: 'INVALID_PLAN',
          error: 'Plan inválido para PayPal.',
        },
      };
    }

    const input = {
      userId: auth.user.id,
      email: auth.user.email || null,
      plan,
    };

    const result = await createOrderWithPayPal(input, options);
    if (result.ok) {
      await savePayPalOrderIfTableExists(input, result, options.env || process.env);
    }

    return result;
  } catch (error) {
    return {
      ok: false,
      status: 500,
      body: {
        success: false,
        code: 'PAYPAL_ORDER_INTERNAL_ERROR',
        error: error?.message || 'Error interno creando orden PayPal.',
      },
    };
  }
}
