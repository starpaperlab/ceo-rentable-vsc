import { createClient } from '@supabase/supabase-js';

let supabaseAnonClient = null;
let supabaseServiceClient = null;

const PAYPAL_API_BASES = {
  sandbox: 'https://api-m.sandbox.paypal.com',
  live: 'https://api-m.paypal.com',
};

const PAYPAL_REQUIRED_CURRENCY = 'DOP';

const ACTIVE_PAYPAL_PLANS = {
  founder_lifetime: {
    code: 'founder_lifetime',
    name: 'Founder Lifetime',
    amount: '4997.00',
    currency: PAYPAL_REQUIRED_CURRENCY,
    type: 'lifetime',
  },
  monthly: {
    code: 'monthly',
    name: 'Mensual',
    amount: '1497.00',
    currency: PAYPAL_REQUIRED_CURRENCY,
    type: 'monthly',
  },
};

function normalizePlanCode(value = '') {
  return `${value || ''}`.trim().toLowerCase();
}

function getBearerToken(payload = {}, headers = {}) {
  const fromPayload = `${payload.accessToken || ''}`.trim();
  if (fromPayload) return fromPayload;

  const authHeader =
    headers.authorization ||
    headers.Authorization ||
    headers.AUTHORIZATION ||
    '';

  const match = `${authHeader}`.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function getSupabaseAnonClient(env = process.env) {
  if (supabaseAnonClient) return supabaseAnonClient;

  const url = `${env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''}`.trim();
  const anon = `${env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ''}`.trim();
  if (!url || !anon) return null;

  supabaseAnonClient = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return supabaseAnonClient;
}

function getSupabaseServiceClient(env = process.env) {
  if (supabaseServiceClient) return supabaseServiceClient;

  const url = `${env.SUPABASE_URL || env.VITE_SUPABASE_URL || ''}`.trim();
  const serviceRole = `${env.SUPABASE_SERVICE_ROLE_KEY || ''}`.trim();
  if (!url || !serviceRole) return null;

  supabaseServiceClient = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return supabaseServiceClient;
}

function resolveAppUrl(env = process.env) {
  return `${env.APP_URL || env.VITE_APP_URL || 'https://app.ceorentable.com'}`.replace(/\/+$/, '');
}

function resolvePayPalApiBase(env = process.env) {
  const explicitBase = `${env.PAYPAL_API_BASE || ''}`.trim().replace(/\/+$/, '');
  if (explicitBase) return explicitBase;

  const environment = `${env.PAYPAL_ENVIRONMENT || 'sandbox'}`.trim().toLowerCase();
  return PAYPAL_API_BASES[environment] || PAYPAL_API_BASES.sandbox;
}

function resolvePlan(planCode, env = process.env) {
  const normalized = normalizePlanCode(planCode);
  const base = ACTIVE_PAYPAL_PLANS[normalized];
  if (!base) return null;

  const amountEnvName = `PAYPAL_PLAN_${normalized.toUpperCase()}_AMOUNT`;

  const amount = `${env[amountEnvName] || base.amount}`.trim();
  const currency = `${env.PAYPAL_CURRENCY || base.currency}`.trim().toUpperCase();

  if (currency !== base.currency || currency !== PAYPAL_REQUIRED_CURRENCY) return null;
  if (!normalizeMoney(amount)) return null;

  return {
    ...base,
    amount,
    currency,
  };
}

function resolveAccessForPlan(planCode) {
  const plan = ACTIVE_PAYPAL_PLANS[normalizePlanCode(planCode)];
  if (!plan) {
    throw new Error('Plan PayPal inválido para activar acceso.');
  }

  return {
    plan: plan.code,
    isLifetime: plan.type === 'lifetime',
    accessSource: 'paypal',
  };
}

function validateLocalOrderAgainstActivePlan(localOrder) {
  const plan = ACTIVE_PAYPAL_PLANS[normalizePlanCode(localOrder?.plan_code)];
  if (!plan) {
    throw new Error('La orden local tiene un plan PayPal inválido o legacy.');
  }

  const localAmount = normalizeMoney(localOrder.amount);
  const planAmount = normalizeMoney(plan.amount);
  if (!localAmount || localAmount !== planAmount) {
    throw new Error('El monto de la orden local no coincide con el plan PayPal activo.');
  }

  const localCurrency = `${localOrder.currency || ''}`.trim().toUpperCase();
  if (localCurrency !== plan.currency || localCurrency !== PAYPAL_REQUIRED_CURRENCY) {
    throw new Error('La moneda de la orden local no coincide con el plan PayPal activo.');
  }

  return plan;
}

async function authenticate(payload = {}, { env = process.env, headers = {} } = {}) {
  const token = getBearerToken(payload, headers);
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: 'Debes iniciar sesión para continuar al pago.',
    };
  }

  const anonClient = getSupabaseAnonClient(env);
  if (!anonClient) {
    return {
      ok: false,
      status: 500,
      error: 'Configuración incompleta de Supabase en servidor.',
    };
  }

  const { data, error } = await anonClient.auth.getUser(token);
  if (error || !data?.user?.id) {
    return {
      ok: false,
      status: 401,
      error: `Sesión inválida o expirada.${error?.message ? ` ${error.message}` : ''}`,
    };
  }

  return {
    ok: true,
    user: data.user,
    token,
  };
}

