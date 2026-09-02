import assert from 'node:assert/strict';
import test from 'node:test';
import { loadServerModuleWithoutInstalledSupabase } from './moduleLoader.js';

const paypalModuleUrl = new URL('../../server/paypalHandler.js', import.meta.url);

function createResponse(payload, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => payload,
  };
}

function createServiceClient() {
  const state = {
    transaction: null,
    transactionInsertCount: 0,
    userUpdateCount: 0,
    subscriptionUpsertCount: 0,
    orderUpdateCount: 0,
  };

  const localOrder = {
    user_id: 'user-1',
    paypal_order_id: 'ORDER-1',
    plan_code: 'monthly',
    amount: 17,
    currency: 'USD',
    status: 'created',
  };

  const client = {
    from(table) {
      if (table === 'paypal_orders') {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({ data: localOrder, error: null }),
                };
              },
            };
          },
          update() {
            state.orderUpdateCount += 1;
            return {
              eq: async () => ({ error: null }),
            };
          },
        };
      }

      if (table === 'transactions') {
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      maybeSingle: async () => ({ data: state.transaction, error: null }),
                    };
                  },
                };
              },
            };
          },
          insert(payload) {
            state.transactionInsertCount += 1;
            state.transaction = { id: `tx-${state.transactionInsertCount}`, ...payload };
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table === 'users') {
        return {
          update() {
            state.userUpdateCount += 1;
            return {
              eq: async () => ({ error: null }),
            };
          },
        };
      }

      if (table === 'subscriptions') {
        return {
          upsert: async () => {
            state.subscriptionUpsertCount += 1;
            return { error: null };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { client, state };
}

test('repeating the same completed PayPal capture does not create a second transaction', async () => {
  const { handleCapturePayPalOrderPayload } = await loadServerModuleWithoutInstalledSupabase(paypalModuleUrl);
  const { client: serviceClient, state } = createServiceClient();

  const paypalOrder = {
    id: 'ORDER-1',
    status: 'COMPLETED',
    purchase_units: [
      {
        reference_id: 'monthly',
        payments: {
          captures: [
            {
              id: 'CAPTURE-1',
              status: 'COMPLETED',
              amount: { value: '17.00', currency_code: 'USD' },
            },
          ],
        },
      },
    ],
  };

  const fetchImpl = async (url) => {
    if (`${url}`.includes('/v1/oauth2/token')) {
      return createResponse({ access_token: 'paypal-access-token' });
    }
    if (`${url}`.includes('/v2/checkout/orders/ORDER-1')) {
      return createResponse(paypalOrder);
    }
    throw new Error(`Unexpected PayPal request: ${url}`);
  };

  const options = {
    anonClient: {
      auth: {
        getUser: async () => ({ data: { user: { id: 'user-1', email: 'user@example.com' } }, error: null }),
      },
    },
    serviceClient,
    fetchImpl,
    env: {
      PAYPAL_CLIENT_ID: 'client-id',
      PAYPAL_CLIENT_SECRET: 'client-secret',
      PAYPAL_ENVIRONMENT: 'sandbox',
    },
  };

  const first = await handleCapturePayPalOrderPayload(
    { accessToken: 'valid-token', orderId: 'ORDER-1' },
    options
  );
  const second = await handleCapturePayPalOrderPayload(
    { accessToken: 'valid-token', orderId: 'ORDER-1' },
    options
  );

  assert.equal(first.ok, true);
  assert.equal(first.body.alreadyProcessed, false);
  assert.equal(second.ok, true);
  assert.equal(second.body.alreadyProcessed, true);
  assert.equal(first.body.captureId, 'CAPTURE-1');
  assert.equal(second.body.captureId, 'CAPTURE-1');
  assert.equal(state.transactionInsertCount, 1);
  assert.equal(state.userUpdateCount, 2);
  assert.equal(state.subscriptionUpsertCount, 2);
  assert.equal(state.orderUpdateCount, 2);
});
