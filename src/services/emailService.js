import { supabase } from '@/lib/supabase';
import { ENV_CONFIG } from '@/config/env';
import { postAdminEmailAction, sendEmailThroughBackend } from '@/lib/emailApiClient';
import {
  buildTemplateVariableDefaults,
  normalizeTemplateVariables,
} from '@/lib/emailCampaignUtils';

const PROD_APP_URL = 'https://app.ceorentable.com';

function normalizeOrigin(raw = '') {
  const value = `${raw || ''}`.trim();
  if (!value) return '';
  try {
    return new URL(value).origin.replace(/\/$/, '');
  } catch {
    return '';
  }
}

function isLocalOrigin(url = '') {
  const value = `${url || ''}`.toLowerCase();
  return value.includes('localhost') || value.includes('127.0.0.1') || value.includes('0.0.0.0');
}

function resolveAppUrl() {
  const configured = normalizeOrigin(ENV_CONFIG.app?.url || import.meta.env.VITE_PUBLIC_APP_URL || import.meta.env.VITE_APP_URL);
  const runtime = typeof window !== 'undefined' ? normalizeOrigin(window.location.origin) : '';
  const isDev = import.meta.env.DEV === true;

  if (configured && (!isLocalOrigin(configured) || isDev)) return configured;
  if (runtime && (!isLocalOrigin(runtime) || isDev)) return runtime;
  return PROD_APP_URL;
}

const APP_URL = resolveAppUrl();
const BRAND_LOGO_URL = `${APP_URL}/brand/isotipo.png`;

