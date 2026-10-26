import { getMarketingConsent } from "./marketingConsent.js";
const KEY = "ceo_journey_attribution_v1";
export const CAPTURE_KEY = "ceo_diagnostic_capture_id";
const UTM = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
];
export function captureAttribution() {
  if (typeof window === "undefined") return {};
  let saved = {};
  try {
    const parsed = JSON.parse(sessionStorage.getItem(KEY) || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      for (const key of [...UTM, "fbclid", "fbp", "fbc"])
        if (typeof parsed[key] === "string")
          saved[key] = parsed[key].slice(0, 300);
  } catch {
    /* optional */
  }
  const params = new URLSearchParams(window.location.search),
    fresh = {};
  const reference = params.get("diagnostic_id");
  if (reference && /^[0-9a-f-]{36}$/i.test(reference)) {
    try {
      sessionStorage.setItem(CAPTURE_KEY, reference);
    } catch {
      /* optional */
    }
  }
  for (const key of UTM) {
    const value = params.get(key);
    if (value) fresh[key] = value.slice(0, 200);
  }
  const allowed = getMarketingConsent() === "granted";
  if (allowed) {
    const click = params.get("fbclid");
    if (click) fresh.fbclid = click.slice(0, 300);
    for (const key of ["_fbp", "_fbc"]) {
      const match = document.cookie
        .split("; ")
        .find((c) => c.startsWith(key + "="));
      if (match)
        fresh[key.slice(1)] = match.slice(key.length + 1).slice(0, 300);
    }
  }
  const value = { ...saved, ...fresh, advertising_consent: allowed };
  if (!allowed) for (const key of ["fbclid", "fbp", "fbc"]) delete value[key];
  try {
    sessionStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* optional */
  }
  return value;
}
export function journeyLink(path) {
  const url = new URL(path, window.location.origin);
  const a = captureAttribution();
  try{const id=sessionStorage.getItem(CAPTURE_KEY);if(id&&/^[0-9a-f-]{36}$/i.test(id))url.searchParams.set("diagnostic_id",id);}catch{/* optional */}
  for (const key of UTM) if (a[key]) url.searchParams.set(key, a[key]);
  return url.origin === window.location.origin
    ? url.pathname + url.search
    : url.href;
}
