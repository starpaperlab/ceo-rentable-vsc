import { createClient } from '@supabase/supabase-js';

let supabaseServiceClient = null;

const PAYPAL_API_BASES = {
  sandbox: 'https://api-m.sandbox.paypal.com',
  live: 'https://api-m.paypal.com',
};

const PAYPAL_REQUIRED_CURRENCY = 'DOP';

const ACTIVE_PAYPAL_PLANS = {
  founder_lifetime: {
    code: 'founder_lifetime',
    amount: '4997.00',
    currency: PAYPAL_REQUIRED_CURRENCY,
    type: 'lifetime',
  },
  monthly: {
    code: 'monthly',
    amount: '1497.00',
    currency: PAYPAL_REQUIRED_CURRENCY,
    type: 'monthly',
  },
};

function getHeader(headers = {}, key = '') {
  const lowerKey = key.toLowerCase();
  const found = Object.entries(headers || {}).find(([name]) => `${name}`.toLowerCase() === lowerKey);
  return `${found?.[1] || ''}`.trim();
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

function resolvePayPalApiBase(env = process.env) {
  const explicitBase = `${env.PAYPAL_API_BASE || ''}`.trim().replace(/\/+$/, '');
  if (explicitBase) return explicitBase;

  const environment = `${env.PAYPAL_ENVIRONMENT || 'sandbox'}`.trim().toLowerCase();
  return PAYPAL_API_BASES[environment] || PAYPAL_API_BASES.sandbox;
}

async function getPayPalAccessToken({ env = process.env, fetchImpl = fetch } = {}) {
  const clientId = `${env.PAYPAL_CLIENT_ID || ''}`.trim();
  const clientSecret = `${env.PAYPAL_CLIENT_SECRET || ''}`.trim();
  if (!clientId || !clientSecret) {
    throw new Error('Faltan PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET en el servidor.');
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
    throw new Error(payload?.error_description || payload?.error || 'No se pudo autenticar con PayPal.');
  }

  return {
    accessToken: payload.access_token,
    apiBase,
  };
}

function normalizeMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric.toFixed(2);
}

