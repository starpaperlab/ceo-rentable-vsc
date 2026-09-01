import assert from 'node:assert/strict';
import test from 'node:test';
import { loadServerModuleWithoutInstalledSupabase } from './moduleLoader.js';

const paypalModuleUrl = new URL('../../server/paypalHandler.js', import.meta.url);

test('PayPal create-order authentication never leaks JWT/provider details', async () => {
  const { handleCreatePayPalOrderPayload } = await loadServerModuleWithoutInstalledSupabase(paypalModuleUrl);
  const cases = [
    {
      name: 'missing',
      token: '',
      getUser: async () => { throw new Error('AUTH_SHOULD_NOT_RUN'); },
      expected: 'Debes iniciar sesión para continuar al pago.',
    },
    {
      name: 'invalid',
      token: 'invalid-token',
      getUser: async () => ({ data: { user: null }, error: new Error('JWT_SIGNATURE_CANARY_SHOULD_NOT_LEAK') }),
      expected: 'Sesión inválida o expirada.',
    },
    {
      name: 'provider exception',
      token: 'provider-error-token',
      getUser: async () => { throw new Error('AUTH_INTERNAL_CANARY_SHOULD_NOT_LEAK'); },
      expected: 'Sesión inválida o expirada.',
    },
  ];

  for (const testCase of cases) {
    const result = await handleCreatePayPalOrderPayload(
      { accessToken: testCase.token, plan: 'monthly' },
      {
        anonClient: { auth: { getUser: testCase.getUser } },
        env: {},
        fetchImpl: async () => { throw new Error('PAYPAL_SHOULD_NOT_RUN'); },
      }
    );

    const serialized = JSON.stringify(result.body);
    assert.equal(result.status, 401, testCase.name);
    assert.equal(result.body.code, 'PAYPAL_ORDER_UNAUTHORIZED', testCase.name);
    assert.equal(result.body.error, testCase.expected, testCase.name);
    assert.doesNotMatch(serialized, /JWT_SIGNATURE_CANARY|AUTH_INTERNAL_CANARY|AUTH_SHOULD_NOT_RUN|invalid JWT|signature/i, testCase.name);
  }
});

test('PayPal capture authentication uses the same controlled public contract', async () => {
  const { handleCapturePayPalOrderPayload } = await loadServerModuleWithoutInstalledSupabase(paypalModuleUrl);
  const result = await handleCapturePayPalOrderPayload(
    { accessToken: 'expired-token', orderId: 'ORDER-1' },
    {
      anonClient: {
        auth: {
          getUser: async () => ({ data: { user: null }, error: new Error('JWT_EXPIRED_PRIVATE_DETAIL') }),
        },
      },
      env: {},
    }
  );

  assert.equal(result.status, 401);
  assert.equal(result.body.code, 'PAYPAL_CAPTURE_UNAUTHORIZED');
  assert.equal(result.body.error, 'Sesión inválida o expirada.');
  assert.doesNotMatch(JSON.stringify(result.body), /JWT_EXPIRED_PRIVATE_DETAIL/i);
});