async function getPayPalAccessToken({ env = process.env, fetchImpl = fetch } = {}) {
  const clientId = `${env.PAYPAL_CLIENT_ID || ''}`.trim();
  const clientSecret = `${env.PAYPAL_CLIENT_SECRET || ''}`.trim();
  if (!clientId || !clientSecret) {
    return {
      ok: false,
      status: 500,
      error: 'Faltan PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET en el servidor.',
    };
  }

  const apiBase = resolvePayPalApiBase(env);
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetchImpl(`${apiBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    return {
      ok: false,
      status: response.status || 502,
      error: payload?.error_description || payload?.error || 'No se pudo autenticar con PayPal.',
    };
  }

  return {
    ok: true,
    accessToken: payload.access_token,
    apiBase,
  };
}

function findApprovalUrl(orderPayload = {}) {
  const links = Array.isArray(orderPayload?.links) ? orderPayload.links : [];
  const approve = links.find((link) => `${link?.rel || ''}`.toLowerCase() === 'approve');
  return approve?.href || null;
}

function normalizeMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric.toFixed(2);
}

function getPrimaryPurchaseUnit(orderPayload = {}) {
  const units = Array.isArray(orderPayload?.purchase_units) ? orderPayload.purchase_units : [];
  return units[0] || {};
}

function getPrimaryCapture(orderPayload = {}) {
  const unit = getPrimaryPurchaseUnit(orderPayload);
  const captures = Array.isArray(unit?.payments?.captures) ? unit.payments.captures : [];
  return captures[0] || null;
}

async function createOrderWithPayPal(input, { env = process.env, fetchImpl = fetch } = {}) {
  const auth = await getPayPalAccessToken({ env, fetchImpl });
  if (!auth.ok) {
    return {
      ok: false,
      status: auth.status || 500,
      body: {
        success: false,
        code: 'PAYPAL_AUTH_FAILED',
        error: auth.error,
      },
    };
  }

  const appUrl = resolveAppUrl(env);
  const returnUrl = `${appUrl}/payment-success?provider=paypal`;
  const cancelUrl = `${appUrl}/payment-cancel?provider=paypal`;

  const response = await fetchImpl(`${auth.apiBase}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: input.plan.code,
          custom_id: input.userId,
          description: `${input.plan.name} - CEO Rentable OS`,
          amount: {
            currency_code: input.plan.currency,
            value: input.plan.amount,
          },
        },
      ],
      application_context: {
        brand_name: 'CEO Rentable OS',
        landing_page: 'LOGIN',
        user_action: 'PAY_NOW',
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  const approvalUrl = findApprovalUrl(payload);

  if (!response.ok || !payload?.id || !approvalUrl) {
    return {
      ok: false,
      status: response.status || 502,
      body: {
        success: false,
        code: 'PAYPAL_ORDER_CREATE_FAILED',
        error: payload?.message || payload?.error_description || 'No se pudo crear la orden de PayPal.',
      },
    };
  }

  return {
    ok: true,
    status: 200,
    body: {
      success: true,
      orderId: payload.id,
      approvalUrl,
      approval_url: approvalUrl,
      status: payload.status || 'CREATED',
      plan: input.plan,
    },
  };
}