function normalizePlanCode(value = '') {
  return `${value || ''}`.trim().toLowerCase();
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

function sanitizeError(error) {
  const text = `${error?.message || error || ''}`.trim();
  return text.length > 300 ? `${text.slice(0, 300)}...[truncated]` : text;
}

function isUniqueViolation(error) {
  const code = `${error?.code || ''}`.trim();
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return code === '23505' || message.includes('duplicate key');
}

async function verifyPayPalWebhookSignature(webhookEvent, { env = process.env, headers = {}, fetchImpl = fetch } = {}) {
  const webhookId = `${env.PAYPAL_WEBHOOK_ID || ''}`.trim();
  if (!webhookId) {
    throw new Error('Falta PAYPAL_WEBHOOK_ID en el servidor.');
  }

  const paypalAuth = await getPayPalAccessToken({ env, fetchImpl });
  const verificationPayload = {
    auth_algo: getHeader(headers, 'paypal-auth-algo'),
    cert_url: getHeader(headers, 'paypal-cert-url'),
    transmission_id: getHeader(headers, 'paypal-transmission-id'),
    transmission_sig: getHeader(headers, 'paypal-transmission-sig'),
    transmission_time: getHeader(headers, 'paypal-transmission-time'),
    webhook_id: webhookId,
    webhook_event: webhookEvent,
  };

  const missingHeader = [
    'auth_algo',
    'cert_url',
    'transmission_id',
    'transmission_sig',
    'transmission_time',
  ].find((key) => !verificationPayload[key]);

  if (missingHeader) {
    return { ok: false, reason: `Falta header PayPal: ${missingHeader}` };
  }

  const response = await fetchImpl(`${paypalAuth.apiBase}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${paypalAuth.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(verificationPayload),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error_description || 'No se pudo verificar firma PayPal.');
  }

  return {
    ok: payload?.verification_status === 'SUCCESS',
    reason: payload?.verification_status || 'UNKNOWN',
  };
}

function reducePayPalPayload(event = {}) {
  const resource = event?.resource || {};
  return {
    id: event?.id || null,
    event_type: event?.event_type || null,
    resource_type: event?.resource_type || null,
    resource: {
      id: resource?.id || null,
      status: resource?.status || null,
      custom_id: resource?.custom_id || null,
      invoice_id: resource?.invoice_id || null,
      amount: resource?.amount || null,
      related_ids: resource?.supplementary_data?.related_ids || null,
    },
  };
}

async function recordEventReceived(serviceClient, event) {
  const now = new Date().toISOString();
  const insertPayload = {
    paypal_event_id: `${event?.id || ''}`,
    event_type: `${event?.event_type || 'unknown'}`,
    status: 'received',
    resource_id: event?.resource?.id || null,
    resource_type: event?.resource_type || null,
    payload_reduced: reducePayPalPayload(event),
    first_received_at: now,
    updated_at: now,
  };

  const { error } = await serviceClient.from('paypal_events').insert(insertPayload);
  if (!error) return { replay: false };

  if (!isUniqueViolation(error)) throw error;

  const { data, error: readError } = await serviceClient
    .from('paypal_events')
    .select('status')
    .eq('paypal_event_id', `${event?.id || ''}`)
    .maybeSingle();

  if (readError) throw readError;
  return { replay: true, status: data?.status || null };
}

async function patchEvent(serviceClient, eventId, patch) {
  const { error } = await serviceClient
    .from('paypal_events')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('paypal_event_id', eventId);

  if (error) throw error;
}

async function findExistingTransactionByCapture(serviceClient, captureId) {
  if (!captureId) return null;

  const { data, error } = await serviceClient
    .from('transactions')
    .select('id, user_id, provider_order_id')
    .eq('payment_provider', 'paypal')
    .eq('provider_capture_id', captureId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function findLocalOrder(serviceClient, resource) {
  const captureId = `${resource?.id || ''}`.trim();
  const relatedOrderId = `${resource?.supplementary_data?.related_ids?.order_id || ''}`.trim();
  const invoiceId = `${resource?.invoice_id || ''}`.trim();
  const customId = `${resource?.custom_id || ''}`.trim();
  const amount = normalizeMoney(resource?.amount?.value);
  const currency = `${resource?.amount?.currency_code || ''}`.trim().toUpperCase();

  if (captureId) {
    const { data, error } = await serviceClient
      .from('paypal_orders')
      .select('*')
      .eq('paypal_capture_id', captureId)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  for (const candidate of [relatedOrderId, invoiceId].filter(Boolean)) {
    const { data, error } = await serviceClient
      .from('paypal_orders')
      .select('*')
      .eq('paypal_order_id', candidate)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  if (customId && amount && currency) {
    const { data, error } = await serviceClient
      .from('paypal_orders')
      .select('*')
      .eq('user_id', customId)
      .eq('amount', Number(amount))
      .eq('currency', currency)
      .in('status', ['created', 'approved', 'completed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  return null;
}

function validateCaptureAgainstOrder(resource, localOrder) {
  validateLocalOrderAgainstActivePlan(localOrder);

  if (`${resource?.status || ''}`.toUpperCase() !== 'COMPLETED') {
    throw new Error('PayPal no confirmó el capture como COMPLETED.');
  }

  const captureId = `${resource?.id || ''}`.trim();
  if (!captureId) {
    throw new Error('PayPal no envió capture_id.');
  }

  const captureAmount = normalizeMoney(resource?.amount?.value);
  const localAmount = normalizeMoney(localOrder.amount);
  if (!captureAmount || captureAmount !== localAmount) {
    throw new Error('El monto PayPal no coincide con la orden local.');
  }

  const captureCurrency = `${resource?.amount?.currency_code || ''}`.trim().toUpperCase();
  const localCurrency = `${localOrder.currency || ''}`.trim().toUpperCase();
  if (!captureCurrency || captureCurrency !== localCurrency) {
    throw new Error('La moneda PayPal no coincide con la orden local.');
  }

  const customId = `${resource?.custom_id || ''}`.trim();
  if (customId && customId !== localOrder.user_id) {
    throw new Error('La usuaria PayPal no coincide con la orden local.');
  }

  return {
    captureId,
    amount: Number(captureAmount),
    currency: captureCurrency,
  };
}

async function applyCompletedCapture({ serviceClient, event, localOrder, capture }) {
  const now = new Date().toISOString();
  const existingTransaction = await findExistingTransactionByCapture(serviceClient, capture.captureId);
  const access = resolveAccessForPlan(localOrder.plan_code);

  if (!existingTransaction) {
    const { error: transactionError } = await serviceClient.from('transactions').insert({
      user_id: localOrder.user_id,
      payment_provider: 'paypal',
      provider_order_id: localOrder.paypal_order_id,
      provider_capture_id: capture.captureId,
      provider_event_id: event.id,
      amount: capture.amount,
      currency: capture.currency,
      status: 'completed',
      description: `Pago PayPal ${localOrder.plan_code}`,
      metadata: {
        plan_code: localOrder.plan_code,
        plan_type: access.isLifetime ? 'lifetime' : 'monthly',
        paypal_event_id: event.id,
        paypal_order_id: localOrder.paypal_order_id,
        paypal_capture_id: capture.captureId,
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
    .eq('id', localOrder.user_id);

  if (userError) throw userError;

  const { error: subscriptionError } = await serviceClient.from('subscriptions').upsert(
    {
      user_id: localOrder.user_id,
      plan: access.plan,
      plan_code: localOrder.plan_code,
      status: 'active',
      is_lifetime: access.isLifetime,
      access_source: access.accessSource,
      payment_provider: 'paypal',
      metadata: {
        plan_type: access.isLifetime ? 'lifetime' : 'monthly',
        paypal_event_id: event.id,
        paypal_order_id: localOrder.paypal_order_id,
        paypal_capture_id: capture.captureId,
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
      paypal_capture_id: capture.captureId,
      captured_at: now,
      updated_at: now,
    })
    .eq('id', localOrder.id);

  if (orderError) throw orderError;

  return {
    alreadyProcessed: Boolean(existingTransaction),
  };
}

async function processCaptureCompleted(serviceClient, event) {
  const resource = event?.resource || {};
  const captureId = `${resource?.id || ''}`.trim();
  if (!captureId) {
    throw new Error('Webhook PayPal sin capture_id.');
  }

  const existingTransaction = await findExistingTransactionByCapture(serviceClient, captureId);
  const localOrder = await findLocalOrder(serviceClient, resource);

  if (!localOrder) {
    throw new Error('No se encontró orden local para el capture PayPal.');
  }

  const capture = validateCaptureAgainstOrder(resource, localOrder);

  if (existingTransaction) {
    const now = new Date().toISOString();
    const { error } = await serviceClient
      .from('paypal_orders')
      .update({
        status: 'completed',
        paypal_capture_id: capture.captureId,
        captured_at: now,
        updated_at: now,
      })
      .eq('id', localOrder.id);
    if (error) throw error;
    return { alreadyProcessed: true, localOrder, capture };
  }

  const result = await applyCompletedCapture({ serviceClient, event, localOrder, capture });
  return { ...result, localOrder, capture };
}

export async function handlePayPalWebhookPayload(payload = {}, options = {}) {
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

  const eventId = `${payload?.id || ''}`.trim();
  const eventType = `${payload?.event_type || ''}`.trim();

  if (!eventId || !eventType) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        code: 'INVALID_PAYPAL_WEBHOOK',
        error: 'Webhook PayPal inválido.',
      },
    };
  }

  try {
    const verification = await verifyPayPalWebhookSignature(payload, options);
    if (!verification.ok) {
      return {
        ok: false,
        status: 401,
        body: {
          success: false,
          code: 'PAYPAL_WEBHOOK_SIGNATURE_INVALID',
          error: `Firma PayPal inválida: ${verification.reason}`,
        },
      };
    }

    const received = await recordEventReceived(serviceClient, payload);
    if (received.replay && ['processed', 'ignored'].includes(received.status)) {
      return {
        ok: true,
        status: 200,
        body: {
          success: true,
          replay: true,
          status: received.status,
        },
      };
    }

    if (eventType !== 'PAYMENT.CAPTURE.COMPLETED') {
      await patchEvent(serviceClient, eventId, {
        status: 'ignored',
        processed_at: new Date().toISOString(),
      });

      return {
        ok: true,
        status: 200,
        body: {
          success: true,
          status: 'ignored',
          eventType,
        },
      };
    }

    const result = await processCaptureCompleted(serviceClient, payload);
    await patchEvent(serviceClient, eventId, {
      status: 'processed',
      user_id: result.localOrder.user_id,
      paypal_order_id: result.localOrder.paypal_order_id,
      paypal_capture_id: result.capture.captureId,
      processed_at: new Date().toISOString(),
      error_message_sanitized: null,
    });

    return {
      ok: true,
      status: 200,
      body: {
        success: true,
        status: 'processed',
        alreadyProcessed: result.alreadyProcessed,
      },
    };
  } catch (error) {
    try {
      await patchEvent(serviceClient, eventId, {
        status: 'failed',
        error_message_sanitized: sanitizeError(error),
      });
    } catch (_) {
      // Best-effort: el 5xx permite retry de PayPal.
    }

    return {
      ok: false,
      status: 500,
      body: {
        success: false,
        code: 'PAYPAL_WEBHOOK_PROCESSING_FAILED',
        error: sanitizeError(error),
      },
    };
  }
}
