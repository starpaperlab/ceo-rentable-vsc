/**
 * ═══════════════════════════════════════════════════════════════
 * CEO RENTABLE OS™ — STRIPE WEBHOOK HANDLER
 * ═══════════════════════════════════════════════════════════════
 *
 * Edge Function que procesa webhooks de Stripe:
 * - invoice.payment_succeeded ✅ Activa subscription + acceso
 * - invoice.payment_failed ❌ Marca como past_due
 * - customer.subscription.deleted 🗑️ Cancela subscription
 * - charge.refunded 💰 Registra refund
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@13.0.0';

// ───────────────────────────────────────────────────────────────
// SUPABASE CLIENT
// ───────────────────────────────────────────────────────────────

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase env variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ───────────────────────────────────────────────────────────────
// STRIPE WEBHOOK VERIFICATION
// ───────────────────────────────────────────────────────────────

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
const stripWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

if (!stripeSecretKey || !stripWebhookSecret) {
  throw new Error('Missing Stripe env variables');
}

const stripe = new Stripe(stripeSecretKey);

/**
 * Verifica la firma del webhook de Stripe
 */
function verifyStripeSignature(body: string, signature: string): { verified: boolean; event?: any } {
  try {
    const event = stripe.webhooks.constructEvent(body, signature, stripWebhookSecret) as any;
    return { verified: true, event };
  } catch (err) {
    console.error('❌ Stripe signature verification failed:', err);
    return { verified: false };
  }
}

// ───────────────────────────────────────────────────────────────
// EVENT HANDLERS
// ───────────────────────────────────────────────────────────────

/**
 * 1️⃣ invoice.payment_succeeded
 * Activa subscription y acceso al usuario
 */
