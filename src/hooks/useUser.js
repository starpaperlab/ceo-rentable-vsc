import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

function isMissingTableError(error, table) {
  const message = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase();
  return (
    error?.code === 'PGRST205' ||
    message.includes(`public.${table}`) ||
    message.includes(`table '${table}'`)
  );
}

function adminTableError(error) {
  const message = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase();

  if (isMissingTableError(error, 'user_invitations')) {
    return new Error(
      'Falta configurar Admin Panel en Supabase. Ejecuta el SQL: supabase/sql/ADMIN_PANEL_PRODUCTION_SETUP.sql'
    );
  }

  if (
    error?.code === '42501' ||
    message.includes('permission denied') ||
    message.includes('row-level security') ||
    message.includes('forbidden')
  ) {
    return new Error(
      'Tu cuenta no tiene permisos admin en Supabase RLS. Ejecuta SQL para asignar role=admin a ceorentable@gmail.com y vuelve a iniciar sesión.'
    );
  }

  return error;
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

async function safeInsertAuditLog(payload) {
  try {
    await supabase.from('audit_logs').insert(payload);
  } catch (error) {
    if (!isMissingTableError(error, 'audit_logs')) {
      console.warn('No se pudo guardar auditoría:', error.message);
    }
  }
}

async function inviteOrActivateUser({ email, full_name }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error('Debes indicar un email válido.');
  }

  const { role: safeRole, plan } = getRolePlan();
  const { data: authData } = await supabase.auth.getUser();
  const adminId = authData?.user?.id || null;

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
      adminId,
      normalizedEmail,
      'Tu acceso fue activado en CEO Rentable OS™',
      `
        <p>Hola ${updated.full_name || normalizedEmail},</p>
        <p>Tu acceso ya está activo. Puedes iniciar sesión y entrar a tu panel.</p>
      `
    );
    if (accessEmailResult?.success === false && !isResendNotConfiguredResult(accessEmailResult)) {
      throw new Error(`El acceso se activó, pero no se pudo enviar el correo: ${accessEmailResult.error || 'Error desconocido'}`);
    }

    await safeInsertAuditLog({
      admin_id: adminId,
      action: 'admin_access_activated_existing_user',
      target_user_id: updated.id,
      details: {
        email: normalizedEmail,
        role: safeRole,
        plan,
      },
    });

    return {
      mode: 'existing_user',
      user: updated,
      emailSent: accessEmailResult?.success !== false,
      emailWarning: isResendNotConfiguredResult(accessEmailResult)
        ? 'Acceso activado, pero el correo no se envió porque Resend no está configurado.'
        : null,
    };
  }

  const { data: existingInvitation, error: invitationLookupError } = await supabase
    .from('user_invitations')
    .select('id, sent_count')
    .eq('email', normalizedEmail)
    .maybeSingle();
  if (invitationLookupError && !isMissingTableError(invitationLookupError, 'user_invitations')) {
    throw invitationLookupError;
  }
  if (invitationLookupError && isMissingTableError(invitationLookupError, 'user_invitations')) {
    throw adminTableError(invitationLookupError);
  }

  const invitationToken = crypto.randomUUID().replace(/-/g, '');
  const invitationLink = ensureInvitationLink(
    buildInvitationLink(invitationToken, normalizedEmail),
    invitationToken,
    normalizedEmail
  );

  const invitationPayload = {
    email: normalizedEmail,
    full_name: full_name || null,
    role: safeRole,
    plan,
    has_access: true,
    invited_by: adminId,
    invitation_token: invitationToken,
    invitation_link: invitationLink,
    status: 'pending',
    sent_count: (existingInvitation?.sent_count || 0) + 1,
    last_sent_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };

  const invitationQuery = existingInvitation
    ? supabase.from('user_invitations').update(invitationPayload).eq('id', existingInvitation.id)
    : supabase.from('user_invitations').insert(invitationPayload);

  const { data: invitation, error: invitationError } = await invitationQuery.select('*').single();

  if (invitationError) {
    throw adminTableError(invitationError);
  }

  const html = buildInvitationEmailHtml({
    fullName: full_name,
    inviteLink: invitationLink,
    role: safeRole,
  });

  const invitationEmailResult = await sendCustomEmail(
    adminId,
    normalizedEmail,
    'Invitación a CEO Rentable OS™',
    html
  );
  if (invitationEmailResult?.success === false && !isResendNotConfiguredResult(invitationEmailResult)) {
    throw new Error(`La invitación se guardó, pero no se pudo enviar el correo: ${invitationEmailResult.error || 'Error desconocido'}`);
  }

  await safeInsertAuditLog({
    admin_id: adminId,
    action: 'admin_user_invited',
    target_user_id: null,
    details: {
      email: normalizedEmail,
      role: safeRole,
      plan,
      invitation_id: invitation.id,
    },
  });

  return {
    mode: 'invited',
    invitation,
    invitationLink,
    emailSent: invitationEmailResult?.success !== false,
    emailWarning: isResendNotConfiguredResult(invitationEmailResult)
      ? 'La invitación se guardó, pero el correo no se envió porque Resend no está configurado.'
      : null,
  };
}

