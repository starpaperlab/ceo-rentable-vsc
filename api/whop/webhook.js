import { handleWhopWebhook } from '../../server/whopWebhook.js';
export const config = { api: { bodyParser: false } };
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ code: 'METHOD_NOT_ALLOWED' }); }
  const chunks = []; let size = 0;
  try {
    for await (const chunk of req) {
      size += Buffer.byteLength(chunk);
      if (size > 1_048_576) return res.status(413).json({ code: 'PAYLOAD_TOO_LARGE' });
      chunks.push(Buffer.from(chunk));
    }
    const result = await handleWhopWebhook(Buffer.concat(chunks).toString('utf8'), { headers: req.headers });
    return res.status(result.status).json(result.body);
  } catch { return res.status(400).json({ code: 'INVALID_BODY' }); }
}
