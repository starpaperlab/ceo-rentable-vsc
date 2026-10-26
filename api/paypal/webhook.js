import { captureWebhookCommercialPayment } from "../../server/commercialPayPalFacts.js";
import { handlePayPalWebhookPayload } from "../../server/paypalWebhookHandler.js";
import {
  handlePayPalSubscriptionWebhookPayload,
  isPayPalSubscriptionEvent,
} from "../../server/paypalSubscriptionWebhookHandler.js";

function parseRequestBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch (_) {
      return {};
    }
  }
  return body;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ success: false, error: "Método no permitido" });
    return;
  }

  const payload = parseRequestBody(req.body);
  const eventType = `${payload?.event_type || ""}`.trim();

  const result = isPayPalSubscriptionEvent(eventType)
    ? await handlePayPalSubscriptionWebhookPayload(payload, {
        env: process.env,
        headers: req.headers || {},
      })
    : await handlePayPalWebhookPayload(payload, {
        env: process.env,
        headers: req.headers || {},
      });

  try {
    const stored = await captureWebhookCommercialPayment(payload, result);
    if (stored?.error)
      return res
        .status(503)
        .json({ success: false, code: "COMMERCIAL_RETRY_REQUIRED" });
  } catch {
    console.warn("commercial_webhook_pending");
    return res
      .status(503)
      .json({ success: false, code: "COMMERCIAL_RETRY_REQUIRED" });
  }
  res
    .status(result?.status || 500)
    .json(result?.body || { success: false, error: "Error interno" });
}
