const PROD_APP_URL = 'https://app.ceorentable.com';

function normalizeUrl(url) {
  const raw = `${url || ''}`.trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return `${parsed.origin}`.replace(/\/$/, '');
  } catch (_) {
    return '';
  }
}

function isLocalHost(url) {
  if (!url) return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
  } catch (_) {
    return true;
  }
}

export function getInvitationBaseUrl() {
  const configured = normalizeUrl(
    import.meta.env.VITE_PUBLIC_APP_URL || import.meta.env.VITE_APP_URL
  );
  if (!configured || isLocalHost(configured)) return PROD_APP_URL;
  return configured;
}

export function buildInvitationLink(token, email) {
  const base = getInvitationBaseUrl();
  return `${base}/activar-acceso?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
}

function parseInvitationLink(rawLink = '') {
  const value = `${rawLink || ''}`.trim();
  if (!value) return {};

  try {
    const parsed = new URL(value);
    return {
      parsed,
      token: parsed.searchParams.get('invite') || '',
      email: parsed.searchParams.get('email') || '',
    };
  } catch (_) {
    return {};
  }
}

export function ensureInvitationLink(rawLink = '', fallbackToken = '', fallbackEmail = '') {
  const base = getInvitationBaseUrl();
  const { parsed, token, email } = parseInvitationLink(rawLink);

  const finalToken = `${fallbackToken || token || ''}`.trim();
  const finalEmail = `${fallbackEmail || email || ''}`.trim();

  if (!parsed || isLocalHost(parsed.origin)) {
    if (finalToken && finalEmail) {
      return buildInvitationLink(finalToken, finalEmail);
    }
    return `${base}/activar-acceso`;
  }

  if (finalToken && finalEmail) {
    return buildInvitationLink(finalToken, finalEmail);
  }

  return rawLink || `${base}/activar-acceso`;
}

function escapeHtml(value) {
  return `${value || ''}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildInvitationEmailHtml({ fullName, inviteLink, role = 'user' }) {
  const safeName = escapeHtml(fullName || 'Emprendedora');
  const safeLink = escapeHtml(ensureInvitationLink(inviteLink));
  const safeRole = role === 'admin' ? 'Administradora' : 'Usuario';
  const logoUrl = `${getInvitationBaseUrl()}/brand/isotipo.png`;

  return `
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Invitación a CEO Rentable OS™</title>
      </head>
      <body style="margin:0;padding:0;background:#F7F3EE;font-family:Inter,Segoe UI,Arial,sans-serif;color:#221F22;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F7F3EE;padding:24px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:620px;">
                <tr>
                  <td align="center" style="padding:0 0 14px 0;">
                    <img src="${logoUrl}" alt="CEO Rentable OS™" width="58" height="58" style="display:block;border:0;outline:none;text-decoration:none;margin:0 auto 8px;" />
                    <div style="font-size:15px;line-height:1.2;font-weight:700;letter-spacing:0.03em;color:#D45387;">CEO RENTABLE OS™</div>
                    <div style="font-size:11px;line-height:1.4;color:#8A7F85;letter-spacing:0.04em;">PLATAFORMA FINANCIERA</div>
                  </td>
                </tr>

                <tr>
                  <td style="background:#FFFFFF;border:1px solid #F0E4EA;border-radius:16px;padding:30px 24px 24px;">
                    <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;color:#A08998;text-transform:uppercase;margin-bottom:10px;">
                      Invitación de acceso
                    </div>
                    <h1 style="margin:0 0 14px 0;font-size:28px;line-height:1.2;color:#221F22;font-weight:800;">
                      Tu acceso a CEO Rentable OS™ está listo
                    </h1>
                    <p style="margin:0 0 14px 0;font-size:16px;line-height:1.6;color:#4A4448;">
                      Hola <strong style="font-size:18px;">${safeName}</strong>, recibiste una invitación para entrar a la plataforma financiera de CEO Rentable OS™.
                    </p>
                    <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#655E63;">
                      Perfil asignado: <strong>${safeRole}</strong>. Activa tu acceso con el botón y empieza a gestionar tu negocio con una visión financiera clara.
                    </p>

                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px 0;">
                      <tr>
                        <td align="center">
                          <a href="${safeLink}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#D45387;color:#FFFFFF;text-decoration:none;font-size:16px;font-weight:700;line-height:1;padding:16px 28px;border-radius:12px;">
                            Activar mi acceso
                          </a>
                        </td>
                      </tr>
                    </table>

                    <p style="margin:0 0 8px 0;font-size:12px;line-height:1.6;color:#7F757B;">
                      Si el botón no funciona, copia y pega este enlace en tu navegador:
                    </p>
                    <p style="margin:0;padding:12px;border-radius:10px;background:#FAF6F9;border:1px solid #F2E6EE;word-break:break-all;font-size:12px;line-height:1.5;color:#8B7D86;">
                      ${safeLink}
                    </p>
                  </td>
                </tr>

                <tr>
                  <td align="center" style="padding:16px 10px 0 10px;">
                    <p style="margin:0;font-size:12px;line-height:1.6;color:#8A7F85;">
                      CEO Rentable OS™ · Tu sistema financiero inteligente<br />
                      Preguntas: <a href="mailto:hola@ceorentable.com" style="color:#D45387;text-decoration:none;">hola@ceorentable.com</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}
