/**
 * CEO RENTABLE OS™ — CONFIGURACIÓN CENTRALIZADA DE VARIABLES
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL) throw new Error('❌ VITE_SUPABASE_URL no está definida en .env.local');
if (!SUPABASE_ANON_KEY) throw new Error('❌ VITE_SUPABASE_ANON_KEY no está definida en .env.local');

const STRIPE_LEGACY_ENABLED = import.meta.env.VITE_STRIPE_LEGACY_ENABLED === 'true';
const STRIPE_PUBLIC_KEY = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
if (STRIPE_LEGACY_ENABLED && !STRIPE_PUBLIC_KEY) {
  console.warn('⚠️ Stripe legacy está activo, pero VITE_STRIPE_PUBLIC_KEY no está definida');
}
const STRIPE_PLANS = {};

const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID || '';
const PAYPAL_ENVIRONMENT = import.meta.env.VITE_PAYPAL_ENVIRONMENT || 'sandbox';
const PAYPAL_CURRENCY = import.meta.env.VITE_PAYPAL_CURRENCY || 'USD';
const PAYPAL_PLAN_FOUNDER_LIFETIME_AMOUNT = import.meta.env.VITE_PAYPAL_PLAN_FOUNDER_LIFETIME_AMOUNT || '4997.00';
const PAYPAL_PLAN_MONTHLY_AMOUNT = import.meta.env.VITE_PAYPAL_PLAN_MONTHLY_AMOUNT || '21.00';
const PAYPAL_PLAN_ANNUAL_AMOUNT = import.meta.env.VITE_PAYPAL_PLAN_ANNUAL_AMOUNT || '210.00';
const PAYPAL_MONTHLY_PLAN_ID = import.meta.env.VITE_PAYPAL_MONTHLY_PLAN_ID || '';
const PAYPAL_ANNUAL_PLAN_ID = import.meta.env.VITE_PAYPAL_ANNUAL_PLAN_ID || '';

const EMAIL_API_ENDPOINT = import.meta.env.VITE_EMAIL_API_ENDPOINT || '/api/send-email';
const RESEND_FROM_EMAIL = import.meta.env.VITE_RESEND_FROM_EMAIL || 'CEO Rentable OS <hola@ceorentable.com>';
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
if (!GEMINI_API_KEY) console.warn('⚠️ VITE_GEMINI_API_KEY no está definida - IA deshabilitada');
const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER || '18092517070';
const APP_URL = import.meta.env.VITE_APP_URL || 'http://localhost:5173';
const DEFAULT_CURRENCY = import.meta.env.VITE_DEFAULT_CURRENCY || 'USD';
const DEFAULT_TIMEZONE = import.meta.env.VITE_DEFAULT_TIMEZONE || 'UTC';
const DEBUG_MODE = import.meta.env.VITE_DEBUG_MODE === 'true';
const META_PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID || '339342380789724';

const BRAND_COLORS = {
  primary: '#D45387',
  background: '#F7F3EE',
  dark: '#1F1F1F',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
};

export const ENV_CONFIG = {
  supabase: { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY },
  stripe: {
    publicKey: STRIPE_PUBLIC_KEY,
    enabled: STRIPE_LEGACY_ENABLED && !!STRIPE_PUBLIC_KEY,
    legacyEnabled: STRIPE_LEGACY_ENABLED,
    plans: STRIPE_PLANS,
  },
  paypal: {
    clientId: PAYPAL_CLIENT_ID,
    environment: PAYPAL_ENVIRONMENT,
    enabled: !!PAYPAL_CLIENT_ID,
    currency: PAYPAL_CURRENCY,
    trialDays: 7,
    plans: {
      founder_lifetime: {
        code: 'founder_lifetime',
        amount: PAYPAL_PLAN_FOUNDER_LIFETIME_AMOUNT,
        currency: import.meta.env.VITE_PAYPAL_FOUNDER_CURRENCY || 'DOP',
        type: 'one_time',
      },
      monthly: {
        code: 'monthly',
        amount: PAYPAL_PLAN_MONTHLY_AMOUNT,
        currency: 'USD',
        type: 'subscription',
        interval: 'MONTH',
        planId: PAYPAL_MONTHLY_PLAN_ID,
      },
      annual: {
        code: 'annual',
        amount: PAYPAL_PLAN_ANNUAL_AMOUNT,
        currency: 'USD',
        type: 'subscription',
        interval: 'YEAR',
        planId: PAYPAL_ANNUAL_PLAN_ID,
      },
    },
  },
  resend: { endpoint: EMAIL_API_ENDPOINT, fromEmail: RESEND_FROM_EMAIL, enabled: true },
  gemini: { apiKey: GEMINI_API_KEY, enabled: !!GEMINI_API_KEY },
  whatsapp: { number: WHATSAPP_NUMBER, enabled: !!WHATSAPP_NUMBER },
  app: { url: APP_URL, currency: DEFAULT_CURRENCY, timezone: DEFAULT_TIMEZONE, debug: DEBUG_MODE },
  metaPixel: { id: META_PIXEL_ID, enabled: !!META_PIXEL_ID },
  brand: BRAND_COLORS,
};

if (DEBUG_MODE) {
  console.log('✅ Configuración cargada:', {
    supabase: '✓',
    stripe: ENV_CONFIG.stripe.enabled ? 'legacy ✓' : 'legacy ✗',
    paypal: ENV_CONFIG.paypal.enabled ? '✓' : '✗',
    resend: ENV_CONFIG.resend.enabled ? '✓' : '✗',
    gemini: ENV_CONFIG.gemini.enabled ? '✓' : '✗',
    metaPixel: ENV_CONFIG.metaPixel.enabled ? '✓' : '✗',
  });
}

export default ENV_CONFIG;
