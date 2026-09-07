const SANDBOX_API = 'https://api-m.sandbox.paypal.com';

function json(res, status, body) {
  res.status(status).json(body);
}

async function paypalRequest(path, accessToken, options = {}) {
  const response = await fetch(`${SANDBOX_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`PAYPAL_API_${response.status}`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function getAccessToken() {
  const clientId = `${process.env.PAYPAL_CLIENT_ID || ''}`.trim();
  const clientSecret = `${process.env.PAYPAL_CLIENT_SECRET || ''}`.trim();
  if (!clientId || !clientSecret) throw new Error('PAYPAL_SERVER_CONFIG_MISSING');

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(`${SANDBOX_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw new Error('PAYPAL_AUTH_FAILED');
  return payload.access_token;
}

function planBody(productId, name, description, intervalUnit, price) {
  return {
    product_id: productId,
    name,
    description,
    status: 'ACTIVE',
    billing_cycles: [
      {
        frequency: { interval_unit: 'DAY', interval_count: 7 },
        tenure_type: 'TRIAL',
        sequence: 1,
        total_cycles: 1,
        pricing_scheme: { fixed_price: { value: '0', currency_code: 'USD' } },
      },
      {
        frequency: { interval_unit: intervalUnit, interval_count: 1 },
        tenure_type: 'REGULAR',
        sequence: 2,
        total_cycles: 0,
        pricing_scheme: { fixed_price: { value: price, currency_code: 'USD' } },
      },
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee: { value: '0', currency_code: 'USD' },
      setup_fee_failure_action: 'CONTINUE',
      payment_failure_threshold: 3,
    },
  };
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { success: false, code: 'METHOD_NOT_ALLOWED' });
  }

  if (`${process.env.PAYPAL_ENVIRONMENT || 'sandbox'}`.toLowerCase() !== 'sandbox') {
    return json(res, 403, { success: false, code: 'SANDBOX_ONLY' });
  }

  const isProtectedPreviewBootstrap =
    req.method === 'GET' &&
    process.env.VERCEL_ENV === 'preview' &&
    process.env.VERCEL_GIT_COMMIT_REF === 'audit-fase-0-2-pagos' &&
    `${req.query?.confirm || ''}` === 'create-sandbox-plans';

  if (!isProtectedPreviewBootstrap) {
    const guard = `${process.env.PAYPAL_SETUP_TOKEN || ''}`.trim();
    const supplied = `${req.headers?.['x-paypal-setup-token'] || ''}`.trim();
    if (!guard || supplied !== guard) {
      return json(res, 403, { success: false, code: 'SETUP_NOT_AUTHORIZED' });
    }
  }

  try {
    const accessToken = await getAccessToken();

    const product = await paypalRequest('/v1/catalogs/products', accessToken, {
      method: 'POST',
      body: JSON.stringify({
        name: 'CEO Rentable OS',
        description: 'Sistema de gestión empresarial CEO Rentable OS',
        type: 'SERVICE',
        category: 'SOFTWARE',
      }),
    });

    const monthly = await paypalRequest('/v1/billing/plans', accessToken, {
      method: 'POST',
      body: JSON.stringify(planBody(
        product.id,
        'CEO Rentable OS - Mensual',
        '7 días gratis, luego US$21 al mes',
        'MONTH',
        '21.00'
      )),
    });

    const annual = await paypalRequest('/v1/billing/plans', accessToken, {
      method: 'POST',
      body: JSON.stringify(planBody(
        product.id,
        'CEO Rentable OS - Anual',
        '7 días gratis, luego US$210 al año',
        'YEAR',
        '210.00'
      )),
    });

    return json(res, 200, {
      success: true,
      environment: 'sandbox',
      productId: product.id,
      monthlyPlanId: monthly.id,
      annualPlanId: annual.id,
      next: 'Save the two plan IDs as Preview environment variables, then remove/disable this bootstrap endpoint.',
    });
  } catch (error) {
    console.error('PayPal sandbox plan setup failed', error?.payload || error);
    return json(res, 500, {
      success: false,
      code: error?.message || 'PAYPAL_SETUP_FAILED',
    });
  }
}
