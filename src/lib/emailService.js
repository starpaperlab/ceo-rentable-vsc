/**
 * ═══════════════════════════════════════════════════════════════
 * CEO RENTABLE OS™ — EMAIL SERVICE (RESEND)
 * ═══════════════════════════════════════════════════════════════
 *
 * Servicio para enviar emails transaccionales usando Resend API
 * Integrado con Supabase para logging y templates
 */

import { supabase } from './supabase';
import { ENV_CONFIG } from '@/config/env';
import { sendEmailThroughBackend } from '@/lib/emailApiClient';

const RESEND_FROM_EMAIL = ENV_CONFIG.resend.fromEmail;
const EMAIL_FOOTER_HTML = `
  <div data-ceo-footer="1" style="text-align:center;margin-top:22px;color:#8a7f85;font-size:12px;line-height:1.5;">
    CEO Rentable OS™ · Tu sistema financiero inteligente<br/>
    Preguntas: <a href="mailto:hola@ceorentable.com" style="color:#D45387;text-decoration:none;">hola@ceorentable.com</a>
  </div>
`;

function ensureFooter(html = '') {
  const normalized = `${html || ''}`.trim();
  if (!normalized) return EMAIL_FOOTER_HTML;
  if (normalized.includes('data-ceo-footer="1"')) return normalized;

  const lower = normalized.toLowerCase();
  if (lower.includes('hola@ceorentable.com') && lower.includes('ceo rentable os')) {
    return normalized;
  }

  return `${normalized}${EMAIL_FOOTER_HTML}`;
}

// ───────────────────────────────────────────────────────────────
// HELPER: Enviar email via Resend API
// ───────────────────────────────────────────────────────────────

async function sendEmailViaResend({ to, subject, html, replyTo }) {
  return sendEmailThroughBackend({
    to,
    subject,
    html: ensureFooter(html),
    replyTo: replyTo || RESEND_FROM_EMAIL,
  });
}

// ───────────────────────────────────────────────────────────────
// HELPER: Log de email en Supabase
// ───────────────────────────────────────────────────────────────

async function logEmailToDatabase(userId, type, toEmail, subject, status, errorMessage = null) {
  if (!userId) return;

  try {
    await supabase
      .from('email_logs')
      .insert({
        user_id: userId,
        type,
        to_email: toEmail,
        subject,
        status,
        error_message: errorMessage,
        sent_at: new Date().toISOString(),
      });
  } catch (error) {
    console.error('Error logging email:', error.message);
  }
}

// ───────────────────────────────────────────────────────────────
// 1️⃣ WELCOME EMAIL
// ───────────────────────────────────────────────────────────────

