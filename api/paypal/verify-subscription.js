import { createClient } from '@supabase/supabase-js';

const PAYPAL_API_BASES = {
  sandbox: 'https://api-m.sandbox.paypal.com',
  live: 'https://api-m.paypal.com',
};

function json(res, status, body) {
  res.status(status).json(body);
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

  const { data: authData, error: authError } = await anon.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user?.id) {
    return json(res, 401, { success: false, code: 'AUTH_REQUIRED', error: 'Tu sesión expiró. Inicia sesión nuevamente.' });
  }

  try {
    const paypal = await getPayPalAccessToken();
    const response = await fetch(`${paypal.apiBase}/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      headers: {
        Authorization: `Bearer ${paypal.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    const subscription = await response.json().catch(() => ({}));
    if (!response.ok) {
      return json(res, 502, { success: false, code: 'PAYPAL_SUBSCRIPTION_LOOKUP_FAILED', error: 'No pudimos verificar la suscripción con PayPal.' });
    }

    if (`${subscription.plan_id || ''}` !== expected) {
      return json(res, 409, { success: false, code: 'PAYPAL_PLAN_MISMATCH', error: 'El plan confirmado por PayPal no coincide con el plan seleccionado.' });
    }

    const status = `${subscription.status || ''}`.toUpperCase();
    if (!['ACTIVE', 'APPROVAL_PENDING'].includes(status)) {
      return json(res, 409, { success: false, code: 'PAYPAL_SUBSCRIPTION_NOT_ACTIVE', error: 'PayPal todavía no confirmó la suscripción como activa.' });
    }

    const now = new Date().toISOString();
    const { error: saveError } = await service.from('paypal_subscriptions').upsert({
      user_id: user.id,
      paypal_subscription_id: subscriptionId,
      paypal_plan_id: subscription.plan_id,
      plan_code: planCode,
      status: status.toLowerCase(),
      payer_email: subscription?.subscriber?.email_address || null,
      start_time: subscription?.start_time || null,
      next_billing_time: subscription?.billing_info?.next_billing_time || null,
      raw_provider_status: status,
      updated_at: now,
    }, { onConflict: 'paypal_subscription_id' });

    if (saveError) {
      console.error('paypal_subscriptions upsert failed', saveError);
      return json(res, 500, { success: false, code: 'SUBSCRIPTION_PERSIST_FAILED', error: 'La suscripción fue creada, pero no pudimos guardar su confirmación. No se activó el acceso automáticamente.' });
    }

    return json(res, 200, {
      success: true,
      subscriptionId,
      planCode,
      status: status.toLowerCase(),
      nextBillingTime: subscription?.billing_info?.next_billing_time || null,
    });
  } catch (error) {
    console.error('verify PayPal subscription failed', error);
    return json(res, 500, { success: false, code: error?.message || 'PAYPAL_SUBSCRIPTION_VERIFY_FAILED', error: 'No pudimos confirmar la suscripción en este momento.' });
  }
}
