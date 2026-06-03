export const PENDING_CHECKOUT_PLAN_KEY = 'ceo_os_pending_checkout_plan';

export const CHECKOUT_PLANS = {
  monthly: 'monthly',
  founder_lifetime: 'founder_lifetime',
};

export function normalizeCheckoutPlan(value) {
  const plan = `${value || ''}`.trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(CHECKOUT_PLANS, plan) ? plan : null;
}

export function savePendingCheckoutPlan(plan) {
  if (typeof window === 'undefined') return null;

  const normalized = normalizeCheckoutPlan(plan);
  if (!normalized) return null;

  window.localStorage.setItem(PENDING_CHECKOUT_PLAN_KEY, normalized);
  return normalized;
}

export function getPendingCheckoutPlan() {
  if (typeof window === 'undefined') return null;
  return normalizeCheckoutPlan(window.localStorage.getItem(PENDING_CHECKOUT_PLAN_KEY));
}

export function clearPendingCheckoutPlan() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(PENDING_CHECKOUT_PLAN_KEY);
}

export function getCheckoutPath(plan) {
  const normalized = normalizeCheckoutPlan(plan);
  return normalized ? `/paywall?plan=${encodeURIComponent(normalized)}` : '/paywall';
}
