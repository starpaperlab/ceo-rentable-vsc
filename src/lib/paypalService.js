import { ENV_CONFIG } from '@/config/env';
import { supabase } from '@/lib/supabase';

const AUTH_SESSION_ERROR =
  'No pudimos validar tu sesión. Inicia sesión nuevamente para continuar con el pago.'

function getCreateOrderEndpoint() {
  return '/api/paypal/create-order';
}

function getCaptureOrderEndpoint() {
  return '/api/paypal/capture-order';
}

function isAuthenticationFailure(code, message) {
  const normalizedCode = `${code || ''}`.trim().toUpperCase()
  const normalizedMessage = `${message || ''}`.trim().toLowerCase()

  if (
    [
      'AUTH_REQUIRED',
      'PAYPAL_ORDER_UNAUTHORIZED',
      'PAYPAL_CAPTURE_UNAUTHORIZED',
      'PAYPAL_ORDER_FORBIDDEN',
    ].includes(normalizedCode)
  ) {
    return true
  }

  return (
    normalizedMessage.includes('client authentication failed') ||
    normalizedMessage.includes('invalid refresh token') ||
    normalizedMessage.includes('invalid jwt') ||
    normalizedMessage.includes('jwt expired') ||
    normalizedMessage.includes('session invalid') ||
    normalizedMessage.includes('sesión inválida') ||
    normalizedMessage.includes('sesion invalida') ||
    normalizedMessage.includes('sesión expirada') ||
    normalizedMessage.includes('sesion expirada')
  )
}

async function getAccessToken() {
  const { data: sessionData } = await supabase.auth.getSession()
  let token = sessionData?.session?.access_token || null
  if (token) return token

  const { data: refreshedData } = await supabase.auth.refreshSession()
  token = refreshedData?.session?.access_token || null
  if (token) return token

  return null
}

export async function createPayPalOrder(planCode) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return {
      success: false,
      code: 'AUTH_REQUIRED',
      error: AUTH_SESSION_ERROR,
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
    const failureCode = payload?.code || 'PAYPAL_ORDER_FAILED'
    const failureMessage = payload?.error || 'No se pudo crear la orden de PayPal.'
    return {
      success: false,
      code: isAuthenticationFailure(failureCode, failureMessage)
        ? 'AUTH_REQUIRED'
        : failureCode,
      error: isAuthenticationFailure(failureCode, failureMessage)
        ? AUTH_SESSION_ERROR
        : failureMessage,
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
      error: AUTH_SESSION_ERROR,
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
    const failureCode = payload?.code || 'PAYPAL_CAPTURE_FAILED'
    const failureMessage = payload?.error || 'No se pudo confirmar el pago de PayPal.'
    return {
      success: false,
      code: isAuthenticationFailure(failureCode, failureMessage)
        ? 'AUTH_REQUIRED'
        : failureCode,
      error: isAuthenticationFailure(failureCode, failureMessage)
        ? AUTH_SESSION_ERROR
        : failureMessage,
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
