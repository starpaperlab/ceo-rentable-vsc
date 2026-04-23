import { createClient } from '@supabase/supabase-js';

const STRIPE_CREATE_SESSION_URL = 'https://api.stripe.com/v1/checkout/sessions';

let supabaseAnonClient = null;
let supabaseServiceClient = null;

function normalizeEmail(value = '') {
  const normalized = `${value || ''}`.trim().toLowerCase();
  return normalized || null;
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

function resolvePlanPriceId(planKey, env = process.env) {
  const normalized = `${planKey || ''}`.trim().toLowerCase();
  if (!normalized) return null;

  const map = {
    basico:
      `${env.STRIPE_PLAN_BASICO_ID || env.STRIPE_PRICE_BASICO_ID || env.VITE_STRIPE_PLAN_BASICO_ID || ''}`.trim() ||
      null,
    pro:
      `${env.STRIPE_PLAN_PRO_ID || env.STRIPE_PRICE_PRO_ID || env.VITE_STRIPE_PLAN_PRO_ID || ''}`.trim() || null,
  };

  return map[normalized] || null;
}

function resolveAppUrl(env = process.env) {
  return `${env.APP_URL || env.VITE_APP_URL || 'https://app.ceorentable.com'}`.replace(/\/+$/, '');
}

async function authenticate(payload = {}, { env = process.env, headers = {} } = {}) {
  const token = getBearerToken(payload, headers);
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: 'Debes iniciar sesión para continuar al checkout.',
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

async function getCustomerIdFromProfile(userId, env = process.env) {
  const serviceClient = getSupabaseServiceClient(env);
  if (!serviceClient || !userId) return null;

  const { data, error } = await serviceClient
    .from('users')
    .select('stripe_customer_id')
    .eq('id', userId)
    .maybeSingle();

  if (error) return null;

  const customerId = `${data?.stripe_customer_id || ''}`.trim();
  return customerId || null;
}

async function createCheckoutSessionWithStripe(input, { env = process.env, fetchImpl = fetch } = {}) {
  const stripeSecret = `${env.STRIPE_SECRET_KEY || ''}`.trim();
  if (!stripeSecret) {
    return {
      ok: false,
      status: 500,
      body: {
        success: false,
        code: 'STRIPE_NOT_CONFIGURED',
        error: 'Falta STRIPE_SECRET_KEY en el servidor.',
      },
    };
  }

  const appUrl = resolveAppUrl(env);
  const successUrl = `${appUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${appUrl}/payment-cancel`;

  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('line_items[0][price]', input.priceId);
  params.set('line_items[0][quantity]', '1');
  params.set('success_url', successUrl);
  params.set('cancel_url', cancelUrl);
  params.set('allow_promotion_codes', 'true');

  if (input.userId) {
    params.set('client_reference_id', input.userId);
    params.set('metadata[user_id]', input.userId);
    params.set('subscription_data[metadata][user_id]', input.userId);
  }

  if (input.email) {
    params.set('metadata[email]', input.email);
    params.set('subscription_data[metadata][email]', input.email);
  }

  if (input.plan) {
    params.set('metadata[plan]', input.plan);
    params.set('subscription_data[metadata][plan]', input.plan);
  }

  if (input.customerId) {
    params.set('customer', input.customerId);
  } else if (input.email) {
    params.set('customer_email', input.email);
  }

  const response = await fetchImpl(STRIPE_CREATE_SESSION_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      status: response.status || 502,
      body: {
        success: false,
        code: 'STRIPE_CHECKOUT_CREATE_FAILED',
        error: payload?.error?.message || payload?.message || 'No se pudo crear la sesión de Stripe.',
      },
    };
  }

  return {
    ok: true,
    status: 200,
    body: {
      success: true,
      sessionId: payload?.id || null,
      url: payload?.url || null,
    },
  };
}

export async function handleCreateStripeCheckoutSessionPayload(payload = {}, options = {}) {
  try {
    const auth = await authenticate(payload, options);
    if (!auth.ok) {
      return {
        ok: false,
        status: auth.status || 401,
        body: {
          success: false,
          code: 'CHECKOUT_UNAUTHORIZED',
          error: auth.error || 'No autorizado.',
        },
      };
    }

    const planKey = `${payload.planKey || payload.plan || ''}`.trim().toLowerCase();
    const priceId = resolvePlanPriceId(planKey, options.env || process.env);

    if (!planKey || !priceId) {
      return {
        ok: false,
        status: 400,
        body: {
          success: false,
          code: 'INVALID_PLAN',
          error: 'Plan inválido o no configurado en Stripe.',
        },
      };
    }

    const authEmail = normalizeEmail(auth.user?.email);
    const payloadEmail = normalizeEmail(payload.email);
    const email = authEmail || payloadEmail;

    const userId = `${auth.user?.id || payload.userId || ''}`.trim() || null;
    const customerId = await getCustomerIdFromProfile(userId, options.env || process.env);

    return createCheckoutSessionWithStripe(
      {
        plan: planKey,
        priceId,
        email,
        userId,
        customerId,
      },
      options
    );
  } catch (error) {
    return {
      ok: false,
      status: 500,
      body: {
        success: false,
        code: 'CHECKOUT_INTERNAL_ERROR',
        error: error?.message || 'Error interno creando checkout.',
      },
    };
  }
}
