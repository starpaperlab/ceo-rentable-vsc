export const PENDING_CHECKOUT_PLAN_KEY = 'ceo_os_pending_checkout_plan';

export const CHECKOUT_PLANS = {
  monthly: 'monthly',
  founder_lifetime: 'founder_lifetime',
};

const CHECKOUT_PLAN_ALIASES = {
  monthly: CHECKOUT_PLANS.monthly,
  lifetime: CHECKOUT_PLANS.founder_lifetime,
  founder: CHECKOUT_PLANS.founder_lifetime,
  founder_lifetime: CHECKOUT_PLANS.founder_lifetime,
};

export function normalizeCheckoutPlan(value) {
  const plan = `${value || ''}`.trim().toLowerCase();
  return CHECKOUT_PLAN_ALIASES[plan] || null;
}

export function getCheckoutPlanSlug(plan) {
  const normalized = normalizeCheckoutPlan(plan);
  if (!normalized) return null;

  return normalized === CHECKOUT_PLANS.founder_lifetime ? 'lifetime' : normalized;
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

function buildPlanPath(basePath, plan, options = {}) {
  const normalized = normalizeCheckoutPlan(plan);
  if (!normalized) return basePath;

  const params = new URLSearchParams();
  params.set('plan', getCheckoutPlanSlug(normalized));

  if (options.checkout) {
    params.set('checkout', 'true');
  }

  if (options.mode) {
    params.set('mode', options.mode);
  }

  return `${basePath}?${params.toString()}`;
}

export function getCheckoutPath(plan, options = {}) {
  return buildPlanPath('/paywall', plan, options);
}

export function getRegisterPath(plan, options = {}) {
  return buildPlanPath('/register', plan, options);
}

export function getLoginPath(plan, options = {}) {
  const params = new URLSearchParams();
  const slug = getCheckoutPlanSlug(plan);

  if (options.mode) {
    params.set('mode', options.mode);
  }

  if (slug) {
    params.set('plan', slug);
  }

  const query = params.toString();
  return query ? `/login?${query}` : '/login';
}

export function isCheckoutRequested(value) {
  return ['1', 'true', 'yes'].includes(`${value || ''}`.trim().toLowerCase());
}
