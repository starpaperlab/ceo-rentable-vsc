import { WhopClient } from '@whop/sdk';
import { createClient } from '@supabase/supabase-js';

export const WHOP_API_VERSION = '2026-10-28';
export const WHOP_PLANS = Object.freeze({
  monthly: { id: 'plan_erGFyQYebyWFZ', amount: 17.99, period: 30 },
  annual: { id: 'plan_rx46nFwgZymzX', amount: 179, period: 365 },
});
export const WHOP_EVENTS = Object.freeze([
  'membership.activated', 'membership.updated', 'membership.deactivated',
  'payment.succeeded', 'payment.failed', 'refund.created', 'refund.updated',
]);
export const APP_ORIGIN = 'https://app.ceorentable.com';

export function whopClient(env = process.env) {
  if (!env.WHOP_API_KEY) throw new Error('WHOP_NOT_CONFIGURED');
  return new WhopClient({ token: env.WHOP_API_KEY, apiVersionDate: WHOP_API_VERSION, timeoutInSeconds: 8, maxRetries: 0 });
}
export function serviceClient(env = process.env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  if (!url || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('DATABASE_NOT_CONFIGURED');
  return createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function authenticatedUser(headers, service) {
  const token = /^Bearer\s+(.+)$/i.exec(headers?.authorization || '')?.[1];
  if (!token) return null;
  const { data, error } = await service.auth.getUser(token);
  return error ? null : data?.user;
}
export function assertPlan(variant, code) {
  const plan = WHOP_PLANS[code];
  if (!plan || variant?.id !== plan.id || variant.billing_type !== 'renewal' ||
      variant.currency?.toLowerCase() !== 'usd' || Number(variant.renewal_price) !== plan.amount ||
      Number(variant.initial_price) !== 0 || variant.trial_period_days !== 10 ||
      variant.billing_period !== plan.period || variant.release_method !== 'buy_now') {
    throw new Error('WHOP_PLAN_CONFIGURATION_MISMATCH');
  }
}
export async function assertWebhook(whop, env) {
  if (!env.WHOP_WEBHOOK_SECRET || !env.WHOP_WEBHOOK_ID) throw new Error('WHOP_WEBHOOK_NOT_CONFIGURED');
  const hook = await whop.webhooks.retrieve({ id: env.WHOP_WEBHOOK_ID });
  if (!hook.enabled || hook.api_version !== 'v1' || hook.url !== `${APP_ORIGIN}/api/whop/webhook` ||
      hook.api_version_date !== WHOP_API_VERSION || hook.child_resource_events ||
      !WHOP_EVENTS.every(event => hook.events.includes(event))) throw new Error('WHOP_WEBHOOK_NOT_READY');
  return hook;
}
export function safePurchaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'whop.com' || url.username || url.password || !url.pathname.startsWith('/checkout/')) {
    throw new Error('INVALID_WHOP_CHECKOUT_URL');
  }
  return url.href;
}
export const response = (status, body) => ({ status, body });
