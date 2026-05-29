import { handleCreateStripeCheckoutSessionPayload } from '../../server/createStripeCheckoutSessionHandler.js';

function parseRequestBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch (_) {
      return {};
    }
  }
  return body;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Método no permitido' });
    return;
  }

  if (process.env.STRIPE_LEGACY_ENABLED !== 'true') {
    res.status(410).json({
      success: false,
      code: 'STRIPE_LEGACY_DISABLED',
      error: 'Stripe está desactivado como pasarela activa. Usa el flujo PayPal.',
    });
    return;
  }

  const payload = parseRequestBody(req.body);
  const result = await handleCreateStripeCheckoutSessionPayload(payload, {
    env: process.env,
    headers: req.headers || {},
  });

  res.status(result.status || 500).json(result.body || { success: false, error: 'Error interno' });
}
