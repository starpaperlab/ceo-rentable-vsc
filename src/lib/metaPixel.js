const META_PIXEL_SCRIPT_ID = 'meta-pixel-script';
const META_PIXEL_DEDUPE_KEY = 'ceo_meta_pixel_fired_events';
const INITIATE_CHECKOUT_DEDUPE_MS = 5000;
const DEFAULT_META_PIXEL_ID = '339342380789724';

const PLAN_EVENT_CONFIG = {
  monthly: {
    slug: 'monthly',
    content_name: 'CEO Rentable Plan Mensual',
    content_ids: ['monthly'],
    content_type: 'product',
    currency: 'DOP',
    value: 1497,
  },
  founder_lifetime: {
    slug: 'lifetime',
    content_name: 'CEO Rentable Acceso Lifetime',
    content_ids: ['lifetime'],
    content_type: 'product',
    currency: 'DOP',
    value: 4997,
  },
  lifetime: {
    slug: 'lifetime',
    content_name: 'CEO Rentable Acceso Lifetime',
    content_ids: ['lifetime'],
    content_type: 'product',
    currency: 'DOP',
    value: 4997,
  },
};

let isPixelInitialized = false;
let lastTrackedPagePath = null;
let lastViewContentSignature = null;
let lastInitiateCheckoutSignature = null;
let lastInitiateCheckoutAt = 0;

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function isDev() {
  return import.meta.env.DEV;
}

function getMetaPixelId() {
  return `${import.meta.env.VITE_META_PIXEL_ID || DEFAULT_META_PIXEL_ID}`.trim();
}

