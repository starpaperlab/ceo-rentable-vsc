import { supabase } from '@/lib/supabase';
import { sendCustomEmail } from '@/lib/emailService';
import { buildInvitationEmailHtml, buildInvitationLink, ensureInvitationLink } from '@/lib/invitationEmail';

function normalizeEmail(email = '') {
  return `${email}`.trim().toLowerCase();
}

function isResendNotConfiguredResult(result) {
  if (!result || result.success !== false) return false;
  if (result.code === 'RESEND_NOT_CONFIGURED') return true;

  const message = `${result.error || ''}`.toLowerCase();
  return (
    message.includes('resend no configurado') ||
    message.includes('vite_resend_api_key') ||
    message.includes('resend_api_key')
  );
}

function getRolePlan() {
  return { role: 'user', plan: 'founder' };
}

function isMissingUsersSegmentationColumn(error) {
  const message = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase();
  return message.includes('access_source') || message.includes('is_lifetime');
}

async function updateUserWithSegmentation(userId, patch) {
  const runUpdate = async (nextPatch) =>
    supabase
      .from('users')
      .update(nextPatch)
      .eq('id', userId)
      .select('*')
      .single();

  let { data, error } = await runUpdate(patch);

  if (error && isMissingUsersSegmentationColumn(error)) {
    const fallback = { ...patch };
    delete fallback.access_source;
    delete fallback.is_lifetime;
    ({ data, error } = await runUpdate(fallback));
  }

  if (error) throw error;
  return data;
}

async function getCurrentUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

async function auditLog(action, targetUserId = null, details = {}) {
  const adminId = await getCurrentUserId();
  try {
    await supabase.from('audit_logs').insert({
      admin_id: adminId,
      action,
      target_user_id: targetUserId,
      details,
    });
  } catch (error) {
    if (error?.code !== 'PGRST205') {
      console.warn('No se pudo registrar auditoría:', error.message);
    }
  }
}

export const userService = {
  async createUserManually({ email, full_name }) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) throw new Error('Email inválido');

    const { role: safeRole, plan } = getRolePlan();

    const { data: existingUser, error: existingError } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existingUser) {
      const updated = await updateUserWithSegmentation(existingUser.id, {
        full_name: full_name || existingUser.full_name,
        role: safeRole,
        plan,
        has_access: true,
        access_source: 'manual_lifetime',
        is_lifetime: true,
      });

      const accessEmailResult = await sendCustomEmail(
        await getCurrentUserId(),
        normalizedEmail,
        'Tu acceso fue activado',
        `<p>Hola ${updated.full_name || normalizedEmail},</p><p>Tu acceso ya fue activado en CEO Rentable OS™.</p>`
      );
      if (accessEmailResult?.success === false && !isResendNotConfiguredResult(accessEmailResult)) {
        throw new Error(`El acceso se activó, pero no se pudo enviar el correo: ${accessEmailResult.error || 'Error desconocido'}`);
      }

      await auditLog('admin_access_activated_existing_user', updated.id, { email: normalizedEmail, role: safeRole, plan });
      return {
        mode: 'existing_user',
        user: updated,
        emailSent: accessEmailResult?.success !== false,
        emailWarning: isResendNotConfiguredResult(accessEmailResult)
          ? 'Acceso activado, pero el correo no se envió porque Resend no está configurado.'
          : null,
      };
    }

    const token = crypto.randomUUID().replace(/-/g, '');
    const invitationLink = ensureInvitationLink(
      buildInvitationLink(token, normalizedEmail),
      token,
      normalizedEmail
    );

    const { data: existingInvitation } = await supabase
      .from('user_invitations')
      .select('id, sent_count')
      .eq('email', normalizedEmail)
      .maybeSingle();

    const invitationPayload = {
      email: normalizedEmail,
      full_name: full_name || null,
      role: safeRole,
      plan,
      has_access: true,
      invitation_token: token,
      invitation_link: invitationLink,
      status: 'pending',
      sent_count: (existingInvitation?.sent_count || 0) + 1,
      last_sent_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const invitationQuery = existingInvitation
      ? supabase.from('user_invitations').update(invitationPayload).eq('id', existingInvitation.id)
      : supabase.from('user_invitations').insert(invitationPayload);

    const { data: invitation, error: inviteError } = await invitationQuery.select('*').single();
    if (inviteError) throw inviteError;

    const invitationHtml = buildInvitationEmailHtml({
      fullName: full_name || normalizedEmail,
      inviteLink: invitationLink,
      role: safeRole,
    });

    const invitationEmailResult = await sendCustomEmail(
      await getCurrentUserId(),
      normalizedEmail,
      'Invitación a CEO Rentable OS™',
      invitationHtml
    );
    if (invitationEmailResult?.success === false && !isResendNotConfiguredResult(invitationEmailResult)) {
      throw new Error(`La invitación se guardó, pero no se pudo enviar el correo: ${invitationEmailResult.error || 'Error desconocido'}`);
    }

    await auditLog('admin_user_invited', null, { email: normalizedEmail, role: safeRole, plan, invitation_id: invitation.id });
    return {
      mode: 'invited',
      invitation,
      invitationLink,
      emailSent: invitationEmailResult?.success !== false,
      emailWarning: isResendNotConfiguredResult(invitationEmailResult)
        ? 'La invitación se guardó, pero el correo no se envió porque Resend no está configurado.'
        : null,
    };
  },

  async updateUserAccess(userId, hasAccess) {
    const { error } = await supabase.from('users').update({ has_access: hasAccess }).eq('id', userId);
    if (error) throw error;
    await auditLog(hasAccess ? 'user_activated' : 'user_deactivated', userId, { has_access: hasAccess });
  },

  async updateUserPlan(userId, plan) {
    const { error } = await supabase.from('users').update({ plan }).eq('id', userId);
    if (error) throw error;
    await auditLog('user_plan_changed', userId, { plan });
  },

  async updateUserRole(userId, role) {
    const patch = { role };
    if (role === 'admin') {
      patch.plan = 'admin';
    }

    const { error } = await supabase
      .from('users')
      .update(patch)
      .eq('id', userId);
    if (error) throw error;
    await auditLog('user_role_changed', userId, { role });
  },

  async updateUserFeatures(userId, features) {
    const { error } = await supabase
      .from('users')
      .update({
        luna_access: features.luna || false,
        automatizaciones_access: features.automatizaciones || false,
        nuevas_funciones_access: features.nuevas_funciones || false,
      })
      .eq('id', userId);
    if (error) throw error;
    await auditLog('user_features_updated', userId, { features });
  },

  async getAllUsers(filters = {}) {
    let query = supabase.from('users').select('*').order('created_at', { ascending: false });

    if (filters.role) query = query.eq('role', filters.role);
    if (filters.plan) query = query.eq('plan', filters.plan);
    if (filters.hasAccess !== undefined) query = query.eq('has_access', filters.hasAccess);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async getUser(userId) {
    const { data, error } = await supabase.from('users').select('*').eq('id', userId).single();
    if (error) throw error;
    return data;
  },

  async resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email));
    if (error) throw error;
  },

  async getAuditLogs(filters = {}) {
    let query = supabase
      .from('audit_logs')
      .select('*, admin:admin_id(full_name, email), target_user:target_user_id(full_name, email)')
      .order('created_at', { ascending: false });

    if (filters.adminId) query = query.eq('admin_id', filters.adminId);
    if (filters.targetUserId) query = query.eq('target_user_id', filters.targetUserId);
    if (filters.action) query = query.eq('action', filters.action);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },
};
