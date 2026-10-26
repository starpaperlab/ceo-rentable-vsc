import {
  serviceClient,
  authorizedUser,
  bestEffortLifecycle,
} from "./commercialJourney.js";
export async function captureCommercialPayment(
  req,
  result,
  { client = serviceClient(), env = process.env } = {},
) {
  if (
    env.COMMERCIAL_JOURNEY_ENABLED !== "true" ||
    !client ||
    result?.success !== true ||
    result.status !== "completed" ||
    !result.captureId ||
    !(Number(result.amount) > 0)
  )
    return;
  const user = await authorizedUser(req, client);
  if (!user) return;
  await bestEffortLifecycle(client, user.id, {
    eventId: `Purchase:paypal:${result.captureId}`,
    kind: "subscription.paid",
    data: {
      provider: "paypal",
      payment_id: result.captureId,
      amount: Number(result.amount),
      currency: result.currency,
      is_test: (env.PAYPAL_ENVIRONMENT || "sandbox").toLowerCase() !== "live",
    },
  });
}

export async function captureWebhookCommercialPayment(
  payload,
  result,
  { client = serviceClient(), env = process.env } = {},
) {
  if (
    env.COMMERCIAL_JOURNEY_ENABLED !== "true" ||
    !client ||
    result?.body?.status !== "processed" ||
    payload.event_type !== "PAYMENT.CAPTURE.COMPLETED" ||
    payload.resource?.status !== "COMPLETED"
  )
    return;
  const resource = payload.resource;
  const r = await client
    .from("transactions")
    .select("user_id,amount,currency")
    .eq("payment_provider", "paypal")
    .eq("provider_capture_id", resource.id)
    .eq("status", "completed")
    .maybeSingle();
  if (
    r.error ||
    !r.data ||
    Number(r.data.amount) !== Number(resource.amount?.value) ||
    r.data.currency !== resource.amount?.currency_code
  )
    return;
  return bestEffortLifecycle(client, r.data.user_id, {
    eventId: `Purchase:paypal:${resource.id}`,
    kind: "subscription.paid",
    occurredAt: payload.create_time || new Date().toISOString(),
    data: {
      provider: "paypal",
      payment_id: resource.id,
      amount: Number(r.data.amount),
      currency: r.data.currency,
      is_test: (env.PAYPAL_ENVIRONMENT || "sandbox").toLowerCase() !== "live",
    },
  });
}