export function useUser(userId) {
  return useQuery({
    queryKey: ['user', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
}

export function useAllUsers(filters = {}) {
  return useQuery({
    queryKey: ['users', filters],
    queryFn: async () => {
      let query = supabase.from('users').select('*').order('created_at', { ascending: false });

      if (filters.role) query = query.eq('role', filters.role);
      if (filters.plan) query = query.eq('plan', filters.plan);
      if (filters.hasAccess !== undefined) query = query.eq('has_access', filters.hasAccess);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });
}

export function useAdminDirectory() {
  return useQuery({
    queryKey: ['admin-directory'],
    queryFn: async () => {
      let { data: users, error: usersError } = await supabase
        .from('users')
        .select('id,email,full_name,role,plan,has_access,access_source,is_lifetime,created_at,last_login_at')
        .order('created_at', { ascending: false });
      if (usersError && isMissingUsersSegmentationColumn(usersError)) {
        ({ data: users, error: usersError } = await supabase
          .from('users')
          .select('id,email,full_name,role,plan,has_access,created_at,last_login_at')
          .order('created_at', { ascending: false }));
      }
      if (usersError) throw usersError;

      const { data: invitations, error: invitationsError } = await supabase
        .from('user_invitations')
        .select('*')
        .order('updated_at', { ascending: false });

      let safeInvitations = [];
      let setupRequired = false;
      if (invitationsError) {
        if (isMissingTableError(invitationsError, 'user_invitations')) {
          setupRequired = true;
        } else {
          throw invitationsError;
        }
      } else {
        safeInvitations = invitations || [];
      }

      const usersByEmail = new Map((users || []).map((user) => [normalizeEmail(user.email), user]));
      const rows = [];

      for (const user of users || []) {
        const emailKey = normalizeEmail(user.email);
        const invitation = safeInvitations.find((inv) => normalizeEmail(inv.email) === emailKey) || null;

        rows.push({
          key: user.id,
          source: 'user',
          user_id: user.id,
          invitation_id: invitation?.id || null,
          email: user.email,
          full_name: user.full_name || user.email,
          role: user.role || 'user',
          plan: user.plan || 'free',
          has_access: user.has_access === true,
          access_source: user.access_source || 'legacy',
          is_lifetime: user.is_lifetime === true,
          access_status: user.has_access ? 'active' : 'no_access',
          invitation_status: invitation?.status || null,
          created_at: user.created_at,
          last_login_at: user.last_login_at,
          invitation_last_sent_at: invitation?.last_sent_at || null,
          invitation_sent_count: invitation?.sent_count || 0,
        });
      }

      for (const invitation of safeInvitations) {
        const emailKey = normalizeEmail(invitation.email);
        if (usersByEmail.has(emailKey)) continue;

        rows.push({
          key: `inv-${invitation.id}`,
          source: 'invitation',
          user_id: null,
          invitation_id: invitation.id,
          email: invitation.email,
          full_name: invitation.full_name || invitation.email,
          role: invitation.role || 'user',
          plan: invitation.plan || 'free',
          has_access: invitation.has_access === true,
          access_source: 'manual_invitation_pending',
          is_lifetime: true,
          access_status: invitation.status === 'pending' ? 'pending' : 'invited',
          invitation_status: invitation.status || 'pending',
          created_at: invitation.created_at,
          last_login_at: null,
          invitation_last_sent_at: invitation.last_sent_at || null,
          invitation_sent_count: invitation.sent_count || 0,
        });
      }

      rows.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

      return {
        users: users || [],
        invitations: safeInvitations,
        rows,
        setupRequired,
      };
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, updates }) => {
      const safeUpdates = { ...updates };

      if (safeUpdates.access_source === 'manual_lifetime') {
        safeUpdates.role = 'user';
        safeUpdates.plan = safeUpdates.plan && safeUpdates.plan !== 'admin' ? safeUpdates.plan : 'founder';
        safeUpdates.has_access = true;
        safeUpdates.is_lifetime = true;
      }

      const { error } = await supabase.from('users').update(safeUpdates).eq('id', userId);
      if (error) throw error;
      return true;
    },
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ['user', userId] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-directory'] });
    },
  });
}

export function useInviteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: inviteOrActivateUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-directory'] });
    },
  });
}

