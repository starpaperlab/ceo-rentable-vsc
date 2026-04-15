import { ENV_CONFIG } from '@/config/env';

function getEndpoint() {
  return ENV_CONFIG?.resend?.endpoint || '/api/send-email';
}

export async function sendEmailThroughBackend({ to, subject, html, text, replyTo }) {
  const response = await fetch(getEndpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to,
      subject,
      html,
      text,
      replyTo,
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
