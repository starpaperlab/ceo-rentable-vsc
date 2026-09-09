import { handleWorkspaceInvitation, handleWorkspaceInvitationList } from '../server/workspaceInvitationHandler.js';

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch (_) { return {}; }
  }
  return body;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  const payload = req.method === 'GET'
    ? { workspaceId: `${req.query?.workspaceId || ''}`.trim() }
    : parseBody(req.body);

  if (req.method === 'GET') {
    const result = await handleWorkspaceInvitationList(payload, {
      env: process.env,
      headers: req.headers || {},
    });
    return res.status(result.status).json(result.body);
  }

  if (req.method === 'POST') {
    const result = await handleWorkspaceInvitation(payload, {
      env: process.env,
      headers: req.headers || {},
    });
    return res.status(result.status).json(result.body);
  }

  return res.status(405).json({ success: false, error: 'Método no permitido' });
}
