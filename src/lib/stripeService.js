/**
 * ═══════════════════════════════════════════════════════════════
 * CEO RENTABLE OS™ — STRIPE SERVICE
 * ═══════════════════════════════════════════════════════════════
 *
 * Servicio para gestionar pagos, suscripciones y webhooks de Stripe
 * Integrado con Supabase para sincronizar datos
 */

import { supabase } from './supabase';
import { ENV_CONFIG } from '@/config/env';

const STRIPE_PUBLIC_KEY = ENV_CONFIG.stripe.publicKey;
const STRIPE_PLANS = ENV_CONFIG.stripe.plans;
const APP_URL = ENV_CONFIG.app.url;

// ───────────────────────────────────────────────────────────────
// 1️⃣ CREAR SESIÓN DE CHECKOUT (Cliente compra suscripción)
// ───────────────────────────────────────────────────────────────

/**
 * Crea una sesión de checkout de Stripe para que el usuario pague
 * @param {string} planKey - 'basico' o 'pro'
 * @param {string} userId - ID del usuario autenticado
 * @returns {object} { sessionId, clientSecret }
 */
export async function createCheckoutSession(planKey, userId) {
  if (!STRIPE_PUBLIC_KEY) {
    throw new Error('Stripe no configurado');
  }

  if (!planKey || !STRIPE_PLANS[planKey]) {
    throw new Error(`Plan inválido: ${planKey}`);
  }

  if (!userId) {
    throw new Error('Usuario no autenticado');
  }

  const plan = STRIPE_PLANS[planKey];

  try {
    // En una aplicación real, esto se haría desde un backend/Edge Function
    // porque no puedes exponer la Stripe Secret Key en el frontend
    // Por ahora, retornamos instrucciones para implementar esto

    // TODO: Implementar como Edge Function en Supabase
    // POST /functions/v1/create-stripe-session
    const response = await fetch(`${APP_URL}/api/stripe/create-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        planKey,
        planName: plan.name,
        amount: plan.price * 100, // Centavos
        currency: plan.currency.toLowerCase(),
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Error creando sesión de Stripe');
    }

    const data = await response.json();
    
    // Guardar sesión pendiente en Supabase
    await supabase
      .from('transactions')
      .insert({
        user_id: userId,
        amount: plan.price,
        currency: plan.currency,
        status: 'pending',
        description: `Suscripción ${plan.name}`,
      });

    return {
      sessionId: data.sessionId,
      clientSecret: data.clientSecret,
      publishableKey: STRIPE_PUBLIC_KEY,
    };
  } catch (error) {
    console.error('❌ Error Stripe:', error.message);
    throw error;
  }
}

// ───────────────────────────────────────────────────────────────
// 2️⃣ PROCESAR WEBHOOK DE STRIPE
// ───────────────────────────────────────────────────────────────

/**
 * Procesa eventos webhook de Stripe (pago completado, suscripción cancelada, etc)
 * Llamado desde un Edge Function de Supabase
 * @param {object} event - Evento de Stripe
 * @returns {object} { success: boolean }
 */
export async function handleStripeWebhook(event) {
  console.log('📨 Webhook Stripe recibido:', event.type);

  try {
    switch (event.type) {
      // ───────────────────────────────────────────────────────────
      // Pago completado (invoice.payment_succeeded)
      // ───────────────────────────────────────────────────────────
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        const customerId = invoice.customer;

        // 1. Buscar usuario por Stripe Customer ID
        const { data: userData } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (!userData) {
          console.warn('⚠️ No se encontró usuario para customer:', customerId);
          break;
        }

        const userId = userData.user_id;

        // 2. Actualizar suscripción
        await supabase
          .from('subscriptions')
          .update({
            status: 'active',
            stripe_subscription_id: subscriptionId,
          })
          .eq('user_id', userId);

        // 3. Registrar transacción
        await supabase
          .from('transactions')
          .insert({
            user_id: userId,
            stripe_payment_id: invoice.payment_intent,
            stripe_invoice_id: invoice.id,
            amount: invoice.amount_paid / 100,
            currency: invoice.currency.toUpperCase(),
            status: 'succeeded',
            description: 'Pago de suscripción',
          });

        // 4. Activar acceso del usuario
        await supabase
          .from('users')
          .update({ has_access: true })
          .eq('id', userId);

        console.log('✅ Pago procesado para usuario:', userId);
        break;
      }

      // ───────────────────────────────────────────────────────────
      // Pago fallido (invoice.payment_failed)
      // ───────────────────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        const { data: userData } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (userData) {
          // Cambiar suscripción a past_due
          await supabase
            .from('subscriptions')
            .update({ status: 'past_due' })
            .eq('user_id', userData.user_id);

          // Registrar transacción fallida
          await supabase
            .from('transactions')
            .insert({
              user_id: userData.user_id,
              stripe_invoice_id: invoice.id,
              amount: invoice.amount_due / 100,
              currency: invoice.currency.toUpperCase(),
              status: 'failed',
              description: 'Pago fallido',
            });

          console.log('⚠️ Pago fallido para usuario:', userData.user_id);
        }
        break;
      }

      // ───────────────────────────────────────────────────────────
      // Suscripción cancelada (customer.subscription.deleted)
      // ───────────────────────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        const { data: userData } = await supabase
          .from('subscriptions')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (userData) {
          // Actualizar suscripción a cancelada
          await supabase
            .from('subscriptions')
            .update({
              status: 'canceled',
              canceled_at: new Date().toISOString(),
            })
            .eq('user_id', userData.user_id);

          // Desactivar acceso
          await supabase
            .from('users')
            .update({ has_access: false })
            .eq('id', userData.user_id);

          console.log('❌ Suscripción cancelada para usuario:', userData.user_id);
        }
        break;
      }

      // ───────────────────────────────────────────────────────────
      // Reembolso procesado (charge.refunded)
      // ───────────────────────────────────────────────────────────
      case 'charge.refunded': {
        const charge = event.data.object;

        // Buscar transacción en Supabase
        const { data: transaction } = await supabase
          .from('transactions')
          .select('user_id')
          .eq('stripe_payment_id', charge.payment_intent)
          .single();

        if (transaction) {
          // Crear registro de reembolso
          await supabase
            .from('transactions')
            .insert({
              user_id: transaction.user_id,
              stripe_payment_id: charge.id,
              amount: charge.amount_refunded / 100,
              currency: charge.currency.toUpperCase(),
              status: 'refunded',
              description: 'Reembolso procesado',
            });

          console.log('💰 Reembolso procesado:', charge.amount_refunded / 100);
        }
        break;
      }

      default:
        console.log('ℹ️ Evento no procesado:', event.type);
    }

    return { success: true };
  } catch (error) {
    console.error('❌ Error procesando webhook:', error.message);
    return { success: false, error: error.message };
  }
}

// ───────────────────────────────────────────────────────────────
// 3️⃣ CANCELAR SUSCRIPCIÓN
// ───────────────────────────────────────────────────────────────

/**
 * Cancela la suscripción de un usuario
 * @param {string} userId - ID del usuario
 * @returns {object} { success: boolean }
 */
export async function cancelSubscription(userId) {
  if (!userId) {
    throw new Error('Usuario no proporcionado');
  }

  try {
    // Buscar suscripción activa
    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('stripe_subscription_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (error || !subscription?.stripe_subscription_id) {
      throw new Error('No hay suscripción activa');
    }

    // TODO: Llamar a Edge Function para cancelar en Stripe
    // const response = await fetch(`${APP_URL}/api/stripe/cancel-subscription`, {
    //   method: 'POST',
    //   body: JSON.stringify({ subscriptionId: subscription.stripe_subscription_id }),
    // });

    // Por ahora, solo marcar como pendiente de cancelación
    await supabase
      .from('subscriptions')
      .update({
        cancel_at_period_end: true,
        status: 'canceled',
      })
      .eq('user_id', userId);

    console.log('✅ Suscripción marcada para cancelación:', userId);

    return { success: true, message: 'Suscripción cancelada exitosamente' };
  } catch (error) {
    console.error('❌ Error cancelando suscripción:', error.message);
    return { success: false, error: error.message };
  }
}

// ───────────────────────────────────────────────────────────────
// 4️⃣ OBTENER ESTADO DE SUSCRIPCIÓN
// ───────────────────────────────────────────────────────────────

/**
 * Obtiene el estado de la suscripción de un usuario
 * @param {string} userId - ID del usuario
 * @returns {object} Información de suscripción
 */
export async function getSubscriptionStatus(userId) {
  if (!userId) {
    throw new Error('Usuario no proporcionado');
  }

  try {
    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      // Si no existe suscripción, retornar objeto por defecto
      return {
        plan: null,
        status: 'none',
        active: false,
        currentPeriodEnd: null,
      };
    }

    return {
      id: subscription.id,
      plan: subscription.plan,
      status: subscription.status,
      active: subscription.status === 'active',
      currentPeriodEnd: subscription.current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      stripeId: subscription.stripe_subscription_id,
      planDetails: STRIPE_PLANS[subscription.plan] || null,
    };
  } catch (error) {
    console.error('❌ Error obteniendo suscripción:', error.message);
    throw error;
  }
}

// ───────────────────────────────────────────────────────────────
// BONUS: Información de planes
// ───────────────────────────────────────────────────────────────

export function getPlans() {
  return STRIPE_PLANS;
}

export function getPlan(planKey) {
  return STRIPE_PLANS[planKey] || null;
}

export default {
  createCheckoutSession,
  handleStripeWebhook,
  cancelSubscription,
  getSubscriptionStatus,
  getPlans,
  getPlan,
};