export async function sendWelcomeEmail(user) {
  if (!user?.email) {
    throw new Error('Email inválido');
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto; line-height: 1.6; color: #1f1f1f; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #D45387; color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background: #F7F3EE; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #D45387; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>¡Bienvenida a CEO Rentable OS™!</h1>
          </div>
          <div class="content">
            <p>Hola <strong>${user.full_name || user.email}</strong>,</p>
            <p>Tu cuenta ha sido activada exitosamente. Ya puedes acceder a tu dashboard y comenzar a gestionar tu negocio.</p>
            
            <h3>¿Qué puedes hacer ahora?</h3>
            <ul>
              <li>📊 Ver tu Dashboard con KPIs clave</li>
              <li>📦 Gestionar tu inventario</li>
              <li>💰 Registrar facturas y ventas</li>
              <li>📈 Analizar rentabilidad por producto</li>
            </ul>

            <p>¿Dudas? Visita nuestra documentación o contacta al soporte.</p>
            
            <a href="${ENV_CONFIG.app.url}/dashboard" class="button">Ir al Dashboard</a>
          </div>
          <div class="footer">
            <p>CEO Rentable OS™ © 2026 - Todos los derechos reservados</p>
            <p>Este es un email transaccional, no responder directamente.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const result = await sendEmailViaResend({
    to: user.email,
    subject: '¡Bienvenida a CEO Rentable OS™!',
    html,
  });

  await logEmailToDatabase(
    user.id,
    'welcome',
    user.email,
    '¡Bienvenida a CEO Rentable OS™!',
    result.success ? 'sent' : 'failed',
    result.error
  );

  return result;
}

// ───────────────────────────────────────────────────────────────
// 2️⃣ PAYMENT CONFIRMATION EMAIL
// ───────────────────────────────────────────────────────────────

export async function sendPaymentConfirmationEmail(user, transaction) {
  if (!user?.email || !transaction) {
    throw new Error('Datos de usuario o transacción inválidos');
  }

  const amount = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: transaction.currency || 'USD',
  }).format(transaction.amount);

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto; line-height: 1.6; color: #1f1f1f; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10B981; color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background: #F7F3EE; padding: 30px; border-radius: 0 0 8px 8px; }
          .amount { font-size: 32px; font-weight: bold; color: #10B981; margin: 20px 0; }
          .details { background: white; padding: 15px; border-radius: 6px; margin: 20px 0; }
          .details-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✓ Pago Confirmado</h1>
          </div>
          <div class="content">
            <p>Hola <strong>${user.full_name || user.email}</strong>,</p>
            <p>Tu pago ha sido procesado correctamente. Ahora tienes acceso completo a todas las funciones de CEO Rentable OS™.</p>
            
            <div class="amount">${amount}</div>

            <div class="details">
              <div class="details-row">
                <span>Monto:</span>
                <strong>${amount}</strong>
              </div>
              <div class="details-row">
                <span>Estado:</span>
                <strong style="color: #10B981;">✓ Pagado</strong>
              </div>
              <div class="details-row">
                <span>Transacción:</span>
                <strong>${transaction.stripe_payment_id || 'Procesado'}</strong>
              </div>
              <div class="details-row">
                <span>Fecha:</span>
                <strong>${new Date().toLocaleDateString('es-MX')}</strong>
              </div>
            </div>

            <h3>Próximos pasos</h3>
            <ul>
              <li>✅ Tu suscripción está activa</li>
              <li>✅ Puedes crear clientes, productos e invoices</li>
              <li>✅ Acceso a reportes y análisis</li>
            </ul>
            
            <a href="${ENV_CONFIG.app.url}/dashboard" class="button" style="display: inline-block; background: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px;">Ir al Dashboard</a>
          </div>
          <div class="footer">
            <p>CEO Rentable OS™ — Gestiona tu negocio desde cualquier lugar</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const result = await sendEmailViaResend({
    to: user.email,
    subject: `Pago confirmado — ${amount}`,
    html,
  });

  await logEmailToDatabase(
    user.id,
    'payment_confirmation',
    user.email,
    `Pago confirmado — ${amount}`,
    result.success ? 'sent' : 'failed',
    result.error
  );

  return result;
}

// ───────────────────────────────────────────────────────────────
// 3️⃣ SUBSCRIPTION EXPIRING REMINDER
// ───────────────────────────────────────────────────────────────

