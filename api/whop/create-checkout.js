import { createWhopCheckout } from '../../server/whopCheckout.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Método no permitido' }); }
  const result = await createWhopCheckout(req.body, { headers: req.headers });
  return res.status(result.status).json(result.body);
}
