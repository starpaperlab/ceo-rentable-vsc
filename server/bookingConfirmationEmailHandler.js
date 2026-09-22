import { createClient } from '@supabase/supabase-js';

const RESEND_API_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'CEO Rentable OS <notificaciones@ceorentable.com>';
const DEFAULT_REPLY_TO = 'soporte@ceorentable.com';

function getServiceClient(env = process.env) {
  const url = `${env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''}`.trim();
  const key = `${env.SUPABASE_SERVICE_ROLE_KEY || ''}`.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function escapeHtml(value = '') {
  return `${value || ''}`
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function googleCalendarUrl({ date, time, durationMinutes = 20, title, businessName, timezone }) {
  const [year, month, day] = `${date}`.split('-').map(Number);
  const [hour, minute] = `${time}`.split(':').map(Number);
  const start = new Date(year, month - 1, day, hour, minute);
  const end = new Date(start.getTime() + Number(durationMinutes || 20) * 60000);
  const stamp = (value) => [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
    'T',
    String(value.getHours()).padStart(2, '0'),
    String(value.getMinutes()).padStart(2, '0'),
    '00',
  ].join('');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title || 'Cita',
    dates: `${stamp(start)}/${stamp(end)}`,
    details: `Reserva confirmada con ${businessName || 'el negocio'}.`,
    ctz: timezone || 'America/Santo_Domingo',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export async function handleBookingConfirmationEmail(payload = {}, { env = process.env, fetchImpl = fetch } = {}) {
  const appointmentId = `${payload.appointmentId || ''}`.trim();
  const requestedEmail = `${payload.email || ''}`.trim().toLowerCase();
  if (!appointmentId || !requestedEmail) {
    return { status: 400, body: { success: false, error: 'Datos incompletos.' } };
  }

  const service = getServiceClient(env);
  if (!service) {
    return { status: 500, body: { success: false, error: 'Configuración del servidor incompleta.' } };
  }

  const { data: appointment, error: appointmentError } = await service
    .from('appointments')
    .select('id, workspace_id, client_name, client_email, service_type, date, time, duration_minutes, booking_page_id, booking_source')
    .eq('id', appointmentId)
    .maybeSingle();

  if (appointmentError || !appointment || appointment.booking_source !== 'public_booking') {
    return { status: 404, body: { success: false, error: 'Reserva no encontrada.' } };
  }

  const storedEmail = `${appointment.client_email || ''}`.trim().toLowerCase();
  if (!storedEmail || storedEmail !== requestedEmail) {
    return { status: 403, body: { success: false, error: 'Correo no coincide con la reserva.' } };
  }

  const [{ data: workspace }, { data: bookingPage }] = await Promise.all([
    service.from('workspaces').select('name, logo_url, brand_primary_color, timezone').eq('id', appointment.workspace_id).maybeSingle(),
    appointment.booking_page_id
      ? service.from('booking_pages').select('timezone').eq('id', appointment.booking_page_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const apiKey = `${env.RESEND_API_KEY || ''}`.trim();
  if (!apiKey) {
    return { status: 500, body: { success: false, error: 'Servicio de correo no configurado.' } };
  }

  const businessName = workspace?.name || 'CEO Rentable';
  const primary = workspace?.brand_primary_color || '#D45387';
  const timezone = bookingPage?.timezone || workspace?.timezone || 'America/Santo_Domingo';
  const calendarUrl = googleCalendarUrl({
    date: appointment.date,
    time: appointment.time,
    durationMinutes: appointment.duration_minutes || 20,
    title: appointment.service_type,
    businessName,
    timezone,
  });

  const safeName = escapeHtml(appointment.client_name || 'Cliente');
  const safeBusiness = escapeHtml(businessName);
  const safeService = escapeHtml(appointment.service_type || 'Cita');
  const safeDate = escapeHtml(appointment.date || '');
  const safeTime = escapeHtml(appointment.time || '');

  const html = `
  <div style="margin:0;background:#f7f3ee;padding:28px 14px;font-family:Inter,Arial,sans-serif;color:#1f1f1f;">
    <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #eee4df;border-radius:20px;overflow:hidden;">
      <div style="padding:28px 24px;text-align:center;background:#fff7fa;border-bottom:1px solid #f3d7e3;">
        ${workspace?.logo_url ? `<img src="${escapeHtml(workspace.logo_url)}" alt="${safeBusiness}" style="max-height:62px;max-width:180px;object-fit:contain;margin-bottom:12px;" />` : ''}
        <h1 style="margin:0;font-size:26px;line-height:1.2;">Reserva confirmada</h1>
        <p style="margin:8px 0 0;color:#6b7280;font-size:14px;">${safeBusiness}</p>
      </div>
      <div style="padding:28px 24px;">
        <p style="margin:0 0 18px;font-size:16px;">Hola <strong>${safeName}</strong>, tu cita quedó confirmada.</p>
        <div style="border-radius:14px;background:#f8fafc;padding:18px;margin-bottom:22px;">
          <p style="margin:0 0 8px;font-weight:700;font-size:17px;">${safeService}</p>
          <p style="margin:0;color:#4b5563;font-size:15px;">${safeDate} · ${safeTime}</p>
        </div>
        <a href="${calendarUrl}" target="_blank" style="display:block;text-align:center;background:${primary};color:#ffffff;text-decoration:none;padding:14px 18px;border-radius:12px;font-weight:700;font-size:15px;">
          Agregar a Google Calendar
        </a>
        <p style="margin:22px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">Si necesitas cambiar la cita, responde a este correo o contacta directamente al negocio.</p>
      </div>
    </div>
  </div>`;

  const response = await fetchImpl(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${env.RESEND_FROM_EMAIL || DEFAULT_FROM}`,
      to: [storedEmail],
      subject: `Reserva confirmada · ${businessName}`,
      html,
      reply_to: `${env.RESEND_REPLY_TO || DEFAULT_REPLY_TO}`,
    }),
  });

  const resultText = await response.text();
  let result = {};
  try { result = resultText ? JSON.parse(resultText) : {}; } catch (_) { result = {}; }

  if (!response.ok) {
    console.error('booking_confirmation_email_failed', { status: response.status, appointmentId });
    return { status: 502, body: { success: false, error: 'No se pudo enviar la confirmación.' } };
  }

  return { status: 200, body: { success: true, id: result?.id || null } };
}
