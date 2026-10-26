import { captureDiagnostic } from "../server/commercialJourney.js";
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST")
    return res.status(405).json({ error: "Método no permitido" });
  if (
    Number(req.headers["content-length"] || 0) > 16000 ||
    Buffer.byteLength(JSON.stringify(req.body || {})) > 16000
  )
    return res.status(413).json({ error: "Contenido demasiado grande" });
  const result = await captureDiagnostic(req.body, {
    ip: `${req.headers["x-vercel-forwarded-for"] || req.headers["x-real-ip"] || (process.env.VERCEL ? req.headers["x-forwarded-for"] : null) || "unknown"}`.split(
      ",",
    )[0],
  });
  return res.status(result.status).json(result.body);
}
