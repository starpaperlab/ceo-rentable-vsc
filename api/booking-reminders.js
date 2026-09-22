import { createClient } from '@supabase/supabase-js';
import { sendEmailWithResend } from '../server/sendEmailHandler.js';

function escapeHtml(value = '') {
  return `${value ?? ''}`
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getServiceClient(env = process.env) {
  const url = `${env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''}`.trim();
  const key = `${env.SUPABASE_SERVICE_ROLE_KEY || ''}`.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function formatAppointment(date, time, timezone = 'America/Santo_Domingo') {
  try {
    const value = new Date(`${date}T${time}`);
    const dateText = new Intl.DateTimeFormat('es-DO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: timezone,
    }).format(value);
    const timeText = new Intl.DateTimeFormat('es-DO', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone,
    }).format(value);
    return { dateText, timeText };
  } catch {
    return { dateText: date, timeText: time };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const cronSecret = `${process.env.CRON_SECRET || ''}`.trim();
  const authHeader = `${req.headers?.authorization || ''}`.trim();
  const cronScheduleHeader = `${req.headers?.['x-vercel-cron-schedule'] || ''}`.trim();
  const authorizedBySecret = Boolean(cronSecret) && authHeader === `Bearer ${cronSecret}`;
  const authorizedVercelCronFallback = !cronSecret && cronScheduleHeader === '*/5 * * * *';

  if (!authorizedBySecret && !authorizedVercelCronFallback) {
    return res.status(401).json({ success: false });
  }

  const service = getServiceClient();
  if (!service) {
    return res.status(500).json({ success: false, error: 'Missing Supabase server configuration.' });
  }

  const { data: due = [], error } = await service.rpc('get_due_public_booking_reminders', {
    p_now: new Date().toISOString(),
  });

  if (error) {
    return res.status(500).json({ success: false, error: 'Could not load due booking reminders.' });
  }

  let sent = 0;
  let failed = 0;
  const results = [];

  for (const item of due) {
    const attemptAt = new Date().toISOString();
    await service
      .from('appointments')
      .update({
        reminder_email_last_attempt_at: attemptAt,
        reminder_email_error: null,
      })
      .eq('id', item.appointment_id);

    const { dateText, timeText } = formatAppointment(
      item.appointment_date,
      item.appointment_time,
      item.timezone
    );

    const reminderLabel = item.reminder_kind === '2h' ? 'en 2 horas' : 'mañana';
    const subject = item.reminder_kind === '2h'
      ? `Tu cita es en 2 horas · ${item.business_name}`
      : `Recordatorio: tu cita es mañana · ${item.business_name}`;

    const appUrl = `${process.env.APP_URL || process.env.VITE_APP_URL || 'https://app.ceorentable.com'}`.replace(/\/+$/, '');

    const html = `
      <div style="margin:0;background:#f7f3ee;padding:28px 14px;font-family:Inter,Arial,sans-serif;color:#1f1f1f;">
        <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #eee4df;border-radius:20px;overflow:hidden;">
          <div style="padding:26px 24px;text-align:center;background:#fff7fa;border-bottom:1px solid #f3d7e3;">
            ${item.logo_url ? `<img src="${escapeHtml(item.logo_url)}" alt="${escapeHtml(item.business_name)}" style="max-height:60px;max-width:180px;object-fit:contain;margin-bottom:12px;" />` : ''}
            <h1 style="margin:0;font-size:24px;line-height:1.2;">Recordatorio de cita</h1>
            <p style="margin:8px 0 0;color:#6b7280;font-size:14px;">${escapeHtml(item.business_name)}</p>
          </div>
          <div style="padding:28px 24px;">
            <p style="margin:0 0 18px;font-size:16px;">Hola <strong>${escapeHtml(item.client_name || 'Cliente')}</strong>, te recordamos que tienes una cita ${reminderLabel}.</p>
            <div style="border-radius:14px;background:#f8fafc;padding:18px;margin-bottom:22px;">
              <p style="margin:0 0 8px;font-weight:700;font-size:17px;">${escapeHtml(item.service_type || 'Cita')}</p>
              <p style="margin:0 0 6px;color:#4b5563;font-size:15px;"><strong>Fecha:</strong> ${escapeHtml(dateText)}</p>
              <p style="margin:0;color:#4b5563;font-size:15px;"><strong>Hora:</strong> ${escapeHtml(timeText)}</p>
            </div>
            <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">Si necesitas hacer algún cambio, contacta directamente al negocio.</p>
            <p style="margin:24px 0 0;color:#9ca3af;font-size:11px;">Recordatorio automático enviado por CEO Rentable OS™.</p>
          </div>
        </div>
      </div>
    `;

    const sendResult = await sendEmailWithResend({
      to: item.client_email,
      subject,
      html,
      text: `Recordatorio de cita con ${item.business_name}. ${item.service_type || 'Cita'} · ${dateText} · ${timeText}.`,
    });

    if (sendResult.ok) {
      sent += 1;
      const update = item.reminder_kind === '2h'
        ? { reminder_2h_sent_at: new Date().toISOString(), reminder_email_error: null }
        : { reminder_24h_sent_at: new Date().toISOString(), reminder_email_error: null };

      await service.from('appointments').update(update).eq('id', item.appointment_id);
      results.push({ appointment_id: item.appointment_id, kind: item.reminder_kind, status: 'sent' });
    } else {
      failed += 1;
      const message = sendResult?.body?.error || 'No se pudo enviar el recordatorio.';
      await service
        .from('appointments')
        .update({ reminder_email_error: message })
        .eq('id', item.appointment_id);
      results.push({ appointment_id: item.appointment_id, kind: item.reminder_kind, status: 'failed' });
    }
  }

  return res.status(200).json({
    success: true,
    processed: due.length,
    sent,
    failed,
    results,
  });
}
