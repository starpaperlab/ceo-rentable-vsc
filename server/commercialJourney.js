import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { diagnosticResult } from "../src/lib/diagnosticModel.js";
export const attributionSchema = z
  .object({
    utm_source: z.string().max(200).optional(),
    utm_medium: z.string().max(200).optional(),
    utm_campaign: z.string().max(200).optional(),
    utm_content: z.string().max(200).optional(),
    utm_term: z.string().max(200).optional(),
    advertising_consent: z.boolean(),
    fbclid: z.string().max(300).optional(),
    fbp: z.string().max(300).optional(),
    fbc: z.string().max(300).optional(),
  })
  .strict()
  .transform((v) => {
    if (!v.advertising_consent) {
      delete v.fbclid;
      delete v.fbp;
      delete v.fbc;
    }
    return v;
  });
const answers = z
  .object({
    business_type: z.enum(["productos", "servicios", "ambos"]),
    monthly_sales: z.enum(["under_30k", "30k_120k", "120k_300k", "over_300k"]),
    client_volume: z.enum(["under_10", "10_50", "51_200", "over_200"]),
    knows_margin: z.boolean(),
    controls_costs: z.boolean(),
    knows_best_product: z.boolean(),
    management_method: z.enum(["cuaderno", "excel", "sistema", "sin_control"]),
    main_problem: z.enum([
      "ventas",
      "rentabilidad",
      "cobros",
      "inventario",
      "flujo_caja",
    ]),
  })
  .strict();
export const diagnosticCaptureSchema = z
  .object({
    capture_id: z.string().uuid(),
    name: z.string().trim().min(1).max(160),
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    answers,
    attribution: attributionSchema,
    email_requested: z.literal(true),
    promotional_consent: z.boolean(),
    is_test: z.boolean().default(false),
    website: z.string().max(200).optional(),
  })
  .strict();
export function serviceClient(env = process.env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL,
    key = env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;
}
export async function captureDiagnostic(
  body,
  { client = serviceClient(), env = process.env, ip = "unknown" } = {},
) {
  const parsed = diagnosticCaptureSchema.safeParse(body);
  if (!parsed.success)
    return {
      status: 400,
      body: {
        error: "Revisa los datos y solicita el envío del diagnóstico.",
        code: "INVALID_DIAGNOSTIC",
      },
    };
  if (parsed.data.website)
    return {
      status: 400,
      body: { error: "Solicitud no válida.", code: "INVALID_DIAGNOSTIC" },
    };
  if (!client || env.COMMERCIAL_JOURNEY_ENABLED !== "true")
    return {
      status: 503,
      body: {
        error: "Conexión comercial pendiente de configuración.",
        code: "JOURNEY_NOT_READY",
      },
    };
  const p = parsed.data;
  const result = diagnosticResult(p.answers);
  const isTest = p.is_test || env.VERCEL_ENV !== "production";
  const hash = createHmac(
    "sha256",
    env.SUPABASE_SERVICE_ROLE_KEY || "isolated-test-hash",
  )
    .update(ip)
    .digest("hex");
  const stored = await client.rpc("ceo_capture_diagnostic", {
    p_capture: p.capture_id,
    p_name: p.name,
    p_email: p.email,
    p_answers: p.answers,
    p_result: result,
    p_attribution: p.attribution,
    p_promotional: p.promotional_consent,
    p_test: isTest,
    p_rate_key: hash,
  });
  if (stored.error)
    return {
      status: stored.error.code === "P0001" ? 429 : 503,
      body: {
        error:
          stored.error.code === "P0001"
            ? "Has alcanzado el límite de solicitudes. Intenta más tarde."
            : "No pudimos guardar el diagnóstico. Intenta nuevamente.",
        code:
          stored.error.code === "P0001"
            ? "CAPTURE_LIMIT"
            : "CAPTURE_UNAVAILABLE",
      },
    };
  return {
    status: 200,
    body: {
      success: true,
      capture_id: p.capture_id,
      diagnostic: stored.data.result,
      delivery_status: stored.data.email_status,
      is_test: isTest,
    },
  };
}
export async function authorizedUser(req, client) {
  const bearer = `${req.headers?.authorization || ""}`.match(
    /^Bearer (.+)$/i,
  )?.[1];
  if (!bearer) return null;
  const r = await client.auth.getUser(bearer);
  return r.error ? null : r.data?.user;
}
export async function recordLifecycle(
  client,
  userId,
  { eventId, kind, occurredAt = new Date().toISOString(), data = {} },
) {
  return client.rpc("ceo_record_commercial_event", {
    p_user: userId,
    p_event: eventId,
    p_kind: kind,
    p_at: occurredAt,
    p_data: data,
  });
}
export async function bestEffortLifecycle(client, userId, event) {
  try {
    const r = await recordLifecycle(client, userId, event);
    if (r.error)
      console.warn(
        JSON.stringify({ event: "commercial_pending", code: "PERSIST_FAILED" }),
      );
    return r;
  } catch {
    console.warn(
      JSON.stringify({ event: "commercial_pending", code: "PERSIST_FAILED" }),
    );
    return { data: null, error: { code: "PERSIST_FAILED" } };
  }
}
