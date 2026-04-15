import { supabase } from '@/lib/supabase';
import { ENV_CONFIG } from '@/config/env';
import { sendEmailThroughBackend } from '@/lib/emailApiClient';

const APP_URL = (ENV_CONFIG.app?.url || 'http://localhost:5173').replace(/\/$/, '');
const BRAND_LOGO_URL = `${APP_URL}/brand/isotipo.png`;
const EMAIL_FOOTER_HTML = `
  <div data-ceo-footer="1" style="text-align:center;margin-top:22px;color:#8a7f85;font-size:12px;line-height:1.5;">
    CEO Rentable OS™ · Tu sistema financiero inteligente<br/>
    Preguntas: <a href="mailto:hola@ceorentable.com" style="color:#D45387;text-decoration:none;">hola@ceorentable.com</a>
  </div>
`;

function mapStatus(status) {
  if (status === 'sent') return 'success';
  if (status === 'ok') return 'success';
  if (status === 'pending') return 'pending';
  if (status === 'failed') return 'failed';
  return status || 'pending';
}

function normalizeTemplateRow(row = {}) {
  const active = row.active ?? row.is_active ?? true;
  const htmlBody = ensureFooter(row.html_body || row.html_content || '');
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
  const htmlBody = ensureFooter(input.html_body || input.html_content || '');
  const textBody = input.body || input.text_content || '';

  return {
    name: input.name,
    subject: input.subject,
    body: textBody,
    text_content: input.text_content || textBody,
    html_body: htmlBody,
    html_content: input.html_content || htmlBody,
    editor_json: input.editor_json || null,
    variables: Array.isArray(input.variables) ? input.variables : [],
    active,
    is_active: active,
  };
}

