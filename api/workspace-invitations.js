import { handleWorkspaceInvitation } from '../server/workspaceInvitationHandler.js';

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch (_) { return {}; }
  }
  return body;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Método no permitido' });

  const result = await handleWorkspaceInvitation(parseBody(req.body), {
    env: process.env,
    headers: req.headers || {},
  });

  return res.status(result.status).json(result.body);
}
