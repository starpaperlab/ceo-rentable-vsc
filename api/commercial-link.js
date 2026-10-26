import { serviceClient, authorizedUser } from "../server/commercialJourney.js";
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST")
    return res.status(405).json({ error: "Método no permitido" });
  const client = serviceClient();
  if (!client) return res.status(503).json({ error: "Conexión pendiente" });
  const user = await authorizedUser(req, client);
  if (!user?.email_confirmed_at)
    return res
      .status(401)
      .json({ error: "Confirma tu correo e inicia sesión." });
  const id = `${req.body?.capture_id || ""}`;
  if (!/^[0-9a-f-]{36}$/i.test(id))
    return res.status(400).json({ error: "Identificador inválido" });
  const r = await client.rpc("ceo_link_diagnostic_user", {
    p_capture: id,
    p_user: user.id,
    p_email: user.email.toLowerCase(),
  });
  return res
    .status(r.error ? 403 : 200)
    .json(
      r.error
        ? { error: "El diagnóstico no pertenece a tu cuenta." }
        : { success: true },
    );
}
