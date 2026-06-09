import { ENV_CONFIG } from '@/config/env';
import { supabase } from '@/lib/supabase';

function getEndpoint() {
  return ENV_CONFIG?.resend?.endpoint || '/api/send-email';
}

function getAccessTokenFromStorage() {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem('ceo-rentable-os-auth');
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return (
      parsed?.currentSession?.access_token ||
      parsed?.session?.access_token ||
      parsed?.access_token ||
      null
    );
  } catch {
    return null;
  }
}

async function getAccessToken() {
  const { data: sessionData } = await supabase.auth.getSession();
  let token = sessionData?.session?.access_token || null;
  if (token) return token;

  const { data: refreshedData } = await supabase.auth.refreshSession();
  token = refreshedData?.session?.access_token || null;
  if (token) return token;

  return getAccessTokenFromStorage();
}

async function postEmailRequest(requestPayload = {}) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return {
      success: false,
      code: 'AUTH_REQUIRED',
      error: 'Debes iniciar sesión para enviar correos.',
    };
  }

  const response = await fetch(getEndpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: 'include',
    body: JSON.stringify({
      ...requestPayload,
      accessToken,
    }),
  });

  const responsePayload = await response.json().catch(() => ({}));
  if (!response.ok || responsePayload?.success === false) {
    return {
      success: false,
      code: responsePayload?.code || 'SEND_EMAIL_FAILED',
      error: responsePayload?.error || 'No se pudo enviar el correo.',
      details: responsePayload,
    };
  }

  return {
    success: true,
    ...responsePayload,
  };
}

export async function sendEmailThroughBackend({ to, subject, html, text, replyTo, scope = 'user' }) {
  return postEmailRequest({
    to,
    subject,
    html,
    text,
    replyTo,
    scope,
  });
}

export async function postAdminEmailAction(action, payload = {}) {
  return postEmailRequest({
    ...payload,
    action,
    scope: 'admin',
  });
}
