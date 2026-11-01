import { authenticatedUser, response, serviceClient } from './whop.js';
export async function whopStatus({ env = process.env, headers = {}, service } = {}) {
  try {
    service ||= serviceClient(env);
    const user = await authenticatedUser(headers, service);
    if (!user) return response(401, { error: 'No pudimos validar tu sesión. Inicia sesión nuevamente para continuar.' });
    const { data: membership, error } = await service.from('subscriptions')
      .select('status,plan_code,payment_provider,provider_subscription_id,current_period_end,trial_start,trial_end,next_billing_at,cancel_at_period_end')
      .eq('user_id', user.id).eq('payment_provider', 'whop').maybeSingle();
    const { data: profile, error: profileError } = await service.from('users')
      .select('has_access,payment_provider,whop_access_until').eq('id', user.id).maybeSingle();
    if (error || profileError) return response(503, { error: 'No pudimos consultar la confirmación. Inténtalo nuevamente.' });
    const access = Boolean(profile?.has_access && profile.payment_provider === 'whop' && membership?.provider_subscription_id &&
      ['active', 'trialing', 'cancelled', 'payment_failed'].includes(membership.status) && Date.parse(membership.current_period_end) > Date.now() &&
      Date.parse(profile.whop_access_until) > Date.now());
    const trialActive = access && membership.status === 'trialing' && Date.parse(membership.trial_end) > Date.now();
    return response(200, { access, trialActive, status: membership?.status || 'pending', planCode: membership?.plan_code || null,
      trialStart: membership?.trial_start || null, trialEnd: membership?.trial_end || null, nextBillingAt: membership?.next_billing_at || null });
  } catch { return response(503, { error: 'No pudimos consultar la confirmación. Inténtalo nuevamente.' }); }
}
