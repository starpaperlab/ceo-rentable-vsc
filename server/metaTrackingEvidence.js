// Evidence derived only after the existing server handler verified PayPal and activated access.
// This helper does not change pricing, subscription activation, or call Meta/CAPI.
export function trialTrackingEvidence(subscription, {subscriptionId,planCode,appStatus}) {
  const cycles = subscription?.billing_info?.cycle_executions;
  const trial = Array.isArray(cycles) ? cycles.find(c=>c.tenure_type === 'TRIAL') : null;
  const regular = Array.isArray(cycles) ? cycles.find(c=>c.tenure_type === 'REGULAR') : null;
  const trialRemaining = Number(trial?.cycles_remaining ?? (Number(trial?.total_cycles)-Number(trial?.cycles_completed)));
  const lastPaid = Number(subscription?.billing_info?.last_payment?.amount?.value || 0);
  const trialActivated = subscription?.status === 'ACTIVE' && appStatus === 'trialing' && Boolean(trial) && trialRemaining>0 && Number(regular?.cycles_completed || 0) === 0 && lastPaid === 0;
  return {trialActivated,subscriptionId,planCode,...(trialActivated?{eventId:`StartTrial:paypal:${subscriptionId}`}:{})};
}
