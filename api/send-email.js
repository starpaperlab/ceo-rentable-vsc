import { handleSendEmailPayload } from '../server/sendEmailHandler.js';

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

  const payload = parseRequestBody(req.body);
  const result = await handleSendEmailPayload(payload, { env: process.env });

  res.status(result.status).json(result.body);
}
