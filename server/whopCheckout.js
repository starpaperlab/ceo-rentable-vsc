import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { APP_ORIGIN, WHOP_PLANS, assertPlan, assertWebhook, authenticatedUser, response, safePurchaseUrl, serviceClient, whopClient } from './whop.js';

const schema = z.object({
  planCode: z.enum(['monthly', 'annual']), termsAccepted: z.literal(true),
  marketingAccepted: z.boolean().default(false),
  businessName: z.string().trim().min(1).max(160),
  phone: z.string().trim().max(40).default(''), country: z.enum(['DO', 'US', 'OTHER']),
});

export async function createWhopCheckout(body, { env = process.env, headers = {}, service, whop } = {}) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) return response(400, { error: 'Completa los datos de tu negocio y acepta los términos y la privacidad.' });
  try {
    service ||= serviceClient(env);
    const user = await authenticatedUser(headers, service);
    if (!user?.id || !user.email_confirmed_at) return response(401, { error: 'Inicia sesión con tu correo confirmado antes de continuar al pago.' });
    if (env.WHOP_CHECKOUT_ENABLED !== 'true') return response(503, { error: 'El pago con Whop está en preparación. Tu cuenta se conserva; vuelve a intentarlo cuando esté habilitado.' });
    whop ||= whopClient(env);
    const { planCode, businessName, phone, country, marketingAccepted } = parsed.data;
    const { data: profile, error: profileError } = await service.from('users').select('id,has_access').eq('id', user.id).maybeSingle();
    if (profileError || !profile) return response(503, { error: 'No pudimos verificar el perfil de tu cuenta. Inténtalo nuevamente.' });
    if (profile.has_access) return response(409, { error: 'Tu cuenta ya tiene acceso. Entra al dashboard para gestionar tu suscripción.' });
    // Checking this RPC also confirms that the atomic activation migration exists.
    const { error: readyError } = await service.rpc('whop_checkout_ready');
    if (readyError) throw new Error('WHOP_DATABASE_NOT_READY');
    const variant = await whop.variants.retrieve({ id: WHOP_PLANS[planCode].id });
    assertPlan(variant, planCode);
    const hook = await assertWebhook(whop, env);
    if (variant.account?.id !== hook.resource_id) throw new Error('WHOP_ACCOUNT_MISMATCH');
    const { error: updateError } = await service.from('users').update({ business_name: businessName, phone: phone || null }).eq('id', user.id);
    if (updateError) throw new Error('PROFILE_UPDATE_FAILED');
    const intentId = randomUUID();
    const { error: intentError } = await service.from('whop_checkout_intents').insert({
      id: intentId, user_id: user.id, plan_code: planCode, whop_plan_id: variant.id,
      whop_account_id: hook.resource_id, terms_accepted_at: new Date().toISOString(),
      marketing_accepted: marketingAccepted, country,
    });
    if (intentError) throw new Error('CHECKOUT_INTENT_FAILED');
    const checkout = await whop.checkoutConfigurations.create({
      account_id: hook.resource_id, variant_id: variant.id,
      metadata: { ceo_checkout_intent: intentId },
      redirect_url: `${APP_ORIGIN}/payment-success?provider=whop&plan=${planCode}`,
    }, { idempotencyKey: `ceo-checkout-${intentId}` });
    if (checkout.variant?.id !== variant.id || checkout.metadata?.ceo_checkout_intent !== intentId) throw new Error('CHECKOUT_METADATA_MISSING');
    const url = safePurchaseUrl(checkout.purchase_url);
    const { error: saveError } = await service.from('whop_checkout_intents').update({ checkout_id: checkout.id }).eq('id', intentId);
    if (saveError) throw new Error('CHECKOUT_SAVE_FAILED');
    return response(200, { url });
  } catch {
    // Never return provider responses, keys or customer data in errors/logs.
    return response(503, { error: 'No pudimos preparar un pago vinculado a tu cuenta. Tu cuenta se conserva; inténtalo más tarde.' });
  }
}
