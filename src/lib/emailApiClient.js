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

export async function sendEmailThroughBackend({ to, subject, html, text, replyTo, scope = 'user' }) {
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
      to,
      subject,
      html,
      text,
      replyTo,
      scope,
      accessToken,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    return {
      success: false,
      code: payload?.code || 'SEND_EMAIL_FAILED',
      error: payload?.error || 'No se pudo enviar el correo.',
    };
  }

  return {
    success: true,
    messageId: payload?.messageId || null,
  };
}
