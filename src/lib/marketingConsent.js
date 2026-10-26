export const MARKETING_CONSENT_KEY = 'ceo_marketing_consent_v1';
export const MARKETING_CONSENT_EVENT = 'ceo:marketing-consent';
let currentChoice;
export function getMarketingConsent() {
  if (typeof window === 'undefined') return null;
  try {
    const saved = JSON.parse(window.localStorage.getItem(MARKETING_CONSENT_KEY) || 'null');
    return saved?.version === 1 && ['granted', 'denied'].includes(saved.choice) ? saved.choice : null;
  } catch { /* Storage is optional; no consent means no advertising. */ }
  return currentChoice ?? null;
}
export function setMarketingConsent(choice) {
  if (typeof window === 'undefined' || !['granted', 'denied'].includes(choice)) return;
  currentChoice = choice;
  try { window.localStorage.setItem(MARKETING_CONSENT_KEY, JSON.stringify({version:1,choice,updatedAt:new Date().toISOString()})); } catch { /* In-memory choice still applies to this page. */ }
  window.dispatchEvent(new Event(MARKETING_CONSENT_EVENT));
}