export async function sendSubscriptionExpiringEmail(user, daysRemaining) {
  if (!user?.email) {
    throw new Error('Email inválido');
  }

  const isUrgent = daysRemaining <= 3;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto; line-height: 1.6; color: #1f1f1f; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${isUrgent ? '#EF4444' : '#F59E0B'}; color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background: #F7F3EE; padding: 30px; border-radius: 0 0 8px 8px; }
          .alert { background: ${isUrgent ? '#FEE2E2' : '#FEF3C7'}; border-left: 4px solid ${isUrgent ? '#EF4444' : '#F59E0B'}; padding: 15px; margin: 20px 0; }
          .button { display: inline-block; background: #D45387; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${isUrgent ? '⚠️ Suscripción por vencer' : '📅 Recordatorio de suscripción'}</h1>
          </div>
          <div class="content">
            <p>Hola <strong>${user.full_name || user.email}</strong>,</p>
            
            <div class="alert">
              <p><strong>Tu suscripción vence en ${daysRemaining} ${daysRemaining === 1 ? 'día' : 'días'}.</strong></p>
              <p>Para no perder acceso a CEO Rentable OS™, renueva tu suscripción ahora.</p>
            </div>

            <h3>¿Por qué renovar?</h3>
            <ul>
              <li>✅ Continúa accediendo a tu dashboard</li>
              <li>✅ Mantén tu historial de facturas y datos</li>
              <li>✅ Sigue usando reportes y análisis</li>
              <li>✅ No interrumpas tu negocio</li>
            </ul>

            <a href="${ENV_CONFIG.app.url}/billing" class="button">Renovar suscripción</a>

            <p style="margin-top: 30px; font-size: 14px; color: #666;">
              Si tienes dudas sobre tu suscripción, contacta a soporte en <strong>soporte@ceorentable.com</strong>
            </p>
          </div>
          <div class="footer">
            <p>CEO Rentable OS™ © 2026</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const result = await sendEmailViaResend({
    to: user.email,
    subject: `Recordatorio: Tu suscripción vence en ${daysRemaining} días`,
    html,
  });

  await logEmailToDatabase(
    user.id,
    'subscription_expiring',
    user.email,
    `Recordatorio: Tu suscripción vence en ${daysRemaining} días`,
    result.success ? 'sent' : 'failed',
    result.error
  );

  return result;
}

// ───────────────────────────────────────────────────────────────
// 4️⃣ PASSWORD RESET EMAIL
// ───────────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(user, resetLink) {
  if (!user?.email || !resetLink) {
    throw new Error('Email o link de reset inválidos');
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto; line-height: 1.6; color: #1f1f1f; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #D45387; color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background: #F7F3EE; padding: 30px; border-radius: 0 0 8px 8px; }
          .alert { background: #FEE2E2; border-left: 4px solid #EF4444; padding: 15px; margin: 20px 0; }
          .button { display: inline-block; background: #D45387; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
          .code { background: white; padding: 15px; border-radius: 6px; font-family: monospace; word-break: break-all; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Recuperar Contraseña</h1>
          </div>
          <div class="content">
            <p>Hola,</p>
            <p>Recibimos una solicitud para restablecer tu contraseña. Si fue tu solicitud, haz clic en el botón abajo.</p>
            
            <div class="alert">
              <p><strong>⚠️ Este link expira en 1 hora.</strong></p>
              <p>Si no solicitaste cambiar tu contraseña, ignora este email.</p>
            </div>

            <a href="${resetLink}" class="button">Restablecer Contraseña</a>

            <p style="margin-top: 30px; color: #666; font-size: 14px;">
              O copia y pega este link en tu navegador:<br>
              <span style="word-break: break-all; font-size: 12px; color: #999;">${resetLink}</span>
            </p>

            <h3>Seguridad:</h3>
            <ul style="font-size: 14px;">
              <li>Nunca compartamos tu contraseña por email</li>
              <li>No hagas clic en links sospechosos</li>
              <li>Usa una contraseña fuerte (mínimo 8 caracteres)</li>
            </ul>
          </div>
          <div class="footer">
            <p>CEO Rentable OS™ © 2026 — Team de Seguridad</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const result = await sendEmailViaResend({
    to: user.email,
    subject: 'Recupera tu contraseña — CEO Rentable OS™',
    html,
  });

  await logEmailToDatabase(
    user.id,
    'password_reset',
    user.email,
    'Recupera tu contraseña — CEO Rentable OS™',
    result.success ? 'sent' : 'failed',
    result.error
  );

  return result;
}

// ───────────────────────────────────────────────────────────────
// BONUS: Enviar email personalizado
// ───────────────────────────────────────────────────────────────

export async function sendCustomEmail(userId, toEmail, subject, htmlBody) {
  const result = await sendEmailViaResend({
    to: toEmail,
    subject,
    html: htmlBody,
  });

  await logEmailToDatabase(
    userId,
    'other',
    toEmail,
    subject,
    result.success ? 'sent' : 'failed',
    result.error
  );

  return result;
}

export default {
  sendWelcomeEmail,
  sendPaymentConfirmationEmail,
  sendSubscriptionExpiringEmail,
  sendPasswordResetEmail,
  sendCustomEmail,
};
