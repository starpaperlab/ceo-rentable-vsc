import { getCheckoutPlan } from './checkoutPlans.js';
import { getMarketingConsent } from './marketingConsent.js';
const PIXEL_ID = '339342380789724';
const SCRIPT_ID = 'meta-pixel-script';
const DEDUPE_KEY = 'ceo_meta_pixel_fired_events_v2';
let initialized = false;
let lastPage = null;
let lastCheckout = null;
let lastCheckoutAt = 0;
let lastViewContent = null;
const memoryEvents = new Set();
function browser() { return typeof window !== 'undefined' && typeof document !== 'undefined'; }
export function createMetaEventId(prefix = 'event') {
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${id}`;
}
function ensureFbq() {
  if (typeof window.fbq === 'function') return window.fbq;
  const fbq = function(...args) { if (fbq.callMethod) fbq.callMethod(...args); else fbq.queue.push(args); };
  fbq.queue = []; fbq.push = fbq; fbq.loaded = true; fbq.version = '2.0';
  window.fbq = fbq; window._fbq = fbq;
  return fbq;
}
export function initializeMetaPixel() {
  if (!browser() || getMarketingConsent() !== 'granted') return false;
  const fbq = ensureFbq();
  fbq('consent', 'grant');
  if (!initialized) {
    // Own one pixel; disable automatic event detection so conversions only reflect verified actions.
    fbq('set', 'autoConfig', false, PIXEL_ID);
    const alreadyRegistered = fbq.getState?.()?.pixels?.some(p => `${p.id}` === PIXEL_ID) || fbq.queue?.some(args => args[0] === 'init' && `${args[1]}` === PIXEL_ID);
    if (!alreadyRegistered) fbq('init', PIXEL_ID);
    initialized = true;
  }
  const existing = document.getElementById(SCRIPT_ID) || document.querySelector('script[src*="connect.facebook.net"][src*="fbevents.js"]');
  if (!existing) {
    const script = document.createElement('script');script.id = SCRIPT_ID;script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';document.head.appendChild(script);
  }
  return true;
}
export function revokeMetaPixelConsent() {
  if (!browser()) return;
  if (typeof window.fbq === 'function') window.fbq('consent', 'revoke');
  lastPage = null; lastCheckout = null; lastViewContent = null;
  // Remove Meta advertising cookies for the app and parent domain; authentication cookies are untouched.
  const domains = ['', window.location.hostname, ...(window.location.hostname.endsWith('.ceorentable.com') ? ['.ceorentable.com'] : [])];
  for (const name of ['_fbp','_fbc']) for (const domain of domains) document.cookie = `${name}=; Max-Age=0; path=/;${domain ? ` domain=${domain};` : ''} SameSite=Lax; Secure`;
}
function wasFired(id) {
  if (memoryEvents.has(id)) return true;
  try { return Boolean(JSON.parse(window.localStorage.getItem(DEDUPE_KEY) || '{}')[id]); } catch { return false; }
}
function remember(id) {
  memoryEvents.add(id);
  try {
    const all = JSON.parse(window.localStorage.getItem(DEDUPE_KEY) || '{}');all[id] = Date.now();
    const retained = Object.fromEntries(Object.entries(all).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,250));
    window.localStorage.setItem(DEDUPE_KEY,JSON.stringify(retained));
  } catch { /* Tracking cannot interrupt registration or a payment. */ }
}
function emit(name, payload = {}, {eventId = null, once = false, custom = false} = {}) {
  if (!initializeMetaPixel()) return false;
  const id = eventId || createMetaEventId(name);
  if (once && wasFired(`${name}:${id}`)) return false;
  window.fbq(custom ? 'trackSingleCustom' : 'trackSingle', PIXEL_ID, name, payload, {eventID:id});
  if (once) remember(`${name}:${id}`);
  return true;
}
function planPayload(code) {
  const normalized = code === 'monthly_trial' ? 'monthly' : code;
  const plan = getCheckoutPlan(normalized);
  if (plan) return {content_name:`CEO Rentable ${plan.name}`,content_ids:[plan.code],content_type:'product',plan_selected:plan.code};
  return {content_name:'CEO Rentable',...(normalized?{content_ids:[normalized],content_type:'product',plan_selected:normalized}:{})};
}
export function trackPageView({path = null} = {}) {
  if (!browser()) return false;
  const current = path || `${window.location.pathname}${window.location.search}`;
  if (current === lastPage) return false;
  const sent = emit('PageView');if (sent) lastPage = current;return sent;
}
export function trackViewContent(plan = null, {path = null} = {}) {
  const key = `${path || (browser() ? window.location.pathname : '')}:${plan}`;
  if (lastViewContent === key) return false;
  const sent = emit('ViewContent',planPayload(plan));if(sent)lastViewContent = key;return sent;
}
export function trackLead(payload = {}, options = {}) { return emit('Lead', payload, {...options,once:true}); }
export function trackContact(payload = {}) { return emit('Contact',payload); }
export function trackCustomEvent(name,payload = {}) { return name ? emit(name,payload,{custom:true}) : false; }
export function trackInitiateCheckout(plan) {
  const normalized = plan === 'monthly_trial' ? 'monthly' : plan;
  if (!browser() || !normalized) return false;
  const signature = `${window.location.pathname}:${normalized}`;
  if (signature === lastCheckout && Date.now()-lastCheckoutAt < 5000) return false;
  const configured = getCheckoutPlan(normalized);
  // Recurring checkout starts with an actual free trial; never copy obsolete DOP prices.
  const sent = emit('InitiateCheckout',{...planPayload(normalized),...(configured?{value:0,currency:configured.currency}:{})});
  if (sent) {lastCheckout = signature;lastCheckoutAt = Date.now();}return sent;
}
export function trackCompleteRegistration(plan = null, options = {}) { return emit('CompleteRegistration',planPayload(plan),{...options,once:true}); }
export function trackStartTrial(receipt) {
  if (receipt?.trialActivated !== true || !receipt?.eventId || !receipt?.subscriptionId) return false;
  return emit('StartTrial',{...planPayload(receipt.planCode),value:0,currency:'USD'},{eventId:receipt.eventId,once:true});
}
export function trackVerifiedPurchase(receipt) {
  if (receipt?.success !== true || `${receipt.status}`.toLowerCase() !== 'completed' || !receipt.captureId || receipt.amount == null || !Number.isFinite(Number(receipt.amount)) || Number(receipt.amount)<=0 || !/^[A-Z]{3}$/.test(receipt.currency || '')) return false;
  return emit('Purchase',{...planPayload(receipt.planCode),value:Number(receipt.amount),currency:receipt.currency},{eventId:`Purchase:paypal:${receipt.captureId}`,once:true});
}
// Compatibility wrapper requires a verified receipt; URL parameters and plan prices are never proof of payment.
export function trackPurchase(_plan,_transactionId,receipt = {}) { return trackVerifiedPurchase(receipt); }
export function trackSubscribe(plan = null, extra = {}) { return emit('Subscribe',{...planPayload(plan),...extra}); }
// Existing payload builder only: no server transport/CAPI integration is installed here.
export function buildConversionApiEvent(eventName,payload = {},{eventId = null,userData = {}} = {}) {
  if (!browser() || getMarketingConsent() !== 'granted' || !eventName || !eventId) return null;
  return {event_name:eventName,event_id:eventId,event_time:Math.floor(Date.now()/1000),action_source:'website',event_source_url:`${window.location.origin}${window.location.pathname}`,custom_data:payload,...(Object.keys(userData).length?{user_data:userData}:{})};
}
export default {initializeMetaPixel,trackPageView,trackViewContent,trackLead,trackContact,trackCustomEvent,trackInitiateCheckout,trackCompleteRegistration,trackPurchase,trackVerifiedPurchase,trackStartTrial,trackSubscribe,buildConversionApiEvent};
