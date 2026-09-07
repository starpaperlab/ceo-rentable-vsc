import { createClient } from '@supabase/supabase-js';

const PAYPAL_API_BASES = {
  sandbox: 'https://api-m.sandbox.paypal.com',
  live: 'https://api-m.paypal.com',
};

const PAYPAL_SETTLE_RETRIES = 4;
const PAYPAL_SETTLE_DELAY_MS = 750;
const ACCESS_GRANT_PROVIDER_STATUSES = new Set(['ACTIVE', 'APPROVED']);

function json(res, status, body) {
  res.status(status).json(body);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBearerToken(req) {
  const header = `${req.headers?.authorization || ''}`;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function getSupabaseAnonClient() {
  const url = `${process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''}`.trim();
  const anon = `${process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''}`.trim();
  if (!url || !anon) return null;
  return createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
}

function getSupabaseServiceClient() {
  const url = `${process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''}`.trim();
  const serviceRole = `${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`.trim();
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getPayPalAccessToken() {
  const clientId = `${process.env.PAYPAL_CLIENT_ID || ''}`.trim();
  const clientSecret = `${process.env.PAYPAL_CLIENT_SECRET || ''}`.trim();
  const environment = `${process.env.PAYPAL_ENVIRONMENT || 'sandbox'}`.trim().toLowerCase();
  const apiBase = `${process.env.PAYPAL_API_BASE || PAYPAL_API_BASES[environment] || PAYPAL_API_BASES.sandbox}`.replace(/\/+$/, '');

  if (!clientId || !clientSecret) throw new Error('PAYPAL_SERVER_CONFIG_MISSING');

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) throw new Error('PAYPAL_AUTH_FAILED');
  return { accessToken: payload.access_token, apiBase };
}

function expectedPlanId(planCode) {
  if (planCode === 'monthly') {
    return `${process.env.PAYPAL_BILLING_PLAN_MONTHLY_ID || process.env.VITE_PAYPAL_BILLING_PLAN_MONTHLY_ID || ''}`.trim();
  }
  if (planCode === 'annual') {
    return `${process.env.PAYPAL_BILLING_PLAN_ANNUAL_ID || process.env.VITE_PAYPAL_BILLING_PLAN_ANNUAL_ID || ''}`.trim();
  }
  return '';
}

function deriveAppStatus(subscription) {
  const providerStatus = `${subscription?.status || ''}`.toUpperCase();
  const nextBilling = subscription?.billing_info?.next_billing_time
    ? new Date(subscription.billing_info.next_billing_time).getTime()
    : 0;

  if (providerStatus === 'APPROVED') return 'trialing';
  if (providerStatus !== 'ACTIVE') return providerStatus.toLowerCase();
  return nextBilling > Date.now() ? 'trialing' : 'active';
}

async function fetchPayPalSubscription({ apiBase, accessToken, subscriptionId }) {
  let lastResponse = null;
  let lastSubscription = null;

  for (let attempt = 0; attempt < PAYPAL_SETTLE_RETRIES; attempt += 1) {
    const response = await fetch(`${apiBase}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    const subscription = await response.json().catch(() => ({}));
    lastResponse = response;
    lastSubscription = subscription;

    if (!response.ok) return { response, subscription };

    const providerStatus = `${subscription?.status || ''}`.toUpperCase();
    if (ACCESS_GRANT_PROVIDER_STATUSES.has(providerStatus)) {
      return { response, subscription };
    }

    if (providerStatus !== 'APPROVAL_PENDING' || attempt === PAYPAL_SETTLE_RETRIES - 1) {
      return { response, subscription };
    }

    await sleep(PAYPAL_SETTLE_DELAY_MS);
  }

  return { response: lastResponse, subscription: lastSubscription };
}

async function activateVerifiedSubscription({ service, userId, subscription, subscriptionId, planCode }) {
  const now = new Date().toISOString();
  const appStatus = deriveAppStatus(subscription);
  const nextBillingTime = subscription?.billing_info?.next_billing_time || null;

  const { error: saveError } = await service.from('paypal_subscriptions').upsert({
    user_id: userId,
    paypal_subscription_id: subscriptionId,
    paypal_plan_id: subscription.plan_id,
    plan_code: planCode,
    status: appStatus,
    payer_email: subscription?.subscriber?.email_address || null,
    start_time: subscription?.start_time || null,
    next_billing_time: nextBillingTime,
    raw_provider_status: `${subscription.status || ''}`.toUpperCase(),
    updated_at: now,
  }, { onConflict: 'paypal_subscription_id' });
  if (saveError) throw new Error('SUBSCRIPTION_PERSIST_FAILED');

  const { error: subscriptionError } = await service.from('subscriptions').upsert({
    user_id: userId,
    plan: 'subscription',
    plan_code: planCode,
    status: appStatus,
    is_lifetime: false,
    access_source: 'paypal',
    payment_provider: 'paypal',
    provider_subscription_id: subscriptionId,
    metadata: {
      paypal_subscription_id: subscriptionId,
      paypal_plan_id: subscription.plan_id,
      next_billing_time: nextBillingTime,
      raw_provider_status: `${subscription.status || ''}`.toUpperCase(),
    },
    updated_at: now,
  }, { onConflict: 'user_id' });
  if (subscriptionError) throw new Error('APP_SUBSCRIPTION_UPDATE_FAILED');

  const { error: userError } = await service.from('users').update({
    has_access: true,
    access_status: 'active',
    plan: 'subscription',
    is_lifetime: false,
    payment_provider: 'paypal',
    access_source: 'paypal',
    provider_customer_id: subscriptionId,
    updated_at: now,
  }).eq('id', userId);
  if (userError) throw new Error('USER_ACCESS_UPDATE_FAILED');

  return { appStatus, nextBillingTime };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { success: false, code: 'METHOD_NOT_ALLOWED' });
  }

  const subscriptionId = `${req.body?.subscriptionId || ''}`.trim();
  const planCode = `${req.body?.planCode || ''}`.trim().toLowerCase();
  if (!subscriptionId || !['monthly', 'annual'].includes(planCode)) {
    return json(res, 400, { success: false, code: 'INVALID_SUBSCRIPTION_REQUEST', error: 'Faltan datos de la suscripción.' });
  }

  const expected = expectedPlanId(planCode);
  if (!expected) {
    return json(res, 503, { success: false, code: 'PAYPAL_PLAN_NOT_CONFIGURED', error: 'El plan de suscripción todavía no está configurado.' });
  }

  const token = getBearerToken(req);
  const anon = getSupabaseAnonClient();
  const service = getSupabaseServiceClient();
  if (!token || !anon || !service) {
    return json(res, 401, { success: false, code: 'AUTH_REQUIRED', error: 'Debes iniciar sesión para confirmar la suscripción.' });
  }

  let authData;
  try {
    const authResult = await anon.auth.getUser(token);
    authData = authResult.data;
    if (authResult.error || !authData?.user?.id) throw new Error('AUTH_REQUIRED');
  } catch {
    return json(res, 401, { success: false, code: 'AUTH_REQUIRED', error: 'Tu sesión expiró. Inicia sesión nuevamente.' });
  }

  const user = authData.user;

  try {
    const paypal = await getPayPalAccessToken();
    const { response, subscription } = await fetchPayPalSubscription({
      apiBase: paypal.apiBase,
      accessToken: paypal.accessToken,
      subscriptionId,
    });

    if (!response?.ok) {
      return json(res, 502, { success: false, code: 'PAYPAL_SUBSCRIPTION_LOOKUP_FAILED', error: 'No pudimos verificar la suscripción con PayPal.' });
    }

    if (`${subscription.plan_id || ''}` !== expected) {
      return json(res, 409, { success: false, code: 'PAYPAL_PLAN_MISMATCH', error: 'El plan confirmado por PayPal no coincide con el plan seleccionado.' });
    }

    const providerStatus = `${subscription.status || ''}`.toUpperCase();
    if (!ACCESS_GRANT_PROVIDER_STATUSES.has(providerStatus)) {
      return json(res, 409, {
        success: false,
        code: 'PAYPAL_SUBSCRIPTION_NOT_READY',
        providerStatus,
        error: providerStatus === 'APPROVAL_PENDING'
          ? 'PayPal todavía está terminando de registrar tu aprobación. Inténtalo nuevamente en unos segundos.'
          : 'PayPal no confirmó la suscripción como aprobada o activa.',
      });
    }

    const activated = await activateVerifiedSubscription({
      service,
      userId: user.id,
      subscription,
      subscriptionId,
      planCode,
    });

    return json(res, 200, {
      success: true,
      subscriptionId,
      planCode,
      status: activated.appStatus,
      providerStatus,
      nextBillingTime: activated.nextBillingTime,
    });
  } catch (error) {
    console.error('verify PayPal subscription failed', error?.message || error);
    return json(res, 500, { success: false, code: 'PAYPAL_SUBSCRIPTION_VERIFY_FAILED', error: 'No pudimos confirmar la suscripción en este momento.' });
  }
}
