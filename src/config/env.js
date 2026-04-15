/**
 * ═══════════════════════════════════════════════════════════════
 * CEO RENTABLE OS™ — CONFIGURACIÓN CENTRALIZADA DE VARIABLES
 * ═══════════════════════════════════════════════════════════════
 *
 * Este archivo valida y exporta todas las variables de entorno
 * Falla temprano si alguna variable crítica está faltando
 */

// ───────────────────────────────────────────────────────────────
// SUPABASE
// ───────────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL) {
  throw new Error('❌ VITE_SUPABASE_URL no está definida en .env.local');
}
if (!SUPABASE_ANON_KEY) {
  throw new Error('❌ VITE_SUPABASE_ANON_KEY no está definida en .env.local');
}


// ───────────────────────────────────────────────────────────────
// STRIPE
// ───────────────────────────────────────────────────────────────

const STRIPE_PUBLIC_KEY = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
const STRIPE_PLAN_BASICO_ID = import.meta.env.VITE_STRIPE_PLAN_BASICO_ID;
const STRIPE_PLAN_PRO_ID = import.meta.env.VITE_STRIPE_PLAN_PRO_ID;

if (!STRIPE_PUBLIC_KEY) {
  console.warn('⚠️ VITE_STRIPE_PUBLIC_KEY no está definida - Stripe deshabilitado');
}

if (!STRIPE_PLAN_BASICO_ID || !STRIPE_PLAN_PRO_ID) {
  console.warn('⚠️ IDs de planes de Stripe no definidos');
}

const STRIPE_PLANS = {
  basico: {
    id: STRIPE_PLAN_BASICO_ID,
    name: 'Plan Básico',
    price: 27,
    currency: 'USD',
    interval: 'month',
    features: [
      '📊 Dashboard con KPIs',
      '🏭 Gestión de Inventario Básica',
      '💰 Reportes de Rentabilidad',
      '📧 Hasta 500 emails/mes',
    ]
  },
  pro: {
    id: STRIPE_PLAN_PRO_ID,
    name: 'Plan Pro',
    price: 47,
    currency: 'USD',
    interval: 'month',
    features: [
      '✨ TODO del plan Básico',
      '🤖 Análisis con IA (Gemini)',
      '📞 Agenda de Citas',
      '📊 Proyecciones Avanzadas',
      '📧 Emails Ilimitados',
      '👥 Hasta 5 usuarios',
      '📁 Almacenamiento Ilimitado',
    ]
  }
};


// ───────────────────────────────────────────────────────────────
// RESEND (EMAILS)
// ───────────────────────────────────────────────────────────────

const EMAIL_API_ENDPOINT = import.meta.env.VITE_EMAIL_API_ENDPOINT || '/api/send-email';
const RESEND_FROM_EMAIL = import.meta.env.VITE_RESEND_FROM_EMAIL || 'hola@ceorentable.com';


// ───────────────────────────────────────────────────────────────
// GOOGLE GEMINI (IA)
// ───────────────────────────────────────────────────────────────

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn('⚠️ VITE_GEMINI_API_KEY no está definida - IA deshabilitada');
}


// ───────────────────────────────────────────────────────────────
// APP CONFIGURATION
// ───────────────────────────────────────────────────────────────

const APP_URL = import.meta.env.VITE_APP_URL || 'http://localhost:5173';
const DEFAULT_CURRENCY = import.meta.env.VITE_DEFAULT_CURRENCY || 'USD';
const DEFAULT_TIMEZONE = import.meta.env.VITE_DEFAULT_TIMEZONE || 'UTC';
const DEBUG_MODE = import.meta.env.VITE_DEBUG_MODE === 'true';


// ───────────────────────────────────────────────────────────────
// COLORES DE MARCA
// ───────────────────────────────────────────────────────────────

const BRAND_COLORS = {
  primary: '#D45387',      // Rosa/Magenta
  background: '#F7F3EE',   // Crema/Beige
  dark: '#1F1F1F',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
};


// ───────────────────────────────────────────────────────────────
// EXPORT CONFIGURATION OBJECT
// ───────────────────────────────────────────────────────────────

export const ENV_CONFIG = {
  // Supabase
  supabase: {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
  },

  // Stripe
  stripe: {
    publicKey: STRIPE_PUBLIC_KEY,
    enabled: !!STRIPE_PUBLIC_KEY,
    plans: STRIPE_PLANS,
  },

  // Resend (Emails)
  resend: {
    endpoint: EMAIL_API_ENDPOINT,
    fromEmail: RESEND_FROM_EMAIL,
    enabled: true,
  },

  // Google Gemini
  gemini: {
    apiKey: GEMINI_API_KEY,
    enabled: !!GEMINI_API_KEY,
  },

  // App
  app: {
    url: APP_URL,
    currency: DEFAULT_CURRENCY,
    timezone: DEFAULT_TIMEZONE,
    debug: DEBUG_MODE,
  },

  // Brand
  brand: BRAND_COLORS,
};

// Log de configuración cargada (solo en debug)
if (DEBUG_MODE) {
  console.log('✅ Configuración cargada:', {
    supabase: '✓',
    stripe: ENV_CONFIG.stripe.enabled ? '✓' : '✗',
    resend: ENV_CONFIG.resend.enabled ? '✓' : '✗',
    gemini: ENV_CONFIG.gemini.enabled ? '✓' : '✗',
  });
}

export default ENV_CONFIG;