async function handlePaymentSucceeded(event: any) {
  const invoice = event.data.object;
  const customerId = invoice.customer;
  const subscriptionId = invoice.subscription;

  console.log(`💳 Payment succeeded for customer ${customerId}`);

  try {
    // Obtener usuario por stripe_customer_id
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, business_name')
      .eq('stripe_customer_id', customerId)
      .single();

    if (userError || !user) {
      console.error('❌ User not found:', userError || customerId);
      return;
    }

    // Actualizar subscription
    const { error: subError } = await supabase
      .from('subscriptions')
      .update({
        stripe_subscription_id: subscriptionId,
        status: 'active',
        current_period_end: new Date(invoice.period_end * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (subError) {
      console.error('❌ Failed to update subscription:', subError);
      return;
    }

    // Activar acceso del usuario
    const { error: accessError } = await supabase
      .from('users')
      .update({
        has_access: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (accessError) {
      console.error('❌ Failed to update access:', accessError);
      return;
    }

    // Crear transacción
    const { error: transError } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        amount: invoice.amount_paid / 100,
        currency: invoice.currency?.toUpperCase() || 'USD',
        type: 'subscription_payment',
        status: 'completed',
        stripe_payment_id: invoice.id,
        created_at: new Date().toISOString(),
      });

    if (transError) {
      console.error('⚠️ Failed to create transaction:', transError);
    }

    // Log del pago
    await supabase.from('email_logs').insert({
      user_id: user.id,
      type: 'payment_confirmation',
      to_email: user.email,
      subject: `Pago confirmado — CEO Rentable OS™`,
      status: 'pending',
      content_snippet: `Pago de RD$${(invoice.amount_paid / 100).toFixed(2)} recibido`,
      created_at: new Date().toISOString(),
    });

    console.log(`✅ Payment processed for ${user.email} — Access activated`);
  } catch (error) {
    console.error('❌ Error in handlePaymentSucceeded:', error);
  }
}

/**
 * 2️⃣ invoice.payment_failed
 * Marca subscription como past_due
 */
async function handlePaymentFailed(event: any) {
  const invoice = event.data.object;
  const customerId = invoice.customer;

  console.log(`❌ Payment failed for customer ${customerId}`);

  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .eq('stripe_customer_id', customerId)
      .single();

    if (userError || !user) return;

    // Actualizar subscription a past_due
    await supabase
      .from('subscriptions')
      .update({
        status: 'past_due',
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    // Log del fallo
    await supabase.from('email_logs').insert({
      user_id: user.id,
      type: 'payment_failed',
      to_email: user.email,
      subject: `⚠️ Pago rechazado — Acción requerida`,
      status: 'pending',
      content_snippet: `El pago de tu suscripción fue rechazado. Por favor actualiza tu método de pago.`,
      created_at: new Date().toISOString(),
    });

    console.log(`⚠️ Payment failed processed for ${user.email}`);
  } catch (error) {
    console.error('❌ Error in handlePaymentFailed:', error);
  }
}

/**
 * 3️⃣ customer.subscription.deleted
 * Cancela subscription y revoca acceso
 */
async function handleSubscriptionDeleted(event: any) {
  const subscription = event.data.object;
  const customerId = subscription.customer;

  console.log(`🗑️ Subscription deleted for customer ${customerId}`);

  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, business_name')
      .eq('stripe_customer_id', customerId)
      .single();

    if (userError || !user) return;

    // Actualizar subscription a canceled
    await supabase
      .from('subscriptions')
      .update({
        status: 'canceled',
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    // Revocar acceso
    await supabase
      .from('users')
      .update({
        has_access: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    // Log de cancelación
    await supabase.from('email_logs').insert({
      user_id: user.id,
      type: 'subscription_canceled',
      to_email: user.email,
      subject: `Suscripción cancelada — Te echamos de menos`,
      status: 'pending',
      content_snippet: `Tu suscripción a CEO Rentable OS™ ha sido cancelada.`,
      created_at: new Date().toISOString(),
    });

    console.log(`✅ Subscription canceled for ${user.email} — Access revoked`);
  } catch (error) {
    console.error('❌ Error in handleSubscriptionDeleted:', error);
  }
}

/**
 * 4️⃣ charge.refunded
 * Registra reembolso
 */
async function handleChargeRefunded(event: any) {
  const charge = event.data.object;
  const customerId = charge.customer;

  console.log(`💰 Refund processed for customer ${customerId}`);

  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .eq('stripe_customer_id', customerId)
      .single();

    if (userError || !user) return;

    // Crear transacción de reembolso
    await supabase.from('transactions').insert({
      user_id: user.id,
      amount: -Math.abs(charge.amount_refunded / 100),
      currency: charge.currency?.toUpperCase() || 'USD',
      type: 'refund',
      status: 'completed',
      stripe_payment_id: charge.id,
      created_at: new Date().toISOString(),
    });

    // Log de reembolso
    await supabase.from('email_logs').insert({
      user_id: user.id,
      type: 'refund_processed',
      to_email: user.email,
      subject: `Reembolso procesado — RD$${(Math.abs(charge.amount_refunded) / 100).toFixed(2)}`,
      status: 'pending',
      content_snippet: `Tu reembolso de RD$${(Math.abs(charge.amount_refunded) / 100).toFixed(2)} ha sido procesado.`,
      created_at: new Date().toISOString(),
    });

    console.log(`✅ Refund processed for ${user.email}`);
  } catch (error) {
    console.error('❌ Error in handleChargeRefunded:', error);
  }
}

// ───────────────────────────────────────────────────────────────
// MAIN HANDLER
// ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Solo procesamos POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Obtener firma y body
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  if (!signature) {
    console.error('❌ Missing stripe-signature header');
    return new Response(JSON.stringify({ error: 'Missing signature' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Verificar firma
  const { verified, event } = verifyStripeSignature(body, signature);

  if (!verified) {
    console.error('❌ Invalid Stripe signature');
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log(`📨 Processing Stripe event: ${event.type}`);

  // Procesar según tipo de evento
  try {
    switch (event.type) {
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event);
        break;

      case 'charge.refunded':
        await handleChargeRefunded(event);
        break;

      default:
        console.log(`⚠️ Unhandled event type: ${event.type}`);
    }

    // Retornar éxito
    return new Response(
      JSON.stringify({
        success: true,
        event_type: event.type,
        event_id: event.id,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});
