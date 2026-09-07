import assert from 'node:assert/strict';
import test from 'node:test';
import { loadServerModuleWithoutInstalledSupabase } from './moduleLoader.js';

const paypalModuleUrl = new URL('../../server/paypalHandler.js', import.meta.url);

function response(payload, ok = false, status = 401) {
  return { ok, status, json: async () => payload };
}

test('create-order never exposes PayPal OAuth provider details', async () => {
  const { handleCreatePayPalOrderPayload } = await loadServerModuleWithoutInstalledSupabase(paypalModuleUrl);
  const result = await handleCreatePayPalOrderPayload(
    { accessToken: 'valid-token', plan: 'monthly' },
    {
      anonClient: {
        auth: {
          getUser: async () => ({ data: { user: { id: 'user-1', email: 'u@example.com' } }, error: null }),
        },
      },
      env: {
        PAYPAL_CLIENT_ID: 'client-id',
        PAYPAL_CLIENT_SECRET: 'client-secret',
      },
      fetchImpl: async () => response({ error_description: 'PAYPAL_PRIVATE_OAUTH_CANARY' }),
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.body.code, 'PAYPAL_AUTH_FAILED');
  assert.equal(result.body.error, 'No se pudo conectar con el proveedor de pagos.');
  assert.doesNotMatch(JSON.stringify(result.body), /PAYPAL_PRIVATE_OAUTH_CANARY/i);
});

test('capture never exposes PayPal OAuth provider details', async () => {
  const { handleCapturePayPalOrderPayload } = await loadServerModuleWithoutInstalledSupabase(paypalModuleUrl);
  const serviceClient = {
    from(table) {
      if (table !== 'paypal_orders') throw new Error(`Unexpected table: ${table}`);
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({
                  data: {
                    user_id: 'user-1',
                    paypal_order_id: 'ORDER-1',
                    plan_code: 'monthly',
                    amount: 1497,
                    currency: 'DOP',
                  },
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  };

  const result = await handleCapturePayPalOrderPayload(
    { accessToken: 'valid-token', orderId: 'ORDER-1' },
    {
      anonClient: {
        auth: {
          getUser: async () => ({ data: { user: { id: 'user-1', email: 'u@example.com' } }, error: null }),
        },
      },
      serviceClient,
      env: {
        PAYPAL_CLIENT_ID: 'client-id',
        PAYPAL_CLIENT_SECRET: 'client-secret',
      },
      fetchImpl: async () => response({ error_description: 'PAYPAL_PRIVATE_CAPTURE_OAUTH_CANARY' }),
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.body.code, 'PAYPAL_AUTH_FAILED');
  assert.equal(result.body.error, 'No se pudo conectar con el proveedor de pagos.');
  assert.doesNotMatch(JSON.stringify(result.body), /PAYPAL_PRIVATE_CAPTURE_OAUTH_CANARY/i);
});