function isMissingTableError(error, tableName = '') {
  const text = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  const table = `${tableName}`.toLowerCase();
  return (
    error?.code === 'PGRST205' ||
    text.includes('could not find the table') ||
    (table && text.includes(`table 'public.${table}'`))
  );
}

function isUniqueViolation(error) {
  const code = `${error?.code || ''}`.trim();
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return code === '23505' || message.includes('duplicate key');
}

async function savePayPalOrderIfTableExists(input, result, env = process.env) {
  const serviceClient = getSupabaseServiceClient(env);
  if (!serviceClient || !result?.body?.orderId) return;

  const now = new Date().toISOString();
  const { error } = await serviceClient.from('paypal_orders').insert({
    user_id: input.userId,
    paypal_order_id: result.body.orderId,
    plan_code: input.plan.code,
    amount: Number(input.plan.amount),
    currency: input.plan.currency,
    status: `${result.body.status || 'CREATED'}`.toLowerCase(),
    approval_url: result.body.approvalUrl,
    created_at: now,
    updated_at: now,
  });

  if (error && !isMissingTableError(error, 'paypal_orders')) {
    throw error;
  }
}

async function getPayPalOrder(orderId, paypalAuth, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${paypalAuth.apiBase}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${paypalAuth.accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error_description || 'No se pudo consultar la orden PayPal.');
  }
  return payload;
}

async function captureOrderWithPayPal(orderId, paypalAuth, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${paypalAuth.apiBase}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${paypalAuth.accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorText = `${payload?.message || ''} ${payload?.name || ''} ${JSON.stringify(payload?.details || [])}`.toLowerCase();
    if (errorText.includes('already') && errorText.includes('captur')) {
      return getPayPalOrder(orderId, paypalAuth, { fetchImpl });
    }
    throw new Error(payload?.message || payload?.error_description || 'No se pudo capturar la orden PayPal.');
  }
  return payload;
}

