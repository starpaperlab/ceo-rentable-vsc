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

function formatFollowUpType(value = '') {
  return ({
    call: 'Llamada',
    whatsapp: 'WhatsApp',
    email: 'Email',
    meeting: 'Reunión',
    other: 'Otro',
  })[value] || 'Seguimiento';
}

function formatDateTime(value, timeZone = 'America/Santo_Domingo') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha programada';
  try {
    return new Intl.DateTimeFormat('es-DO', {
      timeZone: timeZone || 'America/Santo_Domingo',
      dateStyle: 'long',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('es-DO', {
      dateStyle: 'long',
      timeStyle: 'short',
    }).format(date);
  }
}

function getServiceClient(env = process.env) {
  const url = `${env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''}`.trim();
  const key = `${env.SUPABASE_SERVICE_ROLE_KEY || ''}`.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function resolveOwnerEmail(service, ownerUserId) {
  if (!ownerUserId) return null;

  const { data: profile } = await service
    .from('users')
    .select('id,email,full_name')
    .eq('id', ownerUserId)
    .maybeSingle();

  if (profile?.email) return profile;

  try {
    const { data } = await service.auth.admin.getUserById(ownerUserId);
    if (data?.user?.email) {
      return {
        id: ownerUserId,
        email: data.user.email,
        full_name:
          data.user.user_metadata?.full_name ||
          data.user.user_metadata?.name ||
          data.user.email,
      };
    }
  } catch (_) {
    // Sigue con null para registrar el error en el cliente.
  }

  return null;
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
  const authorizedVercelCronFallback = !cronSecret && cronScheduleHeader === '* * * * *';

  if (!authorizedBySecret && !authorizedVercelCronFallback) {
    return res.status(401).json({ success: false });
  }

  const service = getServiceClient();
  if (!service) {
    return res.status(500).json({
      success: false,
      error: 'Missing Supabase server configuration.',
    });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const retryCutoff = now.getTime() - (10 * 60 * 1000);

  const { data: dueClients, error: clientsError } = await service
    .from('clients')
    .select('id,name,workspace_id,next_follow_up_at,next_follow_up_type,next_follow_up_note,follow_up_email_sent_at,follow_up_email_last_attempt_at')
    .not('next_follow_up_at', 'is', null)
    .is('follow_up_email_sent_at', null)
    .lte('next_follow_up_at', nowIso)
    .order('next_follow_up_at', { ascending: true })
    .limit(50);

  if (clientsError) {
    return res.status(500).json({ success: false, error: 'Could not load due follow-ups.' });
  }

  const queue = (dueClients || []).filter((client) => {
    if (!client.follow_up_email_last_attempt_at) return true;
    const lastAttempt = new Date(client.follow_up_email_last_attempt_at).getTime();
    return !Number.isFinite(lastAttempt) || lastAttempt <= retryCutoff;
  });

  if (queue.length === 0) {
    return res.status(200).json({ success: true, processed: 0, sent: 0, failed: 0 });
  }

  const workspaceIds = [...new Set(queue.map((client) => client.workspace_id).filter(Boolean))];
  const { data: workspaces = [] } = workspaceIds.length
    ? await service
        .from('workspaces')
        .select('id,name,owner_user_id,timezone')
        .in('id', workspaceIds)
    : { data: [] };

  const workspaceById = new Map((workspaces || []).map((workspace) => [workspace.id, workspace]));
  const ownerCache = new Map();

  let sent = 0;
  let failed = 0;
  const results = [];

  for (const client of queue) {
    const workspace = workspaceById.get(client.workspace_id);
    const ownerUserId = workspace?.owner_user_id || null;

    let recipient = ownerCache.get(ownerUserId);
    if (recipient === undefined) {
      recipient = await resolveOwnerEmail(service, ownerUserId);
      ownerCache.set(ownerUserId, recipient || null);
    }

    const attemptAt = new Date().toISOString();
    await service
      .from('clients')
      .update({
        follow_up_email_last_attempt_at: attemptAt,
        follow_up_email_error: null,
      })
      .eq('id', client.id)
      .is('follow_up_email_sent_at', null);

    if (!recipient?.email) {
      failed += 1;
      const errorMessage = 'No se encontró el email del usuario responsable.';
      await service
        .from('clients')
        .update({ follow_up_email_error: errorMessage })
        .eq('id', client.id)
        .is('follow_up_email_sent_at', null);
      results.push({ client_id: client.id, status: 'failed', reason: 'recipient_missing' });
      continue;
    }

    const timeZone = workspace?.timezone || 'America/Santo_Domingo';
    const when = formatDateTime(client.next_follow_up_at, timeZone);
    const type = formatFollowUpType(client.next_follow_up_type);
    const clientName = client.name || 'Cliente';
    const note = client.next_follow_up_note || 'Sin nota adicional.';
    const businessName = workspace?.name || 'tu negocio';
    const appUrl = `${process.env.APP_URL || process.env.VITE_APP_URL || 'https://app.ceorentable.com'}`.replace(/\/+$/, '');
    const clientsUrl = `${appUrl}/Clients`;

    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f7f3f5;padding:28px;color:#211a1e;">
        <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #eadfe5;">
          <div style="background:#D45387;color:#ffffff;padding:24px 28px;">
            <div style="font-size:13px;opacity:.9;">CEO Rentable OS™</div>
            <h1 style="font-size:22px;line-height:1.25;margin:6px 0 0;">Recordatorio de seguimiento</h1>
          </div>
          <div style="padding:28px;">
            <p style="margin-top:0;">Hola <strong>${escapeHtml(recipient.full_name || recipient.email)}</strong>,</p>
            <p>Tienes un seguimiento programado para <strong>${escapeHtml(clientName)}</strong> en <strong>${escapeHtml(businessName)}</strong>.</p>
            <div style="margin:22px 0;padding:18px;border-radius:14px;background:#fbf7f9;border:1px solid #efe4e9;">
              <p style="margin:0 0 8px;"><strong>Acción:</strong> ${escapeHtml(type)}</p>
              <p style="margin:0 0 8px;"><strong>Fecha y hora:</strong> ${escapeHtml(when)}</p>
              <p style="margin:0;"><strong>Nota:</strong> ${escapeHtml(note)}</p>
            </div>
            <a href="${clientsUrl}" style="display:inline-block;background:#D45387;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px;">Abrir Clientes</a>
            <p style="margin:24px 0 0;color:#756b70;font-size:12px;">Este correo fue generado automáticamente por un seguimiento de CRM en CEO Rentable.</p>
          </div>
        </div>
      </div>
    `;

    const sendResult = await sendEmailWithResend({
      to: recipient.email,
      subject: `Seguimiento pendiente: ${clientName}`,
      html,
      text: `Recordatorio de seguimiento para ${clientName}. ${type}. ${when}. Nota: ${note}`,
    });

    if (sendResult.ok) {
      sent += 1;
      await service
        .from('clients')
        .update({
          follow_up_email_sent_at: new Date().toISOString(),
          follow_up_email_error: null,
        })
        .eq('id', client.id)
        .is('follow_up_email_sent_at', null);
      results.push({ client_id: client.id, status: 'sent' });
      continue;
    }

    failed += 1;
    const errorMessage = sendResult?.body?.error || 'No se pudo enviar el recordatorio.';
    await service
      .from('clients')
      .update({ follow_up_email_error: errorMessage })
      .eq('id', client.id)
      .is('follow_up_email_sent_at', null);
    results.push({ client_id: client.id, status: 'failed', reason: sendResult?.body?.code || 'send_failed' });
  }

  return res.status(200).json({
    success: true,
    processed: queue.length,
    sent,
    failed,
    results,
  });
}
