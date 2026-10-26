import { serviceClient } from "../server/commercialJourney.js";
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  const token = `${req.method === "POST" ? req.body?.token : req.query?.token || ""}`;
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(token))
    return res.status(400).send("Enlace no válido.");
  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res
      .status(200)
      .send(
        `<html lang="es"><title>Preferencias CEO Rentable</title><form method="post"><h1>Dejar de recibir comunicaciones promocionales</h1><p>Los mensajes necesarios de tu cuenta no cambian.</p><input type="hidden" name="token" value="${token}"><button>Confirmar baja</button></form></html>`,
      );
  }
  if (req.method !== "POST") return res.status(405).end();
  const client = serviceClient();
  if (!client) return res.status(503).send("Intenta nuevamente más tarde.");
  const r = await client.rpc("ceo_unsubscribe", { p_token: token });
  return res
    .status(r.error ? 503 : 200)
    .send(
      r.error
        ? "No se pudo guardar la preferencia."
        : "Preferencia guardada. No recibirás acompañamiento promocional.",
    );
}
