import { serviceClient } from "../server/commercialJourney.js";
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).end();
  const b = req.body || {};
  if (
    b.advertising_consent !== true ||
    !["page.viewed", "checkout.started"].includes(b.kind) ||
    !["/checkout", "/diagnostico", "/register", "/login"].includes(b.route) ||
    !/^[0-9a-f-]{36}$/i.test(b.capture_id || "") ||
    !/^[0-9a-f-]{36}$/i.test(b.event_id || "")
  )
    return res.status(400).json({ error: "Visita inválida" });
  const client = serviceClient();
  if (!client || process.env.COMMERCIAL_JOURNEY_ENABLED !== "true")
    return res.status(503).end();
  const r = await client.rpc("ceo_record_visit", {
    p_capture: b.capture_id,
    p_event: b.event_id,
    p_kind: b.kind,
    p_route: b.route,
  });
  return res.status(r.error ? 503 : 200).json({ accepted: !r.error });
}
