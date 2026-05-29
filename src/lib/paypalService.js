import { ENV_CONFIG } from '@/config/env';
import { supabase } from '@/lib/supabase';

function getCreateOrderEndpoint() {
  return '/api/paypal/create-order';
}

function getCaptureOrderEndpoint() {
  return '/api/paypal/capture-order';
}

function getAccessTokenFromStorage() {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem('ceo-rentable-os-auth');
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return (
      parsed?.currentSession?.access_token ||
      parsed?.session?.access_token ||
      parsed?.access_token ||
      null
    );
  } catch {
    return null;
  }
}

async function getAccessToken() {
  const { data: sessionData } = await supabase.auth.getSession();
  let token = sessionData?.session?.access_token || null;
  if (token) return token;

  const { data: refreshedData } = await supabase.auth.refreshSession();
  token = refreshedData?.session?.access_token || null;
  if (token) return token;

  return getAccessTokenFromStorage();
}

export async function createPayPalOrder(planCode) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return {
      success: false,
      code: 'AUTH_REQUIRED',
      error: 'Debes iniciar sesión para continuar al pago.',
    };
  }

  const response = await fetch(getCreateOrderEndpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: 'include',
    body: JSON.stringify({
      planCode,
      provider: 'paypal',
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    return {
      success: false,
      code: payload?.code || 'PAYPAL_ORDER_FAILED',
      error: payload?.error || 'No se pudo crear la orden de PayPal.',
    };
  }

  return {
    success: true,
    orderId: payload?.orderId || null,
    approvalUrl: payload?.approvalUrl || payload?.approval_url || null,
    approval_url: payload?.approval_url || payload?.approvalUrl || null,
    plan: payload?.plan || null,
    paypal: ENV_CONFIG.paypal,
  };
}

export async function capturePayPalOrder(orderId) {
  const normalizedOrderId = `${orderId || ''}`.trim();
  if (!normalizedOrderId) {
    return {
      success: false,
      code: 'PAYPAL_ORDER_REQUIRED',
      error: 'Falta el ID de la orden PayPal.',
    };
  }

  const accessToken = await getAccessToken();
  if (!accessToken) {
    return {
      success: false,
      code: 'AUTH_REQUIRED',
      error: 'Debes iniciar sesión para confirmar el pago.',
    };
  }

  const response = await fetch(getCaptureOrderEndpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: 'include',
    body: JSON.stringify({
      orderId: normalizedOrderId,
      provider: 'paypal',
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    return {
      success: false,
      code: payload?.code || 'PAYPAL_CAPTURE_FAILED',
      error: payload?.error || 'No se pudo confirmar el pago de PayPal.',
    };
  }

  return {
    success: true,
    orderId: payload?.orderId || normalizedOrderId,
    captureId: payload?.captureId || null,
    amount: payload?.amount ?? null,
    currency: payload?.currency || null,
    status: payload?.status || 'completed',
  };
}

export default {
  createPayPalOrder,
  capturePayPalOrder,
};
