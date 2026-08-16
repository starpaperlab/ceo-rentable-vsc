import assert from 'node:assert/strict';
import test from 'node:test';
import { loadServerModuleWithoutInstalledSupabase } from './moduleLoader.js';

const emailModuleUrl = new URL('../../server/sendEmailHandler.js', import.meta.url);

function createAuthClients(databaseRole) {
  const anonClient = {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: 'user-a',
            email: 'user@example.com',
            app_metadata: { role: 'admin' },
            user_metadata: { role: 'admin' },
          },
        },
        error: null,
      }),
    },
  };

  const serviceClient = {
    from: (table) => {
      assert.equal(table, 'users');
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { role: databaseRole }, error: null }),
          }),
        }),
      };
    },
  };

  return { anonClient, serviceClient };
}

test('missing or invalid JWTs use a controlled public authentication contract', async () => {
  const { handleSendEmailPayload } = await loadServerModuleWithoutInstalledSupabase(emailModuleUrl);
  const cases = [
    {
      name: 'missing',
      token: '',
      getUser: async () => {
        throw new Error('AUTH_GET_USER_SHOULD_NOT_RUN');
      },
    },
    {
      name: 'malformed',
      token: 'abc',
      getUser: async () => ({
        data: { user: null },
        error: new Error(
          'invalid JWT: unable to parse or verify signature, token is malformed: token contains an invalid number of segments'
        ),
      }),
    },
    {
      name: 'invalid',
      token: 'invalid-token',
      getUser: async () => ({
        data: { user: null },
        error: new Error('JWT_SIGNATURE_CANARY_SHOULD_NOT_LEAK'),
      }),
    },
    {
      name: 'expired',
      token: 'expired-token',
      getUser: async () => ({
        data: { user: null },
        error: new Error('JWT_EXPIRED_CANARY_SHOULD_NOT_LEAK'),
      }),
    },
    {
      name: 'auth provider exception',
      token: 'provider-error-token',
      getUser: async () => {
        throw new Error('AUTH_INTERNAL_CANARY_SHOULD_NOT_LEAK');
      },
    },
  ];

  for (const testCase of cases) {
    let resendCalls = 0;
    const result = await handleSendEmailPayload(
      {
        accessToken: testCase.token,
        scope: 'admin',
        user_metadata: { role: 'admin' },
        app_metadata: { role: 'admin' },
        to: 'recipient@example.com',
        subject: 'Unauthorized',
        text: 'Unauthorized',
      },
      {
        anonClient: { auth: { getUser: testCase.getUser } },
        env: { RESEND_API_KEY: 'test-only-key' },
        fetchImpl: async () => {
          resendCalls += 1;
          return { ok: true, json: async () => ({ id: 'message-a' }) };
        },
      }
    );

    const serializedBody = JSON.stringify(result.body);
    assert.equal(result.status, 401, testCase.name);
    assert.equal(result.body.code, 'EMAIL_SEND_UNAUTHORIZED', testCase.name);
    assert.equal(
      result.body.error,
      testCase.name === 'missing'
        ? 'Debes iniciar sesión para enviar correos.'
        : 'Sesión inválida o expirada.',
      testCase.name
    );
    assert.equal(resendCalls, 0, testCase.name);
    assert.doesNotMatch(
      serializedBody,
      /invalid JWT|signature|malformed|segments|JWT_SIGNATURE_CANARY|JWT_EXPIRED_CANARY|AUTH_INTERNAL_CANARY|AUTH_GET_USER_SHOULD_NOT_RUN/i,
      testCase.name
    );
  }
});

test('normal database user cannot use send-email despite scope or JWT metadata', async () => {
  const { handleSendEmailPayload } = await loadServerModuleWithoutInstalledSupabase(emailModuleUrl);
  const { anonClient, serviceClient } = createAuthClients('user');
  let resendCalls = 0;

  const result = await handleSendEmailPayload(
    {
      accessToken: 'session-token',
      scope: 'user',
      action: 'send_email',
      to: 'victim@example.com',
      subject: 'Unauthorized',
      html: '<p>Unauthorized</p>',
    },
    {
      anonClient,
      serviceClient,
      env: { RESEND_API_KEY: 'test-only-key', RESEND_FROM_EMAIL: 'sender@example.com' },
      fetchImpl: async () => {
        resendCalls += 1;
        return { ok: true, json: async () => ({ id: 'message-a' }) };
      },
    }
  );

  assert.equal(result.status, 403);
  assert.equal(result.body.code, 'EMAIL_SEND_UNAUTHORIZED');
  assert.equal(resendCalls, 0);
});

