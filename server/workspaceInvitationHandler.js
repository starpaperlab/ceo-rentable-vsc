import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { sendEmailWithResend } from './sendEmailHandler.js';

const ALLOWED_ROLES = new Set(['admin', 'member', 'viewer']);
const ALLOWED_PROFILES = new Set(['ventas', 'cobros', 'operaciones', 'finanzas', 'asistente', 'personalizado']);
let anonClient = null;
let serviceClient = null;
const normalizeEmail = (value = '') => `${value || ''}`.trim().toLowerCase();

function getBearerToken(headers = {}) { const raw = headers.authorization || headers.Authorization || ''; const match = `${raw}`.match(/^Bearer\s+(.+)$/i); return match?.[1]?.trim() || ''; }
function getAnonClient(env = process.env) { if (anonClient) return anonClient; const url = `${env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''}`.trim(); const key = `${env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ''}`.trim(); if (!url || !key) return null; anonClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }); return anonClient; }
function getServiceClient(env = process.env) { if (serviceClient) return serviceClient; const url = `${env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''}`.trim(); const key = `${env.SUPABASE_SERVICE_ROLE_KEY || ''}`.trim(); if (!url || !key) return null; serviceClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }); return serviceClient; }
function resolveBaseUrl(headers = {}, env = process.env) { const configured = `${env.APP_URL || env.VITE_APP_URL || ''}`.trim().replace(/\/$/, ''); if (configured) return configured; const host = `${headers['x-forwarded-host'] || headers.host || ''}`.trim(); if (host) return `${`${headers['x-forwarded-proto'] || 'https'}`.trim()}://${host}`; return 'https://app.ceorentable.com'; }
function safePermissions(value) { if (!value || typeof value !== 'object' || Array.isArray(value)) return {}; return Object.fromEntries(Object.entries(value).map(([key, allowed]) => [key, allowed === true])); }
async function findAuthUserByEmail(supabase, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const perPage = 1000;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    const match = users.find((candidate) => normalizeEmail(candidate?.email) === normalized);
    if (match) return match;
    if (users.length < perPage) break;
  }
  return null;
}
async function authenticate(headers, env) { const token = getBearerToken(headers); if (!token) return { ok: false, status: 401, error: 'Sesión inválida o expirada.' }; const client = getAnonClient(env); if (!client) return { ok: false, status: 500, error: 'Configuración de autenticación incompleta.' }; try { const { data, error } = await client.auth.getUser(token); if (error || !data?.user?.id) return { ok: false, status: 401, error: 'Sesión inválida o expirada.' }; return { ok: true, user: data.user }; } catch (_) { return { ok: false, status: 401, error: 'Sesión inválida o expirada.' }; } }
async function authorizeWorkspaceManager(supabase, workspaceId, userId) { const { data } = await supabase.from('workspace_members').select('role,status').eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle(); return Boolean(data && data.status === 'active' && ['owner', 'admin'].includes(data.role)); }
function invitationHtml({ businessName, roleLabel, profileLabel, inviteLink, existing }) { const title = existing ? `Ya tienes acceso a ${businessName}` : `${businessName} te invitó a CEO Rentable`; const cta = existing ? 'Entrar a CEO Rentable' : 'Activar mi acceso'; return `<!doctype html><html><body style="margin:0;background:#f7f3ee;font-family:Arial,sans-serif;color:#1f2937"><div style="max-width:600px;margin:0 auto;padding:32px 18px"><div style="background:#fff;border-radius:20px;padding:30px;box-shadow:0 12px 35px rgba(0,0,0,.07)"><h1 style="margin:0 0 12px;font-size:24px">${title}</h1><p style="line-height:1.6;color:#4b5563">Has sido agregada al equipo de <strong>${businessName}</strong> en CEO Rentable OS™.</p><p style="line-height:1.6;color:#4b5563"><strong>Acceso:</strong> ${roleLabel}<br><strong>Perfil:</strong> ${profileLabel}</p><a href="${inviteLink}" style="display:inline-block;margin-top:12px;background:#D45387;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700">${cta}</a><p style="margin-top:24px;font-size:12px;color:#8a7f85">CEO Rentable OS™ · Tu sistema financiero inteligente<br>Preguntas: hola@ceorentable.com</p></div></div></body></html>`; }

