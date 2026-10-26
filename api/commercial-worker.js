import { runCommercialDeliveryBatch } from "../server/commercialDelivery.js";
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET")
    return res.status(405).json({ error: "Método no permitido" });
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`)
    return res.status(401).json({ error: "No autorizado" });
  return res.status(200).json(await runCommercialDeliveryBatch());
}