test('only public.users.role admin can use the existing administrative sender', async () => {
  const { handleSendEmailPayload } = await loadServerModuleWithoutInstalledSupabase(emailModuleUrl);
  const { anonClient, serviceClient } = createAuthClients('admin');
  let resendCalls = 0;

  const result = await handleSendEmailPayload(
    {
      accessToken: 'session-token',
      scope: 'user',
      action: 'send_email',
      to: 'recipient@example.com',
      subject: 'Authorized',
      html: '<p>Authorized</p>',
    },
    {
      anonClient,
      serviceClient,
      env: { RESEND_API_KEY: 'test-only-key', RESEND_FROM_EMAIL: 'sender@example.com' },
      fetchImpl: async () => {
        resendCalls += 1;
        return { ok: true, json: async () => ({ id: 'message-a' }) };
      },
    }
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(resendCalls, 1);
});

test('successful Resend responses expose only the allowlisted message id', async () => {
  const { handleSendEmailPayload } = await loadServerModuleWithoutInstalledSupabase(emailModuleUrl);
  const { anonClient, serviceClient } = createAuthClients('admin');

  const result = await handleSendEmailPayload(
    {
      accessToken: 'session-token',
      action: 'send_email',
      to: 'recipient@example.com',
      subject: 'Authorized',
      text: 'Authorized',
    },
    {
      anonClient,
      serviceClient,
      env: { RESEND_API_KEY: 'test-only-key' },
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'fake-message-id',
          stack: 'STACK_CANARY_SHOULD_NOT_LEAK',
          secret: 'SECRET_CANARY_SHOULD_NOT_LEAK',
          internal_debug: { token: 'INTERNAL_TOKEN_CANARY' },
        }),
      }),
    }
  );

  const serializedBody = JSON.stringify(result.body);
  assert.equal(result.status, 200);
  assert.equal('headers' in result, false);
  assert.deepEqual(Object.keys(result.body).sort(), ['messageId', 'success']);
  assert.equal(result.body.messageId, 'fake-message-id');
  assert.doesNotMatch(serializedBody, /STACK_CANARY_SHOULD_NOT_LEAK/);
  assert.doesNotMatch(serializedBody, /SECRET_CANARY_SHOULD_NOT_LEAK/);
  assert.doesNotMatch(serializedBody, /INTERNAL_TOKEN_CANARY/);
  assert.doesNotMatch(serializedBody, /internal_debug|provider/);
});

test('failed or thrown Resend responses use a sanitized public contract', async () => {
  const { handleSendEmailPayload } = await loadServerModuleWithoutInstalledSupabase(emailModuleUrl);
  const { anonClient, serviceClient } = createAuthClients('admin');
  const request = {
    accessToken: 'session-token',
    action: 'send_email',
    to: 'recipient@example.com',
    subject: 'Authorized',
    text: 'Authorized',
  };
  const options = {
    anonClient,
    serviceClient,
    env: { RESEND_API_KEY: 'test-only-key' },
  };

  const returnedError = await handleSendEmailPayload(request, {
    ...options,
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      json: async () => ({
        message: 'STACK_ERROR_CANARY',
        secret: 'SECRET_ERROR_CANARY',
        internal_debug: { token: 'INTERNAL_ERROR_TOKEN_CANARY' },
      }),
    }),
  });
  const thrownError = await handleSendEmailPayload(request, {
    ...options,
    fetchImpl: async () => {
      throw new Error(
        'STACK_ERROR_CANARY SECRET_ERROR_CANARY INTERNAL_ERROR_TOKEN_CANARY'
      );
    },
  });

  for (const result of [returnedError, thrownError]) {
    const serializedBody = JSON.stringify(result.body);
    assert.equal(result.status, 503);
    assert.equal('headers' in result, false);
    assert.deepEqual(Object.keys(result.body).sort(), ['code', 'error', 'success']);
    assert.equal(result.body.code, 'RESEND_ERROR');
    assert.equal(result.body.error, 'No fue posible enviar el email en este momento.');
    assert.doesNotMatch(serializedBody, /STACK_ERROR_CANARY/);
    assert.doesNotMatch(serializedBody, /SECRET_ERROR_CANARY/);
    assert.doesNotMatch(serializedBody, /INTERNAL_ERROR_TOKEN_CANARY/);
    assert.doesNotMatch(serializedBody, /internal_debug|provider/);
  }
});

test('authorization lookup failure denies email and never calls Resend', async () => {
  const { handleSendEmailPayload } = await loadServerModuleWithoutInstalledSupabase(emailModuleUrl);
  const { anonClient } = createAuthClients('admin');
  const serviceClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: new Error('database unavailable') }),
        }),
      }),
    }),
  };
  let resendCalls = 0;

  const result = await handleSendEmailPayload(
    {
      accessToken: 'session-token',
      scope: 'admin',
      to: 'recipient@example.com',
      subject: 'Denied',
      text: 'Denied',
    },
    {
      anonClient,
      serviceClient,
      env: { RESEND_API_KEY: 'test-only-key' },
      fetchImpl: async () => {
        resendCalls += 1;
        return { ok: true, json: async () => ({ id: 'message-a' }) };
      },
    }
  );

  assert.equal(result.status, 403);
  assert.equal(resendCalls, 0);
});