const LOCALHOST_URL_REGEX = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?/gi;
const RELATIVE_LOGO_REGEX = /(src\s*=\s*["'])\/brand\/isotipo\.png(["'])/gi;

function normalizeTemplateHtmlAssets(html = '') {
  let normalized = `${html || ''}`;
  if (!normalized) return '';
  normalized = normalized.replace(LOCALHOST_URL_REGEX, APP_URL);
  normalized = normalized.replace(RELATIVE_LOGO_REGEX, `$1${BRAND_LOGO_URL}$2`);
  return normalized;
}

function pickTemplateHtml(source = {}) {
  return source?.html_content || source?.html_body || '';
}

const EMAIL_FOOTER_HTML = `
  <div data-ceo-footer="1" style="text-align:center;margin-top:22px;color:#8a7f85;font-size:12px;line-height:1.5;">
    CEO Rentable OS™ · Tu sistema financiero inteligente<br/>
    Preguntas: <a href="mailto:hola@ceorentable.com" style="color:#D45387;text-decoration:none;">hola@ceorentable.com</a>
  </div>
`;

function mapStatus(status) {
  if (status === 'sent') return 'success';
  if (status === 'ok') return 'success';
  if (status === 'success') return 'success';
  if (status === 'pending') return 'pending';
  if (status === 'failed') return 'failed';
  return status || 'pending';
}

function normalizeStoredStatus(status) {
  const value = `${status || ''}`.trim().toLowerCase();
  if (value === 'success' || value === 'sent' || value === 'ok') return 'sent';
  if (value === 'failed' || value === 'error') return 'failed';
  return 'pending';
}

function normalizeTemplateRow(row = {}) {
  const active = row.active ?? row.is_active ?? true;
  const htmlBody = ensureFooter(normalizeTemplateHtmlAssets(pickTemplateHtml(row)));
  const textBody = row.body || row.text_content || '';

  return {
    ...row,
    active,
    is_active: row.is_active ?? active,
    html_body: htmlBody,
    html_content: row.html_content || htmlBody,
    body: textBody,
    text_content: row.text_content || textBody,
    variables: Array.isArray(row.variables) ? row.variables : [],
  };
}

function normalizeTemplatePayload(input = {}) {
  const active = input.is_active ?? input.active ?? true;
  const htmlBody = ensureFooter(normalizeTemplateHtmlAssets(input.html_content || input.html_body || ''));
  const textBody = input.body || input.text_content || '';
  const variables = Array.isArray(input.variables)
    ? input.variables
    : Object.keys(buildTemplateVariableDefaults(input));

  return {
    name: input.name,
    subject: input.subject,
    body: textBody,
    text_content: input.text_content || textBody,
    html_body: htmlBody,
    html_content: input.html_content || htmlBody,
    editor_json: input.editor_json || null,
    variables,
    active,
    is_active: active,
  };
}

function interpolate(text = '', vars = {}, template = {}) {
  const normalizedVars = normalizeTemplateVariables(template, vars);
  return Object.entries(normalizedVars).reduce((acc, [key, value]) => {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    return acc.replace(regex, value ?? '');
  }, text);
}

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

async function getCurrentUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

function translateEmailServiceError(error) {
  const message = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase();
  if (
    error?.code === '42501' ||
    message.includes('forbidden') ||
    message.includes('permission denied') ||
    message.includes('row-level security')
  ) {
    return new Error(
      'No tienes permisos admin en Supabase para gestionar templates/campañas. Asigna role=admin al usuario y vuelve a iniciar sesión.'
    );
  }
  return error;
}

async function sendViaResend({ to, subject, html, text }) {
  const result = await sendEmailThroughBackend({
    to,
    subject,
    html,
    text,
    scope: 'admin',
  });

  if (!result.success) {
    throw new Error(result.error || 'No se pudo enviar el email');
  }

  return result?.messageId || null;
}

async function createEmailLog(log) {
  const payload = {
    user_id: log.user_id || null,
    template_id: log.template_id || null,
    campaign_id: log.campaign_id || null,
    type: log.type || 'other',
    to_email: log.to_email || null,
    recipient_email: log.recipient_email || log.to_email || null,
    recipient_name: log.recipient_name || null,
    email: log.email || log.recipient_email || log.to_email || null,
    name: log.name || log.recipient_name || null,
    subject: log.subject || null,
    status: normalizeStoredStatus(log.status || 'pending'),
    metadata: {
      source_type: log.source_type || log.metadata?.source_type || 'registered',
      ...log.metadata,
    },
    timestamp: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('email_logs').insert(payload).select('*').single();
  if (error) throw error;
  return data;
}

async function updateEmailLog(logId, patch = {}) {
  const payload = {
    ...patch,
    status: patch.status ? normalizeStoredStatus(patch.status) : undefined,
    updated_at: new Date().toISOString(),
  };

  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);

  const { error } = await supabase.from('email_logs').update(payload).eq('id', logId);
  if (error) throw error;
}

async function sendRawEmail({
  userId,
  templateId = null,
  campaignId = null,
  to,
  name = null,
  subject,
  html,
  text,
  metadata = {},
}) {
  const log = await createEmailLog({
    user_id: userId,
    template_id: templateId,
    campaign_id: campaignId,
    type: templateId ? 'template' : 'other',
    to_email: to,
    recipient_email: to,
    recipient_name: name,
    email: to,
    name,
    subject,
    status: 'pending',
    metadata: {
      ...metadata,
      html,
      text,
    },
  });

  try {
    const providerMessageId = await sendViaResend({ to, subject, html, text });

    await updateEmailLog(log.id, {
      status: 'success',
      sent_at: new Date().toISOString(),
      timestamp: new Date().toISOString(),
      provider_message_id: providerMessageId,
    });

    return { ...log, status: 'success' };
  } catch (error) {
    await updateEmailLog(log.id, {
      status: 'failed',
      error_message: error.message,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
}

function buildFeatureList(items = []) {
  if (!Array.isArray(items) || items.length === 0) return '';

  const rows = items
    .map(
      (item) => `
        <tr>
          <td style="padding:0 0 10px 0;font-size:14px;line-height:1.6;color:#4A4448;">
            <span style="color:#D45387;font-weight:700;">✓</span> ${item}
          </td>
        </tr>
      `
    )
    .join('');

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 22px 0;background:#FDF4F8;border:1px solid #F3DCE8;border-radius:14px;padding:16px;">
      <tr>
        <td style="padding:16px 16px 6px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            ${rows}
          </table>
        </td>
      </tr>
    </table>
  `;
}

function buildProfessionalTemplateHtml({
  eyebrow,
  title,
  intro,
  bodyHtml,
  featureItems = [],
  ctaText,
  ctaUrl,
  note = '',
}) {
  return `
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>CEO Rentable OS™</title>
      </head>
      <body style="margin:0;padding:0;background:#F7F3EE;font-family:Inter,Segoe UI,Arial,sans-serif;color:#221F22;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F7F3EE;padding:24px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:620px;">
                <tr>
                  <td style="background:#FDF4F8;border:1px solid #F0E4EA;border-bottom:none;border-radius:18px 18px 0 0;padding:24px 20px 18px;text-align:center;">
                    <img src="${BRAND_LOGO_URL}" alt="CEO Rentable OS™" width="58" height="58" style="display:block;border:0;outline:none;text-decoration:none;margin:0 auto 8px;" />
                    <div style="font-size:18px;line-height:1.2;font-weight:800;letter-spacing:0.04em;color:#D45387;">CEO RENTABLE OS™</div>
                    <div style="font-size:11px;line-height:1.5;color:#8A7F85;letter-spacing:0.08em;text-transform:uppercase;margin-top:8px;">
                      ${eyebrow}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="background:#FFFFFF;border:1px solid #F0E4EA;border-radius:0 0 18px 18px;padding:30px 24px 26px;">
                    <h1 style="margin:0 0 14px 0;font-size:28px;line-height:1.2;color:#221F22;font-weight:800;">
                      ${title}
                    </h1>
                    <div style="margin:0 0 18px 0;font-size:15px;line-height:1.7;color:#4A4448;">
                      ${intro}
                    </div>
                    <div style="margin:0 0 18px 0;font-size:14px;line-height:1.7;color:#655E63;">
                      ${bodyHtml}
                    </div>
                    ${buildFeatureList(featureItems)}
                    ${
                      ctaText && ctaUrl
                        ? `
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px 0;">
                            <tr>
                              <td align="left">
                                <a href="${ctaUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#D45387;color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:700;line-height:1;padding:15px 24px;border-radius:12px;">
                                  ${ctaText}
                                </a>
                              </td>
                            </tr>
                          </table>
                        `
                        : ''
                    }
                    ${
                      note
                        ? `<p style="margin:0;font-size:12px;line-height:1.6;color:#8A7F85;">${note}</p>`
                        : ''
                    }
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:16px 10px 0 10px;">
                    <p style="margin:0;font-size:12px;line-height:1.6;color:#8A7F85;">
                      CEO Rentable OS™ · Tu sistema financiero inteligente<br />
                      Preguntas: <a href="mailto:hola@ceorentable.com" style="color:#D45387;text-decoration:none;">hola@ceorentable.com</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

function createDefaultTemplate({
  name,
  subject,
  body,
  eyebrow,
  title,
  intro,
  bodyHtml,
  featureItems,
  ctaText,
  ctaUrl,
  note,
  variables,
}) {
  return {
    name,
    subject,
    body,
    html_body: buildProfessionalTemplateHtml({
      eyebrow,
      title,
      intro,
      bodyHtml,
      featureItems,
      ctaText,
      ctaUrl,
      note,
    }),
    variables,
    is_active: true,
    active: true,
  };
}

function buildDefaultTemplates() {
  return [
    createDefaultTemplate({
      name: 'welcome',
      subject: 'Bienvenida a CEO Rentable OS™',
      body: 'Hola {{name}}, tu cuenta ya está lista para empezar a trabajar con claridad financiera.',
      eyebrow: 'Bienvenida',
      title: 'Tu cuenta ya está lista',
      intro:
        'Hola <strong style="font-size:18px;">{{name}}</strong>, gracias por unirte a <strong>CEO Rentable OS™</strong>.',
      bodyHtml:
        'Creamos este espacio para que puedas entender mejor la rentabilidad de tu negocio, ordenar tu operación y tomar decisiones con más confianza desde el primer día.',
      featureItems: [
        'Dashboard financiero con visión clara de tus números.',
        'Herramientas para controlar precios, costos y rentabilidad.',
        'Espacio centralizado para clientes, inventario y facturación.',
      ],
      ctaText: 'Entrar al sistema',
      ctaUrl: '{{login_link}}',
      note: 'Si aún no configuraste tu negocio, puedes hacerlo en menos de 5 minutos.',
      variables: ['name', 'email', 'login_link'],
    }),
    createDefaultTemplate({
      name: 'welcome_email',
      subject: 'Tu acceso a CEO Rentable OS™ ya está activo',
      body: 'Hola {{name}}, ya activamos tu acceso y puedes empezar a usar CEO Rentable OS™ hoy mismo.',
      eyebrow: 'Acceso activo',
      title: 'Ya puedes entrar y comenzar',
      intro:
        'Hola <strong style="font-size:18px;">{{name}}</strong>, tu acceso a <strong>CEO Rentable OS™</strong> ya está activo.',
      bodyHtml:
        'A partir de este momento puedes organizar tus finanzas, revisar la rentabilidad de tu negocio y trabajar con información más clara para crecer con intención.',
      featureItems: [
        'Visualiza el estado real de tu negocio en un solo lugar.',
        'Analiza tus ganancias y costos con más precisión.',
        'Avanza con una operación más ordenada y profesional.',
      ],
      ctaText: 'Abrir mi cuenta',
      ctaUrl: '{{login_link}}',
      note: 'Tu equipo de soporte está disponible en hola@ceorentable.com si necesitas ayuda.',
      variables: ['name', 'login_link'],
    }),
    createDefaultTemplate({
      name: 'newsletter_general',
      subject: '{{subject_line}}',
      body: 'Hola {{name}}, {{headline}} {{body_text}}',
      eyebrow: 'Actualización',
      title: '{{headline}}',
      intro:
        'Hola <strong style="font-size:18px;">{{name}}</strong>, queremos compartir contigo una actualización desde <strong>CEO Rentable OS™</strong>.',
      bodyHtml:
        '<p style="margin:0 0 12px 0;">{{body_text}}</p><p style="margin:0;">Gracias por seguir construyendo con nosotras.</p>',
      featureItems: [],
      ctaText: '{{cta_text}}',
      ctaUrl: '{{cta_url}}',
      note: 'Si el botón no aplica para este mensaje, puedes ignorarlo con tranquilidad.',
      variables: ['name', 'subject_line', 'headline', 'body_text', 'cta_text', 'cta_url'],
    }),
    createDefaultTemplate({
      name: 'payment-confirmation',
      subject: 'Confirmación de pago — {{amount}}',
      body: 'Hola {{name}}, confirmamos tu pago por {{amount}} y tu acceso ya quedó listo.',
      eyebrow: 'Pago recibido',
      title: 'Tu pago fue confirmado',
      intro:
        'Hola <strong style="font-size:18px;">{{name}}</strong>, confirmamos correctamente tu pago por <strong>{{amount}}</strong>.',
      bodyHtml:
        'Tu compra fue procesada con éxito y ya puedes continuar usando <strong>CEO Rentable OS™</strong> con acceso activo.',
      featureItems: [
        'Tu acceso ya está habilitado.',
        'Tu información sigue disponible en la plataforma.',
        'Puedes retomar tu trabajo inmediatamente.',
      ],
      ctaText: 'Entrar al sistema',
      ctaUrl: '{{login_link}}',
      note: 'Si tienes preguntas sobre tu pago, escríbenos a hola@ceorentable.com.',
      variables: ['name', 'amount', 'login_link'],
    }),
    createDefaultTemplate({
      name: 'payment_confirmed',
      subject: 'Pago confirmado — tu acceso está listo',
      body: 'Hola {{name}}, recibimos tu pago por {{amount}} y tu cuenta está lista para usar.',
      eyebrow: 'Pago procesado',
      title: 'Todo listo para continuar',
      intro:
        'Hola <strong style="font-size:18px;">{{name}}</strong>, registramos tu pago por <strong>{{amount}}</strong>.',
      bodyHtml:
        'Gracias por confiar en <strong>CEO Rentable OS™</strong>. Tu acceso ya está activo para que sigas trabajando con más claridad financiera.',
      featureItems: [
        'Acceso inmediato a tu panel.',
        'Herramientas financieras listas para usar.',
        'Soporte disponible si necesitas acompañamiento.',
      ],
      ctaText: 'Ir a mi panel',
      ctaUrl: '{{login_link}}',
      note: 'Guarda este correo como referencia de tu activación.',
      variables: ['name', 'amount', 'login_link'],
    }),
    createDefaultTemplate({
      name: 'invitation-access',
      subject: 'Invitación a CEO Rentable OS™',
      body: 'Hola {{name}}, tienes una invitación activa para acceder a CEO Rentable OS™.',
      eyebrow: 'Invitación activa',
      title: 'Tienes una invitación lista para ti',
      intro:
        'Hola <strong style="font-size:18px;">{{name}}</strong>, te compartimos tu acceso para entrar a <strong>CEO Rentable OS™</strong>.',
      bodyHtml:
        'Activa tu invitación desde el botón para comenzar a gestionar tu negocio con una plataforma pensada para darte mayor visibilidad y control.',
      featureItems: [
        'Ingresa con tu invitación activa.',
        'Empieza a ordenar tu información financiera.',
        'Trabaja con más claridad en tu operación diaria.',
      ],
      ctaText: 'Aceptar invitación',
      ctaUrl: '{{invite_link}}',
      note: 'Si no esperabas esta invitación, puedes ignorar este correo.',
      variables: ['name', 'email', 'invite_link'],
    }),
    createDefaultTemplate({
      name: 'promo_especial',
      subject: 'Oferta especial — {{promo_title}}',
      body: 'Hola {{name}}, hoy tienes disponible {{promo_title}} por {{promo_price}} hasta {{expiry_date}}.',
      eyebrow: 'Oferta especial',
      title: '{{promo_title}}',
      intro:
        'Hola <strong style="font-size:18px;">{{name}}</strong>, preparamos una oportunidad especial para ayudarte a seguir avanzando con <strong>CEO Rentable OS™</strong>.',
      bodyHtml:
        '<p style="margin:0 0 12px 0;">Precio especial: <strong>{{promo_price}}</strong></p><p style="margin:0 0 12px 0;">{{promo_description}}</p><p style="margin:0;">Válida hasta <strong>{{expiry_date}}</strong>.</p>',
      featureItems: [],
      ctaText: '{{cta_text}}',
      ctaUrl: '{{cta_url}}',
      note: 'Esta promoción puede estar sujeta a disponibilidad o fecha límite.',
      variables: ['name', 'promo_title', 'promo_price', 'promo_description', 'expiry_date', 'cta_text', 'cta_url'],
    }),
    createDefaultTemplate({
      name: 'reminder_onboarding',
      subject: 'Termina tu configuración en menos de 5 minutos',
      body: 'Hola {{name}}, tu cuenta está casi lista. Entra y termina tu configuración inicial.',
      eyebrow: 'Recordatorio',
      title: 'Te falta muy poco para empezar',
      intro:
        'Hola <strong style="font-size:18px;">{{name}}</strong>, tu cuenta ya está creada y solo te falta completar unos pasos para comenzar con <strong>CEO Rentable OS™</strong>.',
      bodyHtml:
        'Completa tu configuración inicial para que la plataforma pueda acompañarte mejor desde el inicio y mostrarte información útil desde tus primeros registros.',
      featureItems: [
        'Configura tu negocio rápidamente.',
        'Empieza a registrar información clave.',
        'Obtén una visión más clara de tu rentabilidad.',
      ],
      ctaText: 'Completar configuración',
      ctaUrl: '{{login_link}}',
      note: 'Mientras antes completes este paso, más rápido podrás aprovechar la plataforma.',
      variables: ['name', 'login_link'],
    }),
    createDefaultTemplate({
      name: 'access-granted',
      subject: 'Tu acceso fue activado en CEO Rentable OS™',
      body: 'Hola {{name}}, ya activamos tu acceso y puedes ingresar cuando quieras.',
      eyebrow: 'Acceso habilitado',
      title: 'Tu acceso ya fue activado',
      intro:
        'Hola <strong style="font-size:18px;">{{name}}</strong>, tu acceso a <strong>CEO Rentable OS™</strong> ya está habilitado.',
      bodyHtml:
        'Ya puedes entrar a la plataforma, revisar tu panel y comenzar a trabajar con mayor orden y claridad en tus números.',
      featureItems: [
        'Ingreso habilitado desde este momento.',
        'Acceso a tus herramientas clave de gestión.',
        'Acompañamiento disponible si necesitas ayuda para arrancar.',
      ],
      ctaText: 'Ir al sistema',
      ctaUrl: '{{login_link}}',
      note: 'Si tu acceso fue activado manualmente, este correo sirve como confirmación.',
      variables: ['name', 'email', 'login_link'],
    }),
  ];
}

const DEFAULT_TEMPLATES = buildDefaultTemplates();

export const emailService = {
  async getTemplate(templateName) {
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('name', templateName)
      .single();

    if (error) throw translateEmailServiceError(error);
    return normalizeTemplateRow(data);
  },

  async getAllTemplates() {
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) throw translateEmailServiceError(error);
    return (data || []).map(normalizeTemplateRow);
  },

  async createTemplate(template) {
    const payload = normalizeTemplatePayload(template);
    const { data, error } = await supabase
      .from('email_templates')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw translateEmailServiceError(error);
    return normalizeTemplateRow(data);
  },

  async updateTemplate(id, updates) {
    const payload = normalizeTemplatePayload(updates);
    const { data, error } = await supabase
      .from('email_templates')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw translateEmailServiceError(error);
    return normalizeTemplateRow(data);
  },

  async initializeTemplates() {
    const payload = DEFAULT_TEMPLATES.map((template) => normalizeTemplatePayload(template));
    const { error } = await supabase.from('email_templates').upsert(payload, { onConflict: 'name' });
    if (error) throw translateEmailServiceError(error);
    return true;
  },

  async sendNamedTemplate(templateName, recipient, variables = {}, options = {}) {
    let template;

    try {
      template = await this.getTemplate(templateName);
    } catch (error) {
      const message = `${error?.message || ''}`.toLowerCase();
      if (
        message.includes('0 rows') ||
        message.includes('no rows') ||
        message.includes('multiple (or no) rows')
      ) {
        await this.initializeTemplates();
        template = await this.getTemplate(templateName);
      } else {
        throw error;
      }
    }

    if (!template?.id) {
      throw new Error(`No encontramos el template "${templateName}".`);
    }

    return this.sendEmail(template.id, recipient, variables, options);
  },

  async sendEmail(templateId, recipient, variables = {}, options = {}) {
    const { data: templateData, error: templateError } = await supabase
      .from('email_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (templateError) throw templateError;
    const template = normalizeTemplateRow(templateData);

    const mergedVariables = normalizeTemplateVariables(template, variables);
    const subject = interpolate(template.subject, mergedVariables, template);
    const html = ensureFooter(
      normalizeTemplateHtmlAssets(interpolate(pickTemplateHtml(template), mergedVariables, template))
    );
    const text = interpolate(template.body || template.text_content || '', mergedVariables, template);
    const userId = options.userId || (await getCurrentUserId());

    return sendRawEmail({
      userId,
      templateId,
      campaignId: options.campaignId || null,
      to: recipient,
      name: mergedVariables.name || mergedVariables.full_name || null,
      subject,
      html,
      text,
      metadata: {
        variables: mergedVariables,
        template_name: template.name,
        source_type: options.sourceType || 'registered',
      },
    });
  },

  async resendEmail(emailLogId) {
    const { data: log, error } = await supabase
      .from('email_logs')
      .select('*')
      .eq('id', emailLogId)
      .single();

    if (error) throw error;
    const recipient = log.recipient_email || log.to_email || log.email;
    if (!recipient) {
      throw new Error('No encontramos destinatario para reenviar.');
    }

    if (log.template_id) {
      const vars = log.metadata?.variables || {
        name: log.recipient_name || log.name || '',
        email: recipient,
      };
      return this.sendEmail(log.template_id, recipient, vars, {
        campaignId: log.campaign_id || null,
      });
    }

    const html = ensureFooter(log.metadata?.html || '<p>Este correo fue reenviado desde CEO Rentable OS™.</p>');
    const text = log.metadata?.text || 'Este correo fue reenviado desde CEO Rentable OS™.';
    const userId = await getCurrentUserId();
    return sendRawEmail({
      userId,
      to: recipient,
      name: log.recipient_name || log.name || null,
      subject: log.subject || 'Mensaje CEO Rentable OS™',
      html,
      text,
      metadata: {
        resent_from_log: emailLogId,
      },
    });
  },

  async getEmailLogs(filters = {}) {
    let query = supabase.from('email_logs').select(`
      *,
      template:template_id(name),
      admin_user:user_id(full_name,email)
    `);
    if (filters.status) query = query.eq('status', normalizeStoredStatus(filters.status));
    if (filters.userId) query = query.eq('user_id', filters.userId);

    let data;
    let error;
    ({ data, error } = await query.order('timestamp', { ascending: false }));
    if (error) {
      query = supabase.from('email_logs').select('*');
      if (filters.status) query = query.eq('status', normalizeStoredStatus(filters.status));
      if (filters.userId) query = query.eq('user_id', filters.userId);
      ({ data, error } = await query.order('created_at', { ascending: false }));
    }
    if (error) throw error;

    return (data || []).map((log) => ({
      ...log,
      email: log.email || log.recipient_email || log.to_email || '',
      name: log.name || log.recipient_name || '',
      timestamp: log.timestamp || log.sent_at || log.created_at,
      status: mapStatus(log.status),
      source_type: log.source_type || log.metadata?.source_type || 'registered',
      template_name: log.template?.name || log.metadata?.template_name || '—',
      admin_name: log.admin_user?.full_name || log.admin_user?.email || '',
    }));
  },

  async previewCampaign({
    templateId,
    segment,
    recipients = [],
    variableDefaults = {},
  }) {
    const result = await postAdminEmailAction('preview_campaign', {
      templateId,
      segment,
      recipients,
      variableDefaults,
    });

    if (!result.success) {
      throw new Error(result.error || 'No se pudo preparar la vista previa.');
    }

    return result;
  },

  async sendBulkCampaign({
    templateId,
    segment,
    recipients = [],
    variableDefaults = {},
    campaignName = '',
  }) {
    const result = await postAdminEmailAction('send_campaign', {
      templateId,
      segment,
      recipients,
      variableDefaults,
      campaignName,
    });

    if (!result.success) {
      throw new Error(result.error || 'No se pudo enviar la campaña.');
    }

    return result;
  },

  async createCampaign({ templateId, name, description = '', targetPlan = null, targetSegment = 'all' }) {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase
      .from('email_campaigns')
      .insert({
        admin_id: userId,
        template_id: templateId,
        name,
        description,
        target_plan: targetPlan,
        target_segment: targetSegment,
        status: 'draft',
      })
      .select('*')
      .single();

    if (error) throw error;
    return data;
  },

  async sendCampaign(campaignId) {
    const { data: campaign, error: campaignError } = await supabase
      .from('email_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();
    if (campaignError) throw campaignError;

    let recipientsQuery = supabase
      .from('users')
      .select('id, email, full_name, role, has_access, plan')
      .not('email', 'is', null);

    if (campaign.target_plan) {
      recipientsQuery = recipientsQuery.eq('plan', campaign.target_plan);
    }
    if (campaign.target_segment === 'with_access') {
      recipientsQuery = recipientsQuery.eq('has_access', true);
    }
    if (campaign.target_segment === 'without_access') {
      recipientsQuery = recipientsQuery.eq('has_access', false);
    }
    if (campaign.target_segment === 'admins') {
      recipientsQuery = recipientsQuery.eq('role', 'admin');
    }

    const { data: recipients, error: recipientsError } = await recipientsQuery;
    if (recipientsError) throw recipientsError;

    await supabase
      .from('email_campaigns')
      .update({ status: 'sending', started_at: new Date().toISOString() })
      .eq('id', campaignId);

    let sent = 0;
    let failed = 0;

    for (const recipient of recipients || []) {
      try {
        await this.sendEmail(
          campaign.template_id,
          recipient.email,
          {
            name: recipient.full_name || recipient.email,
            email: recipient.email,
            ...(campaign.custom_variables || {}),
          },
          { campaignId }
        );
        sent += 1;
      } catch (error) {
        console.error(`Error enviando a ${recipient.email}:`, error.message);
        failed += 1;
      }
    }

    await supabase
      .from('email_campaigns')
      .update({
        status: 'completed',
        recipients_count: recipients?.length || 0,
        sent_count: sent,
        failed_count: failed,
        completed_at: new Date().toISOString(),
      })
      .eq('id', campaignId);

    return { sent, failed, total: recipients?.length || 0 };
  },
};