function interpolate(text = '', vars = {}) {
  return Object.entries(vars).reduce((acc, [key, value]) => {
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
    status: mapStatus(log.status || 'pending'),
    metadata: log.metadata || {},
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
    status: patch.status ? mapStatus(patch.status) : undefined,
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

const DEFAULT_TEMPLATES = [
  {
    name: 'promo_especial',
    subject: '🔥 Oferta especial — {{promo_title}}',
    body: 'Hola {{name}}, hoy tienes {{promo_title}} por {{promo_price}}. {{promo_description}} Vence: {{expiry_date}}',
    html_body: `
      <div style="font-family:Inter,Arial,sans-serif;background:#F7F3EE;padding:20px;color:#1f1f1f;">
        <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #f0e6dd;border-radius:14px;overflow:hidden;">
          <div style="background:#fdf4f8;color:#D45387;padding:20px 22px;text-align:center;border-bottom:1px solid #f5d8e5;">
            <img src="${BRAND_LOGO_URL}" alt="CEO Rentable OS" style="width:56px;height:56px;object-fit:contain;display:block;margin:0 auto 8px;" />
            <h2 style="margin:0;font-size:18px;letter-spacing:0.04em;">CEO RENTABLE OS™</h2>
          </div>
          <div style="padding:22px;">
            <h3 style="margin:0 0 10px 0;font-size:26px;">{{promo_title}}</h3>
            <p style="margin:0 0 10px 0;font-size:15px;">Hola <strong style="font-size:18px;font-weight:700;line-height:1.2;">{{name}}</strong>, esta es tu oferta activa.</p>
            <p style="margin:0 0 6px 0;font-size:14px;">Precio especial: <strong>{{promo_price}}</strong></p>
            <p style="margin:0 0 12px 0;font-size:14px;">{{promo_description}}</p>
            <p style="margin:0 0 16px 0;font-size:13px;color:#6f6f6f;">Válido hasta {{expiry_date}}</p>
            <a href="{{cta_url}}" style="display:inline-block;background:#D45387;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;">{{cta_text}}</a>
          </div>
        </div>
      </div>
    `,
    variables: ['name', 'promo_title', 'promo_price', 'promo_description', 'expiry_date', 'cta_text', 'cta_url'],
    is_active: true,
    active: true,
  },
  {
    name: 'newsletter_general',
    subject: '{{subject_line}}',
    body: 'Hola {{name}}, {{headline}}. {{body_text}}',
    html_body: `
      <div style="font-family:Inter,Arial,sans-serif;background:#F7F3EE;padding:20px;color:#1f1f1f;">
        <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #f0e6dd;border-radius:14px;overflow:hidden;">
          <div style="background:#fdf4f8;padding:20px 22px;border-bottom:1px solid #f5d8e5;text-align:center;">
            <img src="${BRAND_LOGO_URL}" alt="CEO Rentable OS" style="width:56px;height:56px;object-fit:contain;display:block;margin:0 auto 8px;" />
            <h2 style="margin:0;color:#D45387;font-size:18px;letter-spacing:0.04em;">CEO RENTABLE OS™</h2>
          </div>
          <div style="padding:22px;">
            <h3 style="margin:0 0 10px 0;">{{headline}}</h3>
            <p style="margin:0 0 14px 0;font-size:14px;">Hola <strong style="font-size:18px;font-weight:700;line-height:1.2;">{{name}}</strong>,</p>
            <p style="margin:0 0 18px 0;font-size:14px;line-height:1.6;">{{body_text}}</p>
            <a href="{{cta_url}}" style="display:inline-block;background:#D45387;color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:600;">{{cta_text}}</a>
          </div>
        </div>
      </div>
    `,
    variables: ['name', 'subject_line', 'headline', 'body_text', 'cta_text', 'cta_url'],
    is_active: true,
    active: true,
  },
  {
    name: 'reminder_onboarding',
    subject: 'Empieza en menos de 5 minutos ⏱️',
    body: 'Hola {{name}}, activa tu cuenta y entra a tu panel: {{login_link}}',
    html_body: `
      <div style="font-family:Inter,Arial,sans-serif;background:#F7F3EE;padding:20px;color:#1f1f1f;">
        <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #f0e6dd;border-radius:14px;overflow:hidden;">
          <div style="background:#fdf4f8;padding:20px 22px;border-bottom:1px solid #f5d8e5;text-align:center;">
            <img src="${BRAND_LOGO_URL}" alt="CEO Rentable OS" style="width:56px;height:56px;object-fit:contain;display:block;margin:0 auto 8px;" />
            <h2 style="margin:0;color:#D45387;font-size:18px;letter-spacing:0.04em;">CEO RENTABLE OS™</h2>
          </div>
          <div style="padding:22px;">
            <p style="font-size:14px;">Hola <strong style="font-size:18px;font-weight:700;line-height:1.2;">{{name}}</strong>,</p>
            <p style="font-size:14px;line-height:1.6;">Tu cuenta está casi lista. Entra y configura tu negocio para empezar a ver reportes reales.</p>
            <a href="{{login_link}}" style="display:inline-block;background:#D45387;color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:600;">Ir al Dashboard</a>
          </div>
        </div>
      </div>
    `,
    variables: ['name', 'login_link'],
    is_active: true,
    active: true,
  },
  {
    name: 'payment_confirmed',
    subject: 'Pago confirmado — Tu acceso está listo 💳',
    body: 'Hola {{name}}, recibimos tu pago por {{amount}}. Ya puedes usar todas las funciones.',
    html_body: `
      <div style="font-family:Inter,Arial,sans-serif;background:#F7F3EE;padding:20px;color:#1f1f1f;">
        <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #f0e6dd;border-radius:14px;overflow:hidden;">
          <div style="background:#fdf4f8;padding:20px 22px;border-bottom:1px solid #f5d8e5;text-align:center;">
            <img src="${BRAND_LOGO_URL}" alt="CEO Rentable OS" style="width:56px;height:56px;object-fit:contain;display:block;margin:0 auto 8px;" />
            <h2 style="margin:0;color:#D45387;font-size:18px;letter-spacing:0.04em;">CEO RENTABLE OS™</h2>
          </div>
          <div style="padding:22px;">
            <p style="font-size:14px;">Hola <strong style="font-size:18px;font-weight:700;line-height:1.2;">{{name}}</strong>,</p>
            <p style="font-size:14px;">Hemos recibido tu pago por <strong>{{amount}}</strong>.</p>
            <p style="font-size:14px;line-height:1.6;">Tu acceso está activo y puedes entrar a CEO Rentable OS™ desde ahora.</p>
            <a href="{{login_link}}" style="display:inline-block;background:#D45387;color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:600;">Entrar al sistema</a>
          </div>
        </div>
      </div>
    `,
    variables: ['name', 'amount', 'login_link'],
    is_active: true,
    active: true,
  },
  {
    name: 'welcome_email',
    subject: 'Tu acceso a CEO Rentable OS™ ya está activo 🚀',
    body: 'Bienvenida {{name}}. Tu acceso está activo. Dashboard, rentabilidad, facturación y más ya están disponibles.',
    html_body: `
      <div style="font-family:Inter,Arial,sans-serif;background:#F7F3EE;padding:20px;color:#1f1f1f;">
        <div style="max-width:620px;margin:0 auto;">
          <div style="background:#f6eff5;padding:18px 20px 10px;text-align:center;">
            <img src="${BRAND_LOGO_URL}" alt="CEO Rentable OS" style="width:56px;height:56px;object-fit:contain;display:block;margin:0 auto 8px;" />
            <h2 style="margin:0;color:#D45387;font-size:18px;letter-spacing:0.04em;">CEO RENTABLE OS™</h2>
          </div>
          <div style="background:#fff;border:1px solid #f0e6dd;border-radius:14px;padding:24px;">
            <h3 style="margin:0 0 10px 0;font-size:18px;line-height:1.2;">
              Bienvenida, <span style="font-size:18px;font-weight:700;">{{name}}</span>! 🎉
            </h3>
            <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">
              Tu acceso a <strong>CEO Rentable OS™</strong> ya está activo.
              Ahora tienes las herramientas para conocer exactamente cuánto gana tu negocio.
            </p>
            <div style="background:#fdf4f8;border-left:4px solid #D45387;border-radius:8px;padding:12px 14px;margin-bottom:18px;font-size:14px;">
              ✅ Dashboard financiero completo<br/>
              ✅ Análisis de rentabilidad<br/>
              ✅ Facturación y cotizaciones<br/>
              ✅ Gestión de clientes e inventario
            </div>
            <a href="{{login_link}}" style="display:inline-block;background:#D45387;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600;">Ir al Dashboard →</a>
          </div>
        </div>
      </div>
    `,
    variables: ['name', 'login_link'],
    is_active: true,
    active: true,
  },
  {
    name: 'invitation-access',
    subject: 'Invitacion a CEO Rentable OS™',
    body: 'Hola {{name}}, te invitamos a CEO Rentable OS. Ingresa aqui: {{invite_link}}',
    html_body: `
      <div style="font-family:Inter,Arial,sans-serif;background:#F7F3EE;padding:20px;color:#1f1f1f;">
        <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #f0e6dd;border-radius:14px;overflow:hidden;">
          <div style="background:#fdf4f8;padding:20px;border-bottom:1px solid #f5d8e5;text-align:center;">
            <img src="${BRAND_LOGO_URL}" alt="CEO Rentable OS" style="width:56px;height:56px;object-fit:contain;display:block;margin:0 auto 8px;" />
            <h2 style="margin:0;color:#D45387;font-size:18px;letter-spacing:0.04em;">CEO RENTABLE OS™</h2>
          </div>
          <div style="padding:22px;">
            <h3 style="margin:0 0 10px 0;font-size:18px;line-height:1.2;">Bienvenida, <span style="font-size:18px;font-weight:700;">{{name}}</span>! 🎉</h3>
            <p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;">
              Ya tienes una invitación activa para entrar a <strong>CEO Rentable OS™</strong>.
            </p>
            <div style="background:#fdf4f8;border-left:4px solid #D45387;border-radius:8px;padding:12px 14px;margin-bottom:18px;font-size:14px;">
              ✅ Dashboard financiero completo<br/>
              ✅ Análisis de rentabilidad<br/>
              ✅ Facturación y cotizaciones<br/>
              ✅ Gestión de clientes e inventario
            </div>
            <a href="{{invite_link}}" style="display:inline-block;background:#D45387;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600;">Aceptar invitación →</a>
          </div>
        </div>
      </div>
    `,
    variables: ['name', 'email', 'invite_link'],
    is_active: true,
    active: true,
  },
  {
    name: 'welcome',
    subject: 'Bienvenida a CEO Rentable OS™',
    body: 'Hola {{name}}, tu acceso esta listo. Entra a tu panel para comenzar.',
    html_body: `
      <div style="font-family:Inter,Arial,sans-serif;background:#F7F3EE;padding:20px;color:#1f1f1f;">
        <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #f0e6dd;border-radius:14px;overflow:hidden;">
          <div style="background:#fdf4f8;padding:20px;border-bottom:1px solid #f5d8e5;text-align:center;">
            <img src="${BRAND_LOGO_URL}" alt="CEO Rentable OS" style="width:56px;height:56px;object-fit:contain;display:block;margin:0 auto 8px;" />
            <h2 style="margin:0;color:#D45387;font-size:18px;letter-spacing:0.04em;">CEO RENTABLE OS™</h2>
          </div>
          <div style="padding:22px;">
            <h3 style="margin:0 0 10px 0;font-size:18px;line-height:1.2;">Bienvenida, <span style="font-size:18px;font-weight:700;">{{name}}</span>! 🎉</h3>
            <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;">Tu acceso está listo. Entra a tu panel y empieza hoy.</p>
            <a href="{{login_link}}" style="display:inline-block;background:#D45387;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600;">Ir al Dashboard →</a>
          </div>
        </div>
      </div>
    `,
    variables: ['name', 'email'],
    is_active: true,
    active: true,
  },
  {
    name: 'payment-confirmation',
    subject: 'Confirmacion de pago',
    body: 'Hola {{name}}, confirmamos tu pago por {{amount}}.',
    html_body: `
      <div style="font-family:Inter,Arial,sans-serif;background:#F7F3EE;padding:20px;color:#1f1f1f;">
        <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #f0e6dd;border-radius:14px;overflow:hidden;">
          <div style="background:#fdf4f8;padding:20px;border-bottom:1px solid #f5d8e5;text-align:center;">
            <img src="${BRAND_LOGO_URL}" alt="CEO Rentable OS" style="width:56px;height:56px;object-fit:contain;display:block;margin:0 auto 8px;" />
            <h2 style="margin:0;color:#D45387;font-size:18px;letter-spacing:0.04em;">CEO RENTABLE OS™</h2>
          </div>
          <div style="padding:22px;">
            <h3 style="margin:0 0 10px 0;font-size:18px;line-height:1.2;">Pago confirmado ✅</h3>
            <p style="margin:0 0 12px 0;font-size:15px;">Hola <strong style="font-size:18px;font-weight:700;line-height:1.2;">{{name}}</strong>, confirmamos tu pago por <strong>{{amount}}</strong>.</p>
            <p style="margin:0 0 16px 0;font-size:14px;line-height:1.6;">Tu acceso está activo y listo para usar CEO Rentable OS™.</p>
            <a href="{{login_link}}" style="display:inline-block;background:#D45387;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600;">Entrar al sistema →</a>
          </div>
        </div>
      </div>
    `,
    variables: ['name', 'email', 'amount'],
    is_active: true,
    active: true,
  },
];

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

  async sendEmail(templateId, recipient, variables = {}, options = {}) {
    const { data: templateData, error: templateError } = await supabase
      .from('email_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (templateError) throw templateError;
    const template = normalizeTemplateRow(templateData);

    const subject = interpolate(template.subject, variables);
    const html = ensureFooter(interpolate(template.html_body || template.html_content || '', variables));
    const text = interpolate(template.body || template.text_content || '', variables);
    const userId = options.userId || (await getCurrentUserId());

    return sendRawEmail({
      userId,
      templateId,
      campaignId: options.campaignId || null,
      to: recipient,
      name: variables.name || variables.full_name || null,
      subject,
      html,
      text,
      metadata: {
        variables,
        template_name: template.name,
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
    let query = supabase.from('email_logs').select('*');
    if (filters.status) query = query.eq('status', mapStatus(filters.status));
    if (filters.userId) query = query.eq('user_id', filters.userId);

    let data;
    let error;
    ({ data, error } = await query.order('timestamp', { ascending: false }));
    if (error) {
      ({ data, error } = await query.order('created_at', { ascending: false }));
    }
    if (error) throw error;

    return (data || []).map((log) => ({
      ...log,
      email: log.email || log.recipient_email || log.to_email || '',
      name: log.name || log.recipient_name || '',
      timestamp: log.timestamp || log.sent_at || log.created_at,
      status: mapStatus(log.status),
    }));
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
