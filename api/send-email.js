import { handleSendEmailPayload } from '../server/sendEmailHandler.js';
import { randomUUID } from 'node:crypto';

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

function resolveRequestId(headers = {}) {
  const existing =
    headers['x-request-id'] ||
    headers['X-Request-Id'] ||
    headers['x-correlation-id'] ||
    headers['X-Correlation-Id'];
  const normalized = `${existing || ''}`.trim();
  return normalized || randomUUID();
}

export default async function handler(req, res) {
  const requestId = resolveRequestId(req.headers || {});
  res.setHeader('x-request-id', requestId);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Método no permitido' });
    return;
  }

  const payload = parseRequestBody(req.body);
  const result = await handleSendEmailPayload(payload, {
    env: process.env,
    headers: req.headers || {},
    requestId,
  });

  res.status(result.status).json(result.body);
}
