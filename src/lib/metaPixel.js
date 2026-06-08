import { ENV_CONFIG } from '@/config/env';

const META_PIXEL_SCRIPT_ID = 'meta-pixel-script';
const INITIATE_CHECKOUT_DEDUPE_MS = 5000;

let isPixelInitialized = false;
let lastTrackedPagePath = null;
let lastInitiateCheckoutSignature = null;
let lastInitiateCheckoutAt = 0;

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function getMetaPixelId() {
  return `${ENV_CONFIG.metaPixel.id || ''}`.trim();
}

function getCurrentPath() {
  if (!isBrowser()) return '/';
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
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

function trackStandardEvent(eventName, params = {}) {
  if (!isBrowser()) return false;

  const fbq = ensureFbqStub();
  if (typeof fbq !== 'function') {
    console.warn('META fbq unavailable');
    return false;
  }

  fbq('track', eventName, params);
  return true;
}

function buildPlanPayload({ plan = null, value = null, currency = null, extra = {} } = {}) {
  const payload = {
    ...extra,
  };

  if (plan) {
    payload.content_name = plan;
    payload.content_ids = [plan];
  }

  if (value !== null && value !== undefined && value !== '') {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      payload.value = numericValue;
    }
  }

  if (currency) {
    payload.currency = `${currency}`.trim().toUpperCase();
  }

  return payload;
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
  console.log('META INIT');
  trackPageView({ force: true });
  return true;
}

export function isMetaPixelReady() {
  return isBrowser() && typeof window.fbq === 'function';
}

export function trackPageView({ path = null, force = false } = {}) {
  const pixelId = getMetaPixelId();
  if (!pixelId) return false;

  initializeMetaPixel();

  const nextPath = path || getCurrentPath();
  if (!force && nextPath === lastTrackedPagePath) {
    return false;
  }

  const tracked = trackStandardEvent('PageView');
  if (tracked) {
    lastTrackedPagePath = nextPath;
    console.log('META PAGEVIEW');
    console.log('META PAGEVIEW PATH', nextPath);
  }

  return tracked;
}

export function trackLead(params = {}) {
  if (!getMetaPixelId()) return false;

  initializeMetaPixel();
  return trackStandardEvent('Lead', params);
}

export function trackInitiateCheckout({ plan = null, value = null, currency = null } = {}) {
  if (!getMetaPixelId()) return false;

  initializeMetaPixel();

  const signature = JSON.stringify({
    plan: plan || null,
    value: value ?? null,
    currency: currency || null,
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

  return trackStandardEvent(
    'InitiateCheckout',
    buildPlanPayload({
      plan,
      value,
      currency,
      extra: {
        num_items: 1,
      },
    })
  );
}

export function trackRegistration({ plan = null } = {}) {
  if (!getMetaPixelId()) return false;

  initializeMetaPixel();
  return trackStandardEvent(
    'CompleteRegistration',
    buildPlanPayload({
      plan,
      extra: {
        status: 'completed',
      },
    })
  );
}

export function trackPurchase({ plan = null, value = null, currency = null } = {}) {
  if (!getMetaPixelId()) return false;

  initializeMetaPixel();
  return trackStandardEvent(
    'Purchase',
    buildPlanPayload({
      plan,
      value,
      currency,
      extra: {
        num_items: 1,
      },
    })
  );
}

export default {
  initializeMetaPixel,
  isMetaPixelReady,
  trackPageView,
  trackLead,
  trackInitiateCheckout,
  trackRegistration,
  trackPurchase,
};