async function getLocalPayPalOrder(serviceClient, orderId) {
  const { data, error } = await serviceClient
    .from('paypal_orders')
    .select('*')
    .eq('paypal_order_id', orderId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function findExistingTransactionByCapture(serviceClient, captureId) {
  if (!captureId) return null;

  const { data, error } = await serviceClient
    .from('transactions')
    .select('id')
    .eq('payment_provider', 'paypal')
    .eq('provider_capture_id', captureId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

function validateCapturedOrder({ localOrder, paypalOrder }) {
  validateLocalOrderAgainstActivePlan(localOrder);

  if (`${paypalOrder?.status || ''}`.toUpperCase() !== 'COMPLETED') {
    throw new Error('PayPal no confirmó el pago como COMPLETED.');
  }

  const unit = getPrimaryPurchaseUnit(paypalOrder);
  const capture = getPrimaryCapture(paypalOrder);

  if (!capture?.id) {
    throw new Error('PayPal no devolvió capture_id para la orden completada.');
  }

  if (`${capture.status || ''}`.toUpperCase() !== 'COMPLETED') {
    throw new Error('La captura PayPal no está COMPLETED.');
  }

  const planCode = `${unit?.reference_id || localOrder.plan_code || ''}`.trim().toLowerCase();
  if (planCode && planCode !== `${localOrder.plan_code || ''}`.trim().toLowerCase()) {
    throw new Error('El plan PayPal no coincide con la orden local.');
  }

  const captureAmount = normalizeMoney(capture?.amount?.value);
  const localAmount = normalizeMoney(localOrder.amount);
  if (!captureAmount || captureAmount !== localAmount) {
    throw new Error('El monto PayPal no coincide con la orden local.');
  }

  const captureCurrency = `${capture?.amount?.currency_code || ''}`.trim().toUpperCase();
  const localCurrency = `${localOrder.currency || ''}`.trim().toUpperCase();
  if (!captureCurrency || captureCurrency !== localCurrency) {
    throw new Error('La moneda PayPal no coincide con la orden local.');
  }

  return {
    capture,
    amount: Number(captureAmount),
    currency: captureCurrency,
    planCode: localOrder.plan_code,
  };
}

async function activateAccessForPayPalPayment({ serviceClient, userId, localOrder, captureInfo, paypalOrderId }) {
  const now = new Date().toISOString();
  const existingTransaction = await findExistingTransactionByCapture(serviceClient, captureInfo.capture.id);
  const access = resolveAccessForPlan(localOrder.plan_code);

  if (!existingTransaction) {
    const { error: transactionError } = await serviceClient.from('transactions').insert({
      user_id: userId,
      payment_provider: 'paypal',
      provider_order_id: paypalOrderId,
      provider_capture_id: captureInfo.capture.id,
      amount: captureInfo.amount,
      currency: captureInfo.currency,
      status: 'completed',
      description: `Pago PayPal ${localOrder.plan_code}`,
      metadata: {
        plan_code: localOrder.plan_code,
        plan_type: access.isLifetime ? 'lifetime' : 'monthly',
        paypal_order_id: paypalOrderId,
        paypal_capture_status: captureInfo.capture.status,
      },
      created_at: now,
      updated_at: now,
    });

    if (transactionError && !isUniqueViolation(transactionError)) throw transactionError;
  }

  const { error: userError } = await serviceClient
    .from('users')
    .update({
      has_access: true,
      plan: access.plan,
      is_lifetime: access.isLifetime,
      payment_provider: 'paypal',
      access_source: access.accessSource,
      updated_at: now,
    })
    .eq('id', userId);

  if (userError) throw userError;

  const { error: subscriptionError } = await serviceClient.from('subscriptions').upsert(
    {
      user_id: userId,
      plan: access.plan,
      plan_code: localOrder.plan_code,
      status: 'active',
      is_lifetime: access.isLifetime,
      access_source: access.accessSource,
      payment_provider: 'paypal',
      provider_customer_id: null,
      provider_subscription_id: null,
      metadata: {
        plan_type: access.isLifetime ? 'lifetime' : 'monthly',
        paypal_order_id: paypalOrderId,
        paypal_capture_id: captureInfo.capture.id,
      },
      updated_at: now,
    },
    { onConflict: 'user_id' }
  );

  if (subscriptionError) throw subscriptionError;

  const { error: orderError } = await serviceClient
    .from('paypal_orders')
    .update({
      status: 'completed',
      paypal_capture_id: captureInfo.capture.id,
      captured_at: now,
      updated_at: now,
    })
    .eq('paypal_order_id', paypalOrderId);

  if (orderError) throw orderError;

  return {
    alreadyProcessed: Boolean(existingTransaction),
  };
}

export async function handleCreatePayPalOrderPayload(payload = {}, options = {}) {
  try {
    const auth = await authenticate(payload, options);
    if (!auth.ok) {
      return {
        ok: false,
        status: auth.status || 401,
        body: {
          success: false,
          code: 'PAYPAL_ORDER_UNAUTHORIZED',
          error: auth.error || 'No autorizado.',
        },
      };
    }

    const planCode = normalizePlanCode(payload.planCode || payload.plan);
    const plan = resolvePlan(planCode, options.env || process.env);
    if (!plan) {
      return {
        ok: false,
        status: 400,
        body: {
          success: false,
          code: 'INVALID_PLAN',
          error: 'Plan inválido para PayPal.',
        },
      };
    }

    const input = {
      userId: auth.user.id,
      email: auth.user.email || null,
      plan,
    };

    const result = await createOrderWithPayPal(input, options);
    if (result.ok) {
      await savePayPalOrderIfTableExists(input, result, options.env || process.env);
    }

    return result;
  } catch (error) {
    return {
      ok: false,
      status: 500,
      body: {
        success: false,
        code: 'PAYPAL_ORDER_INTERNAL_ERROR',
        error: error?.message || 'Error interno creando orden PayPal.',
      },
    };
  }
}

export async function handleCapturePayPalOrderPayload(payload = {}, options = {}) {
  try {
    const auth = await authenticate(payload, options);
    if (!auth.ok) {
      return {
        ok: false,
        status: auth.status || 401,
        body: {
          success: false,
          code: 'PAYPAL_CAPTURE_UNAUTHORIZED',
          error: auth.error || 'No autorizado.',
        },
      };
    }

    const orderId = `${payload.orderId || payload.order_id || payload.token || ''}`.trim();
    if (!orderId) {
      return {
        ok: false,
        status: 400,
        body: {
          success: false,
          code: 'PAYPAL_ORDER_REQUIRED',
          error: 'Falta el ID de la orden PayPal.',
        },
      };
    }

    const serviceClient = getSupabaseServiceClient(options.env || process.env);
    if (!serviceClient) {
      return {
        ok: false,
        status: 500,
        body: {
          success: false,
          code: 'SUPABASE_SERVICE_NOT_CONFIGURED',
          error: 'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.',
        },
      };
    }

    const localOrder = await getLocalPayPalOrder(serviceClient, orderId);
    if (!localOrder) {
      return {
        ok: false,
        status: 404,
        body: {
          success: false,
          code: 'PAYPAL_ORDER_NOT_FOUND',
          error: 'No encontramos la orden PayPal en el sistema.',
        },
      };
    }

    if (localOrder.user_id !== auth.user.id) {
      return {
        ok: false,
        status: 403,
        body: {
          success: false,
          code: 'PAYPAL_ORDER_FORBIDDEN',
          error: 'La orden PayPal no pertenece a tu cuenta.',
        },
      };
    }

    const paypalAuth = await getPayPalAccessToken(options);
    if (!paypalAuth.ok) {
      return {
        ok: false,
        status: paypalAuth.status || 500,
        body: {
          success: false,
          code: 'PAYPAL_AUTH_FAILED',
          error: paypalAuth.error,
        },
      };
    }

    let paypalOrder = await getPayPalOrder(orderId, paypalAuth, options);
    if (`${paypalOrder?.status || ''}`.toUpperCase() !== 'COMPLETED') {
      paypalOrder = await captureOrderWithPayPal(orderId, paypalAuth, options);
    }

    const captureInfo = validateCapturedOrder({ localOrder, paypalOrder });
    const activation = await activateAccessForPayPalPayment({
      serviceClient,
      userId: auth.user.id,
      localOrder,
      captureInfo,
      paypalOrderId: orderId,
    });
    const access = resolveAccessForPlan(localOrder.plan_code);

    return {
      ok: true,
      status: 200,
      body: {
        success: true,
        orderId,
        captureId: captureInfo.capture.id,
        amount: captureInfo.amount,
        currency: captureInfo.currency,
        planCode: captureInfo.planCode,
        planType: access.isLifetime ? 'lifetime' : 'monthly',
        status: 'completed',
        alreadyProcessed: activation.alreadyProcessed,
      },
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      body: {
        success: false,
        code: 'PAYPAL_CAPTURE_INTERNAL_ERROR',
        error: error?.message || 'Error interno capturando orden PayPal.',
      },
    };
  }
}
