import { unwrapWebhook } from '@whop/sdk/helpers';
import { WHOP_API_VERSION, WHOP_EVENTS, WHOP_PLANS, response, serviceClient, whopClient } from './whop.js';

export function membershipSnapshot(membership, now = Date.now()) {
  const planCode = Object.keys(WHOP_PLANS).find(code => WHOP_PLANS[code].id === membership.variant_id);
  if (!planCode || !membership.user_id || !membership.account?.id || !membership.updated_at || !membership.created_at) throw new Error('INVALID_MEMBERSHIP');
  const periodEnd = membership.current_period_end || membership.expires_at;
  if (!Number.isFinite(Date.parse(membership.updated_at)) || !Number.isFinite(Date.parse(membership.created_at))) throw new Error('INVALID_MEMBERSHIP_DATE');
  const status = ({ trialing: 'trialing', active: 'active', canceling: 'cancelled', canceled: 'cancelled', expired: 'expired', past_due: 'payment_failed', unresolved: 'payment_failed', drafted: 'incomplete' })[membership.status];
  if (!status) throw new Error('UNSUPPORTED_MEMBERSHIP_STATUS');
  // A scheduled cancellation preserves the current period; a completed cancellation does not.
  const access = ['trialing', 'active', 'canceling', 'past_due'].includes(membership.status) && Date.parse(periodEnd) > now;
  return {
    membership_id: membership.id, customer_id: membership.user_id, account_id: membership.account.id,
    plan_id: membership.variant_id, plan_code: planCode, status, access,
    created_at: membership.created_at, updated_at: membership.updated_at,
    period_start: membership.current_period_start, period_end: periodEnd,
    trial_start: membership.status === 'trialing' ? membership.current_period_start || membership.created_at : null,
    trial_end: membership.status === 'trialing' ? periodEnd : null,
    next_billing_at: membership.cancel_at_period_end || membership.status === 'canceled' ? null : membership.current_period_end,
    cancel_at_period_end: membership.cancel_at_period_end, canceled_at: membership.canceled_at,
  };
}

export async function handleWhopWebhook(raw, { env = process.env, headers = {}, service, whop } = {}) {
  if (!env.WHOP_WEBHOOK_SECRET) return response(503, { code: 'WEBHOOK_NOT_CONFIGURED' });
  let event;
  try { event = unwrapWebhook(raw, { headers, key: env.WHOP_WEBHOOK_SECRET }); }
  catch { return response(401, { code: 'INVALID_SIGNATURE' }); }
  if (!event.id || !event.timestamp || !Number.isFinite(Date.parse(event.timestamp)) || !event.data?.id) return response(400, { code: 'INVALID_EVENT' });
  if (!WHOP_EVENTS.includes(event.type)) return response(200, { status: 'ignored' });
  if (event.api_version_date !== WHOP_API_VERSION) return response(400, { code: 'UNSUPPORTED_API_VERSION' });
  try {
    service ||= serviceClient(env); whop ||= whopClient(env);
    let membershipId;
    if (event.type.startsWith('membership.')) membershipId = event.data.id;
    else {
      const paymentId = event.type.startsWith('refund.') ? event.data.payment_id : event.data.id;
      if (!paymentId) return response(400, { code: 'PAYMENT_ID_MISSING' });
      const payment = await whop.payments.retrieve({ id: paymentId });
      membershipId = payment.membership_id;
    }
    if (!membershipId) return response(200, { status: 'no_membership' });
    // Fetch current state: delayed payment/refund deliveries cannot resurrect expired access.
    const membership = await whop.memberships.retrieve({ id: membershipId });
    if (!Object.values(WHOP_PLANS).some(plan => plan.id === membership.variant_id)) return response(200, { status: 'unrelated_plan' });
    if (membership.id !== membershipId || (event.account_id && event.account_id !== membership.account?.id)) return response(400, { code: 'ACCOUNT_MISMATCH' });
    const intentId = membership.metadata?.ceo_checkout_intent;
    if (!/^[0-9a-f-]{36}$/i.test(intentId || '')) return response(200, { status: 'unmatched_membership' });
    const snapshot = membershipSnapshot(membership);
    const { data, error } = await service.rpc('apply_whop_membership', {
      p_event_id: event.id, p_event_type: event.type, p_intent_id: intentId, p_snapshot: snapshot,
    });
    if (error) return response(503, { code: 'PERSISTENCE_RETRY_REQUIRED' });
    return response(200, { status: data?.status || 'processed' });
  } catch { return response(503, { code: 'RECONCILIATION_RETRY_REQUIRED' }); }
}
