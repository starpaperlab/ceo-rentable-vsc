import { createClient } from '@supabase/supabase-js';

const PAYPAL_API_BASES = {
  sandbox: 'https://api-m.sandbox.paypal.com',
  live: 'https://api-m.paypal.com',
};

const SUBSCRIPTION_EVENTS = new Set([
  'BILLING.SUBSCRIPTION.CREATED',
  'BILLING.SUBSCRIPTION.ACTIVATED',
  'BILLING.SUBSCRIPTION.UPDATED',
  'BILLING.SUBSCRIPTION.CANCELLED',
  'BILLING.SUBSCRIPTION.SUSPENDED',
  'BILLING.SUBSCRIPTION.EXPIRED',
  'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
]);

function getHeader(headers = {}, key = '') {
  const lower = key.toLowerCase();
  const found = Object.entries(headers || {}).find(([name]) => `${name}`.toLowerCase() === lower);
  return `${found?.[1] || ''}`.trim();
}

function getServiceClient(env = process.env) {
  const url = `${env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''}`.trim();
  const serviceRole = `${env.SUPABASE_SERVICE_ROLE_KEY || ''}`.trim();
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
}

function apiBase(env = process.env) {
  const explicit = `${env.PAYPAL_API_BASE || ''}`.trim().replace(/\/+$/, '');
  if (explicit) return explicit;
  const target = `${env.PAYPAL_ENVIRONMENT || 'sandbox'}`.trim().toLowerCase();
  return PAYPAL_API_BASES[target] || PAYPAL_API_BASES.sandbox;
}

async function accessToken(env = process.env) {
  const clientId = `${env.PAYPAL_CLIENT_ID || ''}`.trim();
  const clientSecret = `${env.PAYPAL_CLIENT_SECRET || ''}`.trim();
  if (!clientId || !clientSecret) throw new Error('PAYPAL_SERVER_CONFIG_MISSING');

  const response = await fetch(`${apiBase(env)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) throw new Error('PAYPAL_AUTH_FAILED');
  return payload.access_token;
}

async function verifySignature(event, { env = process.env, headers = {} } = {}) {
  const webhookId = `${env.PAYPAL_WEBHOOK_ID || ''}`.trim();
  if (!webhookId) throw new Error('PAYPAL_WEBHOOK_ID_MISSING');
  const token = await accessToken(env);
  const response = await fetch(`${apiBase(env)}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_algo: getHeader(headers, 'paypal-auth-algo'),
      cert_url: getHeader(headers, 'paypal-cert-url'),
      transmission_id: getHeader(headers, 'paypal-transmission-id'),
      transmission_sig: getHeader(headers, 'paypal-transmission-sig'),
      transmission_time: getHeader(headers, 'paypal-transmission-time'),
      webhook_id: webhookId,
      webhook_event: event,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  return response.ok && payload?.verification_status === 'SUCCESS';
}

function mapLifecycleStatus(eventType, resource = {}) {
  if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED') return 'active';
  if (eventType === 'BILLING.SUBSCRIPTION.CANCELLED') return 'cancelled';
  if (eventType === 'BILLING.SUBSCRIPTION.SUSPENDED') return 'suspended';
  if (eventType === 'BILLING.SUBSCRIPTION.EXPIRED') return 'expired';
  if (eventType === 'BILLING.SUBSCRIPTION.PAYMENT.FAILED') return 'payment_failed';
  if (eventType === 'BILLING.SUBSCRIPTION.CREATED') return `${resource.status || 'approval_pending'}`.toLowerCase();
  return `${resource.status || 'active'}`.toLowerCase();
}

function shouldHaveAccess(status, current = {}) {
  if (status === 'active' || status === 'trialing') return true;
  if (status === 'payment_failed') return Boolean(current.user_id);
  if (status === 'cancelled') {
    const nextBilling = current.next_billing_time ? new Date(current.next_billing_time).getTime() : 0;
    return nextBilling > Date.now();
  }
  return false;
}

export function isPayPalSubscriptionEvent(eventType = '') {
  return SUBSCRIPTION_EVENTS.has(`${eventType || ''}`.trim());
}

export async function handlePayPalSubscriptionWebhookPayload(payload = {}, options = {}) {
  const eventType = `${payload?.event_type || ''}`.trim();
  if (!isPayPalSubscriptionEvent(eventType)) return null;

  const service = getServiceClient(options.env || process.env);
  if (!service) {
    return { status: 500, body: { success: false, code: 'SUPABASE_SERVICE_NOT_CONFIGURED' } };
  }

  const verified = await verifySignature(payload, options).catch(() => false);
  if (!verified) {
    return { status: 401, body: { success: false, code: 'PAYPAL_WEBHOOK_SIGNATURE_INVALID' } };
  }

  const resource = payload?.resource || {};
  const subscriptionId = `${resource?.id || ''}`.trim();
  if (!subscriptionId) {
    return { status: 400, body: { success: false, code: 'PAYPAL_SUBSCRIPTION_ID_MISSING' } };
  }

  const { data: current, error: findError } = await service
    .from('paypal_subscriptions')
    .select('*')
    .eq('paypal_subscription_id', subscriptionId)
    .maybeSingle();

  if (findError) {
    return { status: 500, body: { success: false, code: 'SUBSCRIPTION_LOOKUP_FAILED' } };
  }

  // CREATED can arrive before the browser has verified and persisted the subscription.
  // A later onApprove verification or lifecycle webhook will reconcile it safely.
  if (!current?.user_id) {
    return { status: 200, body: { success: true, status: 'unmatched_subscription_ignored', eventType } };
  }

  const status = mapLifecycleStatus(eventType, resource);
  const nextBillingTime = resource?.billing_info?.next_billing_time || current.next_billing_time || null;
  const now = new Date().toISOString();

  const { error: updateError } = await service
    .from('paypal_subscriptions')
    .update({
      status,
      raw_provider_status: `${resource?.status || status}`.toUpperCase(),
      next_billing_time: nextBillingTime,
      updated_at: now,
    })
    .eq('paypal_subscription_id', subscriptionId);

  if (updateError) {
    return { status: 500, body: { success: false, code: 'SUBSCRIPTION_UPDATE_FAILED' } };
  }

  const keepAccess = shouldHaveAccess(status, { ...current, next_billing_time: nextBillingTime });

  const { error: appSubscriptionError } = await service.from('subscriptions').upsert({
    user_id: current.user_id,
    plan: current.plan_code,
    plan_code: current.plan_code,
    status,
    is_lifetime: false,
    access_source: 'paypal',
    payment_provider: 'paypal',
    metadata: {
      paypal_subscription_id: subscriptionId,
      paypal_plan_id: current.paypal_plan_id,
      paypal_event_id: payload?.id || null,
      next_billing_time: nextBillingTime,
    },
    updated_at: now,
  }, { onConflict: 'user_id' });

  if (appSubscriptionError) {
    return { status: 500, body: { success: false, code: 'APP_SUBSCRIPTION_UPDATE_FAILED' } };
  }

  const { error: userError } = await service
    .from('users')
    .update({
      has_access: keepAccess,
      plan: current.plan_code,
      is_lifetime: false,
      payment_provider: 'paypal',
      access_source: 'paypal',
      updated_at: now,
    })
    .eq('id', current.user_id);

  if (userError) {
    return { status: 500, body: { success: false, code: 'USER_ACCESS_UPDATE_FAILED' } };
  }

  return {
    status: 200,
    body: {
      success: true,
      status: 'processed',
      subscriptionStatus: status,
      access: keepAccess,
    },
  };
}
