import { createHmac } from "node:crypto";
import { serviceClient } from "./commercialJourney.js";
import { sendEmailWithResend } from "./sendEmailHandler.js";
export function crmEnvelope(item, sourceKey) {
  const { event: e, lead: l } = item;
  return {
    type: "lead.created",
    event_id: e.event_id,
    external_id: l.capture_id,
    capture_source_key: sourceKey,
    contact: { name: l.name, email: l.email, phone: "", company: "" },
    source: "ceo_diagnostico",
    campaign: l.attribution?.utm_campaign || "",
    occurred_at: e.occurred_at,
    is_test: l.is_test,
    score: null,
    classification: null,
    evaluated_at: null,
    journey: {
      kind: e.kind,
      form: "ceo-diagnostico-v1",
      capture_id: l.capture_id,
      attribution: l.attribution,
      diagnostic: l.diagnostic_result,
      answers: l.diagnostic_answers,
      promotional_consent: l.promotional_consent,
      data: e.data,
    },
  };
}
function htmlEscape(s) {
  return `${s ?? ""}`.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
export function diagnosticEmail(lead) {
  const d = lead.diagnostic_result;
  const url = new URL("https://app.ceorentable.com/checkout");
  url.searchParams.set("plan", "monthly");
  url.searchParams.set("diagnostic_id", lead.capture_id);
  for (const k of [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
  ])
    if (lead.attribution?.[k]) url.searchParams.set(k, lead.attribution[k]);
  const text = `Hola ${lead.name},\n\n${d.diagnosis}\n\n${d.profitability}\n${d.cashflow}\n\n${d.recommendations.join("\n")}\n\nPuedes comenzar la prueba de 10 días revisando las condiciones y confirmando la activación en CEO Rentable: ${url}\n\nEste diagnóstico se basa en tus respuestas, no acredita ingresos ni sustituye una revisión financiera.\nPreferencias de comunicaciones: https://app.ceorentable.com/api/commercial-unsubscribe?token=${lead.unsubscribe_token}`;
  return {
    to: lead.email,
    subject: "Tu diagnóstico CEO Rentable y próximos pasos",
    text,
    html: `<div style="font-family:Arial;max-width:640px;margin:auto;line-height:1.7"><h1>Tu diagnóstico CEO Rentable</h1><p>${htmlEscape(text).replaceAll("\n", "<br>")}</p><a href="${htmlEscape(url.href)}">Revisar y comenzar mi prueba de 10 días</a></div>`,
  };
}
export async function runCommercialDeliveryBatch({
  client = serviceClient(),
  env = process.env,
  fetchImpl = fetch,
  sendEmail = sendEmailWithResend,
} = {}) {
  if (!client || env.COMMERCIAL_DELIVERY_ENABLED !== "true")
    return { status: "not_enabled", delivered: 0 };
  let delivered = 0,
    failed = 0;
  const deadline = Date.now() + 40000;
  for (const destination of ["crm", "diagnostic_email"])
    for (let i = 0; i < 3; i++) {
      if (Date.now() > deadline) break;
      const claimed = await client.rpc("ceo_claim_delivery", {
        p_destination: destination,
      });
      if (claimed.error)
        return { status: "database_pending", delivered, failed };
      if (!claimed.data) break;
      const item = claimed.data,
        j = item.job;
      let status = "failed",
        code = null,
        provider = null;
      try {
        if (destination === "crm") {
          const secret = env.AI_OS_CRM_WEBHOOK_SECRET || "",
            source = env.AI_OS_CRM_SOURCE_KEY || "ceo-rentable-diagnostico";
          if (secret.length < 32 || !/^[a-z0-9][a-z0-9_-]{2,99}$/.test(source))
            throw new Error("CRM_NOT_CONFIGURED");
          const prepared = await client.rpc("ceo_prepare_delivery", {
            p_id: j.id,
            p_token: j.lease_token,
            p_payload: crmEnvelope(item, source),
          });
          if (prepared.error || !prepared.data) throw new Error("LEASE_LOST");
          const body = JSON.stringify(prepared.data),
            timestamp = String(Math.floor(Date.now() / 1000)),
            signature =
              "sha256=" +
              createHmac("sha256", secret)
                .update(timestamp + "." + body)
                .digest("hex");
          const base = new URL(
            env.AI_OS_CRM_BASE_URL || "https://espinal-guerra-ai-os.vercel.app",
          );
          if (
            base.protocol !== "https:" ||
            base.hostname !== "espinal-guerra-ai-os.vercel.app" ||
            base.username ||
            base.password
          )
            throw new Error("CRM_NOT_CONFIGURED");
          const response = await fetchImpl(
            new URL("/api/integrations/capture/" + source, base),
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-CRM-Timestamp": timestamp,
                "X-CRM-Signature": signature,
              },
              body,
              redirect: "error",
              signal: AbortSignal.timeout(12000),
            },
          );
          if (!response.ok) throw new Error(`CRM_HTTP_${response.status}`);
          const ack = await response.json();
          if (!/^[0-9a-f-]{36}$/i.test(ack.lead_id || ""))
            throw new Error("CRM_REJECTED");
          status = "delivered";
          provider = ack.lead_id;
        } else {
          if (item.lead.is_test) {
            await client.rpc("ceo_prepare_delivery", {
              p_id: j.id,
              p_token: j.lease_token,
              p_payload: diagnosticEmail(item.lead),
            });
            status = "skipped";
            code = "TEST_EMAIL_SUPPRESSED";
          } else if (env.DIAGNOSTIC_EMAIL_ENABLED !== "true")
            throw new Error("EMAIL_NOT_ENABLED");
          else if (Date.now() - Date.parse(j.created_at) > 23 * 3600000)
            throw new Error("EMAIL_REVIEW_REQUIRED");
          else {
            const prepared = await client.rpc("ceo_prepare_delivery", {
              p_id: j.id,
              p_token: j.lease_token,
              p_payload: diagnosticEmail(item.lead),
            });
            if (prepared.error || !prepared.data) throw new Error("LEASE_LOST");
            const sent = await sendEmail(
              { ...prepared.data, idempotencyKey: "diagnostic/" + j.id },
              {
                env,
                fetchImpl: (url, init) =>
                  fetchImpl(url, {
                    ...init,
                    signal: AbortSignal.timeout(10000),
                  }),
              },
            );
            if (!sent.ok)
              throw new Error(
                sent.body?.code === "RESEND_NOT_CONFIGURED"
                  ? "RESEND_NOT_CONFIGURED"
                  : `EMAIL_HTTP_${sent.status}`,
              );
            provider =
              sent.body?.messageId ||
              sent.body?.id ||
              sent.body?.data?.id ||
              null;
            if (!provider) throw new Error("EMAIL_PROVIDER_FAILED");
            status = "delivered";
          }
        }
      } catch (e) {
        code =
          [
            "CRM_NOT_CONFIGURED",
            "CRM_REJECTED",
            "EMAIL_NOT_ENABLED",
            "EMAIL_REVIEW_REQUIRED",
            "EMAIL_PROVIDER_FAILED",
            "LEASE_LOST",
          ].includes(e?.message) ||
          /^(CRM|EMAIL)_HTTP_[45][0-9]{2}$/.test(e?.message || "") ||
          e?.message === "RESEND_NOT_CONFIGURED"
            ? e.message
            : "DELIVERY_FAILED";
        failed++;
      }
      const done = await client.rpc("ceo_finish_delivery", {
        p_id: j.id,
        p_token: j.lease_token,
        p_status: status,
        p_error: code,
        p_provider: provider,
      });
      if (done.error || done.data !== true)
        console.warn(
          JSON.stringify({ event: "commercial_delivery", code: "ACK_PENDING" }),
        );
      if (status === "delivered" && done.data === true) delivered++;
    }
  return { status: "processed", delivered, failed };
}