function getCurrentPath() {
  if (!isBrowser()) return '/';
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function getCurrentUrl() {
  if (!isBrowser()) return '';
  return window.location.href;
}

function normalizePlan(plan) {
  const normalized = `${plan || ''}`.trim().toLowerCase();
  return PLAN_EVENT_CONFIG[normalized] ? normalized : null;
}

function getPlanEventConfig(plan) {
  const normalized = normalizePlan(plan);
  return normalized ? PLAN_EVENT_CONFIG[normalized] : null;
}

function logMetaEvent(eventName, payload = {}) {
  if (!isDev()) return;
  console.log('[Meta Pixel] Event fired:', eventName, payload);
}

function getStoredDedupeEvents() {
  if (!isBrowser()) return {};

  try {
    const raw = window.sessionStorage.getItem(META_PIXEL_DEDUPE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setStoredDedupeEvent(signature) {
  if (!isBrowser()) return;

  const current = getStoredDedupeEvents();
  current[signature] = Date.now();
  window.sessionStorage.setItem(META_PIXEL_DEDUPE_KEY, JSON.stringify(current));
}

function hasStoredDedupeEvent(signature) {
  return Boolean(getStoredDedupeEvents()[signature]);
}

function ensureFbqStub() {
  if (!isBrowser()) return null;

  if (typeof window.fbq === 'function') {
    return window.fbq;
  }

  const fbq = function fbqProxy(...args) {
    if (fbq.callMethod) {
      fbq.callMethod(...args);
      return;
    }

    fbq.queue.push(args);
  };

  fbq.queue = fbq.queue || [];
  fbq.loaded = true;
  fbq.version = '2.0';
  window.fbq = fbq;
  window._fbq = fbq;

  return fbq;
}

function injectMetaPixelScript() {
  if (!isBrowser()) return;
  if (document.getElementById(META_PIXEL_SCRIPT_ID)) return;

  const script = document.createElement('script');
  script.id = META_PIXEL_SCRIPT_ID;
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(script);
}

function trackStandardEvent(eventName, payload = {}) {
  if (!isBrowser()) return false;

  const fbq = ensureFbqStub();
  if (typeof fbq !== 'function') {
    return false;
  }

  fbq('track', eventName, payload);
  logMetaEvent(eventName, payload);
  return true;
}

export function buildConversionApiEvent(eventName, payload = {}, { eventId = null, userData = {} } = {}) {
  if (!eventName) {
    return null;
  }

  return {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'website',
    event_source_url: getCurrentUrl(),
    custom_data: payload,
    ...(eventId ? { event_id: eventId } : {}),
    ...(Object.keys(userData).length ? { user_data: userData } : {}),
  };
}

function buildPlanPayload(plan, extra = {}) {
  const planConfig = getPlanEventConfig(plan);
  if (!planConfig) {
    return {
      ...extra,
    };
  }

  return {
    content_name: planConfig.content_name,
    content_ids: planConfig.content_ids,
    content_type: planConfig.content_type,
    currency: planConfig.currency,
    value: planConfig.value,
    plan_selected: planConfig.slug,
    ...extra,
  };
}

export function initializeMetaPixel() {
  const pixelId = getMetaPixelId();
  if (!isBrowser() || !pixelId) {
    return false;
  }

  ensureFbqStub();
  injectMetaPixelScript();

  if (isPixelInitialized) {
    return true;
  }

  window.fbq('init', pixelId);
  isPixelInitialized = true;

  if (isDev()) {
    console.log('[Meta Pixel] Initialized:', pixelId);
  }

  trackPageView({ force: true });
  return true;
}

export function trackPageView({ path = null, force = false } = {}) {
  const pixelId = getMetaPixelId();
  if (!pixelId) return false;

  initializeMetaPixel();

  const nextPath = path || getCurrentPath();
  if (!force && nextPath === lastTrackedPagePath) {
    return false;
  }

  const tracked = trackStandardEvent('PageView', {});
  if (tracked) {
    lastTrackedPagePath = nextPath;
  }

  return tracked;
}

export function trackViewContent(plan = null, { path = null } = {}) {
  if (!getMetaPixelId()) return false;

  initializeMetaPixel();

  const normalizedPlan = normalizePlan(plan);
  const signature = `${path || getCurrentPath()}::${normalizedPlan || 'plans'}`;
  if (signature === lastViewContentSignature) {
    return false;
  }

  lastViewContentSignature = signature;

  const payload = normalizedPlan
    ? buildPlanPayload(normalizedPlan)
    : {
        content_name: 'CEO Rentable Planes',
        content_ids: ['plans'],
        content_type: 'product_group',
      };

  return trackStandardEvent('ViewContent', payload);
}

export function trackLead(payload = {}) {
  if (!getMetaPixelId()) return false;

  initializeMetaPixel();
  return trackStandardEvent('Lead', payload);
}

export function trackInitiateCheckout(plan) {
  const planConfig = getPlanEventConfig(plan);
  if (!planConfig || !getMetaPixelId()) {
    return false;
  }

  initializeMetaPixel();

  const signature = JSON.stringify({
    event: 'InitiateCheckout',
    plan: planConfig.slug,
    path: getCurrentPath(),
  });
  const now = Date.now();

  if (
    signature === lastInitiateCheckoutSignature &&
    now - lastInitiateCheckoutAt < INITIATE_CHECKOUT_DEDUPE_MS
  ) {
    return false;
  }

  lastInitiateCheckoutSignature = signature;
  lastInitiateCheckoutAt = now;

  return trackStandardEvent('InitiateCheckout', buildPlanPayload(planConfig.slug));
}

export function trackCompleteRegistration(plan = null) {
  if (!getMetaPixelId()) return false;

  initializeMetaPixel();
  return trackStandardEvent('CompleteRegistration', buildPlanPayload(plan));
}

export function trackPurchase(plan, transactionId = null) {
  const planConfig = getPlanEventConfig(plan);
  if (!planConfig || !getMetaPixelId()) {
    return false;
  }

  const signature = `Purchase::${transactionId || 'no-transaction'}::${planConfig.slug}`;
  if (transactionId && hasStoredDedupeEvent(signature)) {
    return false;
  }

  initializeMetaPixel();

  const tracked = trackStandardEvent(
    'Purchase',
    buildPlanPayload(planConfig.slug, transactionId ? { transaction_id: transactionId } : {})
  );

  if (tracked && transactionId) {
    setStoredDedupeEvent(signature);
  }

  return tracked;
}

export function trackSubscribe(plan = null, extra = {}) {
  if (!getMetaPixelId()) return false;

  initializeMetaPixel();
  return trackStandardEvent('Subscribe', buildPlanPayload(plan, extra));
}

export default {
  initializeMetaPixel,
  buildConversionApiEvent,
  trackPageView,
  trackViewContent,
  trackLead,
  trackInitiateCheckout,
  trackCompleteRegistration,
  trackPurchase,
  trackSubscribe,
};
