import { whopStatus } from '../../server/whopStatus.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Método no permitido' }); }
  const result = await whopStatus({ headers: req.headers });
  return res.status(result.status).json(result.body);
}
