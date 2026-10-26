import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { supabase } from "@/lib/supabase";
import { CAPTURE_KEY, captureAttribution } from "@/lib/journeyAttribution";
import {
  getMarketingConsent,
  MARKETING_CONSENT_EVENT,
} from "@/lib/marketingConsent";
let lastVisit = null;
export default function CommercialJourneyBridge() {
  const { user } = useAuth();
  const location = useLocation();
  useEffect(() => {
    const run = async () => {
      captureAttribution();
      if (import.meta.env.VITE_COMMERCIAL_JOURNEY_ENABLED !== "true") return;
      try {
        const capture = sessionStorage.getItem(CAPTURE_KEY);
        if (!capture) return;
        const key = capture + location.pathname + location.search;
        if (
          getMarketingConsent() === "granted" &&
          lastVisit !== key &&
          ["/checkout", "/diagnostico", "/register", "/login"].includes(
            location.pathname,
          )
        ) {
          lastVisit = key;
          for (const kind of [
            "page.viewed",
            ...(location.pathname === "/checkout" ? ["checkout.started"] : []),
          ])
            void fetch("/api/commercial-visit", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                capture_id: capture,
                event_id: crypto.randomUUID(),
                kind,
                route: location.pathname,
                advertising_consent: true,
              }),
            }).catch(() => {});
        }
        if (!user) return;
        const { data } = await supabase.auth.getSession();
        if (!data.session?.access_token) return;
        await fetch("/api/commercial-link", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${data.session.access_token}`,
          },
          body: JSON.stringify({ capture_id: capture }),
        });
      } catch {
        /* Registration/payments remain operational. Retried at the next session or navigation. */
      }
    };
    void run();
    window.addEventListener(MARKETING_CONSENT_EVENT, run);
    return () => window.removeEventListener(MARKETING_CONSENT_EVENT, run);
  }, [user, location.pathname, location.search]);
  return null;
}