export async function handleWorkspaceInvitationList(payload = {}, { env = process.env, headers = {} } = {}) {
  const auth = await authenticate(headers, env); if (!auth.ok) return { status: auth.status, body: { success: false, error: auth.error } };
  const supabase = getServiceClient(env); if (!supabase) return { status: 500, body: { success: false, error: 'Configuración segura de servidor incompleta.' } };
  const workspaceId = `${payload.workspaceId || ''}`.trim(); if (!workspaceId) return { status: 400, body: { success: false, error: 'Falta el negocio activo.' } };
  if (!(await authorizeWorkspaceManager(supabase, workspaceId, auth.user.id))) return { status: 403, body: { success: false, error: 'No tienes permisos para administrar este equipo.' } };
  const { data, error } = await supabase.from('user_invitations').select('id,email,workspace_role,job_profile,module_permissions,status,last_sent_at,expires_at,created_at').eq('workspace_id', workspaceId).in('status', ['pending','processing']).order('created_at', { ascending: false });
  if (error) return { status: 500, body: { success: false, error: 'No se pudieron cargar las invitaciones pendientes.' } };
  return { status: 200, body: { success: true, invitations: data || [] } };
}

export async function handleWorkspaceInvitation(payload = {}, { env = process.env, headers = {} } = {}) {
  const auth = await authenticate(headers, env); if (!auth.ok) return { status: auth.status, body: { success: false, error: auth.error } };
  const supabase = getServiceClient(env); if (!supabase) return { status: 500, body: { success: false, error: 'Configuración segura de servidor incompleta.' } };
  const workspaceId = `${payload.workspaceId || ''}`.trim(); const email = normalizeEmail(payload.email); const role = ALLOWED_ROLES.has(payload.role) ? payload.role : 'member'; const jobProfile = ALLOWED_PROFILES.has(payload.jobProfile) ? payload.jobProfile : 'personalizado'; const modulePermissions = safePermissions(payload.modulePermissions);
  if (!workspaceId || !email) return { status: 400, body: { success: false, error: 'Faltan el negocio o el correo del usuario.' } };
  if (!(await authorizeWorkspaceManager(supabase, workspaceId, auth.user.id))) return { status: 403, body: { success: false, error: 'No tienes permisos para administrar este equipo.' } };
  const { data: workspace } = await supabase.from('workspaces').select('id,name,team_enabled,seat_limit').eq('id', workspaceId).maybeSingle(); if (!workspace) return { status: 404, body: { success: false, error: 'No encontramos el negocio activo.' } };
  if (workspace.team_enabled !== true) return { status: 403, body: { success: false, code: 'BUSINESS_REQUIRED', error: 'Los usuarios de equipo estarán disponibles en CEO Rentable Business.' } };
  const seatLimit = Math.max(1, Number(workspace.seat_limit || 1));
  const [{ count: activeSeats, error: activeSeatsError }, { count: pendingSeats, error: pendingSeatsError }] = await Promise.all([
    supabase.from('workspace_members').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('status', 'active'),
    supabase.from('user_invitations').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId).in('status', ['pending','processing']),
  ]);
  if (activeSeatsError || pendingSeatsError) return { status: 500, body: { success: false, error: 'No se pudo comprobar el límite de usuarios.' } };
  if ((activeSeats || 0) + (pendingSeats || 0) >= seatLimit) return { status: 409, body: { success: false, code: 'SEAT_LIMIT_REACHED', error: 'Has alcanzado el límite de usuarios contratado para este negocio.' } };
  const { data: profile, error: profileError } = await supabase.from('users').select('id,email,full_name').ilike('email', email).maybeSingle(); if (profileError) return { status: 500, body: { success: false, error: 'No se pudo comprobar el usuario.' } };
  let existingUserId = profile?.id || null;
  if (!existingUserId) {
    try {
      const authUser = await findAuthUserByEmail(supabase, email);
      if (authUser?.id) {
        existingUserId = authUser.id;
        const { error: profileRepairError } = await supabase.from('users').upsert({
          id: authUser.id,
          email,
          full_name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
        if (profileRepairError) return { status: 500, body: { success: false, error: 'La cuenta existe, pero no pudimos reparar su perfil.' } };
      }
    } catch (authLookupError) {
      console.error('No se pudo comprobar Auth para la invitación:', authLookupError);
      return { status: 500, body: { success: false, error: 'No se pudo comprobar la cuenta de acceso.' } };
    }
  }
  const baseUrl = resolveBaseUrl(headers, env); const roleLabels = { admin: 'Administrador', member: 'Miembro', viewer: 'Solo lectura' }; const profileLabels = { ventas: 'Ventas', cobros: 'Cobros / Facturación', operaciones: 'Operaciones', finanzas: 'Finanzas', asistente: 'Asistente', personalizado: 'Personalizado' };
  if (existingUserId) {
    const { error: membershipError } = await supabase.from('workspace_members').upsert({ workspace_id: workspaceId, user_id: existingUserId, role, status: 'active', module_permissions: modulePermissions }, { onConflict: 'workspace_id,user_id' });
    if (membershipError) return { status: 500, body: { success: false, error: 'No se pudo asignar el acceso al negocio.' } };
    const loginLink = `${baseUrl}/login?email=${encodeURIComponent(email)}`; const emailResult = await sendEmailWithResend({ to: email, subject: `Ya tienes acceso a ${workspace.name} en CEO Rentable`, html: invitationHtml({ businessName: workspace.name, roleLabel: roleLabels[role], profileLabel: profileLabels[jobProfile], inviteLink: loginLink, existing: true }) }, { env });
    return { status: 200, body: { success: true, mode: 'existing_user', emailSent: emailResult.ok === true, profileRepaired: !profile?.id } };
  }
  const token = randomBytes(24).toString('hex'); const inviteLink = `${baseUrl}/activar-acceso?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`; const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: existingInvite } = await supabase.from('user_invitations').select('id,sent_count').eq('email', email).eq('workspace_id', workspaceId).maybeSingle();
  const invitationPayload = { email, role: 'user', plan: 'free', has_access: true, invited_by: auth.user.id, invitation_token: token, invitation_link: inviteLink, status: 'pending', sent_count: (existingInvite?.sent_count || 0) + 1, last_sent_at: new Date().toISOString(), expires_at: expiresAt, workspace_id: workspaceId, workspace_role: role, module_permissions: modulePermissions, job_profile: jobProfile, access_source: 'workspace_invitation', is_lifetime: false, processing_at: null, accepted_at: null, accepted_user_id: null };
  const query = existingInvite ? supabase.from('user_invitations').update(invitationPayload).eq('id', existingInvite.id) : supabase.from('user_invitations').insert(invitationPayload); const { data: invitation, error: invitationError } = await query.select('id').single(); if (invitationError) return { status: 500, body: { success: false, error: 'No se pudo crear la invitación.' } };
  const emailResult = await sendEmailWithResend({ to: email, subject: `${workspace.name} te invitó a CEO Rentable`, html: invitationHtml({ businessName: workspace.name, roleLabel: roleLabels[role], profileLabel: profileLabels[jobProfile], inviteLink, existing: false }) }, { env });
  if (!emailResult.ok) return { status: 502, body: { success: false, code: emailResult.body?.code || 'EMAIL_SEND_FAILED', error: 'La invitación se creó, pero el correo no pudo enviarse.', invitationId: invitation.id } };
  return { status: 200, body: { success: true, mode: 'invited', invitationId: invitation.id, emailSent: true } };
}
