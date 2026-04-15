const RESEND_API_URL = 'https://api.resend.com/emails';

function normalizeRecipients(to) {
  if (Array.isArray(to)) {
    return to.map((item) => `${item || ''}`.trim()).filter(Boolean);
  }
  const one = `${to || ''}`.trim();
  return one ? [one] : [];
}

function toErrorMessage(payload = {}) {
  return payload?.error?.message || payload?.message || 'No se pudo enviar el email';
}

export function validateSendEmailPayload(payload = {}) {
  const recipients = normalizeRecipients(payload.to);
  const subject = `${payload.subject || ''}`.trim();
  const html = `${payload.html || ''}`.trim();
  const text = `${payload.text || ''}`.trim();

  if (!recipients.length) {
    return { valid: false, error: 'Debes indicar al menos un destinatario.' };
  }
  if (!subject) {
    return { valid: false, error: 'El asunto es obligatorio.' };
  }
  if (!html && !text) {
    return { valid: false, error: 'El contenido del email está vacío.' };
  }

  return { valid: true, recipients, subject, html, text };
}

export async function sendEmailWithResend(payload = {}, { env = process.env, fetchImpl = fetch } = {}) {
  const apiKey = `${env.RESEND_API_KEY || ''}`.trim();
  if (!apiKey) {
    return {
      ok: false,
      status: 500,
      body: {
        success: false,
        code: 'RESEND_NOT_CONFIGURED',
        error: 'Falta RESEND_API_KEY en el entorno del servidor.',
      },
    };
  }

  const from = `${env.RESEND_FROM_EMAIL || 'hola@ceorentable.com'}`.trim();
  const replyTo = `${payload.replyTo || env.RESEND_REPLY_TO || from}`.trim();

  const check = validateSendEmailPayload(payload);
  if (!check.valid) {
    return {
      ok: false,
      status: 400,
      body: { success: false, code: 'INVALID_PAYLOAD', error: check.error },
    };
  }

  const response = await fetchImpl(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: check.recipients,
      subject: check.subject,
      html: check.html || undefined,
      text: check.text || undefined,
      reply_to: replyTo || undefined,
    }),
  });

  const payloadResend = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      status: response.status || 502,
      body: {
        success: false,
        code: 'RESEND_ERROR',
        error: toErrorMessage(payloadResend),
        provider: payloadResend,
      },
    };
  }

  return {
    ok: true,
    status: 200,
    body: {
      success: true,
      messageId: payloadResend?.id || null,
    },
  };
}

export async function handleSendEmailPayload(payload = {}, options = {}) {
  try {
    return await sendEmailWithResend(payload, options);
  } catch (error) {
    return {
      ok: false,
      status: 500,
      body: {
        success: false,
        code: 'SEND_EMAIL_INTERNAL_ERROR',
        error: error?.message || 'Error interno enviando email.',
      },
    };
  }
}