export function useResendInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invitationId) => {
      const { data: authData } = await supabase.auth.getUser();
      const adminId = authData?.user?.id || null;

      const { data: invitation, error } = await supabase
        .from('user_invitations')
        .select('*')
        .eq('id', invitationId)
        .single();
      if (error) throw adminTableError(error);

      const invitationLink = ensureInvitationLink(
        invitation.invitation_link,
        invitation.invitation_token,
        invitation.email
      );
      const html = buildInvitationEmailHtml({
        fullName: invitation.full_name,
        inviteLink: invitationLink,
        role: invitation.role,
      });

      const resendResult = await sendCustomEmail(
        adminId,
        invitation.email,
        'Recordatorio de invitación — CEO Rentable OS™',
        html
      );
      if (resendResult?.success === false && !isResendNotConfiguredResult(resendResult)) {
        throw new Error(`No se pudo reenviar el correo: ${resendResult.error || 'Error desconocido'}`);
      }

      const { error: updateError } = await supabase
        .from('user_invitations')
        .update({
          invitation_link: invitationLink,
          status: 'pending',
          sent_count: (invitation.sent_count || 0) + 1,
          last_sent_at: new Date().toISOString(),
        })
        .eq('id', invitationId);
      if (updateError) throw updateError;

      await safeInsertAuditLog({
        admin_id: adminId,
        action: 'admin_invitation_resent',
        target_user_id: null,
        details: {
          invitation_id: invitationId,
          email: invitation.email,
        },
      });

      return {
        success: true,
        emailSent: resendResult?.success !== false,
        invitationLink,
        emailWarning: isResendNotConfiguredResult(resendResult)
          ? 'La invitación se actualizó, pero el correo no se envió porque Resend no está configurado.'
          : null,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-directory'] });
    },
  });
}

export function useCancelInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invitationId) => {
      const { data: authData } = await supabase.auth.getUser();
      const adminId = authData?.user?.id || null;

      const { error } = await supabase
        .from('user_invitations')
        .update({
          status: 'revoked',
          updated_at: new Date().toISOString(),
        })
        .eq('id', invitationId);
      if (error) throw adminTableError(error);

      await safeInsertAuditLog({
        admin_id: adminId,
        action: 'admin_invitation_revoked',
        target_user_id: null,
        details: {
          invitation_id: invitationId,
        },
      });

      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-directory'] });
    },
  });
}

export function useCreateUser() {
  return useInviteUser();
}

export function useCreateUserManually() {
  return useInviteUser();
}
