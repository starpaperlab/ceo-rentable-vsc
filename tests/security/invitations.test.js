import assert from 'node:assert/strict';
import test from 'node:test';
import { loadServerModuleWithoutInstalledSupabase } from './moduleLoader.js';

const activateModuleUrl = new URL('../../server/activateInvitationHandler.js', import.meta.url);
const acceptModuleUrl = new URL('../../server/acceptInvitationHandler.js', import.meta.url);

function createInvitationService({ existingProfileId = null } = {}) {
  const state = {
    status: 'pending',
    createUserCalls: 0,
    updateUserCalls: 0,
    profileUpserts: [],
    rpcCalls: [],
  };

  const invitation = {
    id: 'invite-a',
    email: 'invitee@example.com',
    full_name: 'Invitada',
    role: 'user',
    plan: 'founder',
    has_access: true,
    access_source: 'manual_lifetime',
    is_lifetime: true,
    invited_by: 'admin-a',
  };

  const serviceClient = {
    rpc: async (name, args) => {
      state.rpcCalls.push({ name, args });
      if (name === 'claim_user_invitation') {
        if (
          state.status !== 'pending' ||
          args.p_token !== 'valid-token' ||
          args.p_email !== invitation.email
        ) {
          return { data: null, error: null };
        }
        state.status = 'processing';
        return { data: { ...invitation }, error: null };
      }
      if (name === 'finalize_user_invitation') {
        if (state.status !== 'processing') return { data: false, error: null };
        state.status = 'accepted';
        return { data: true, error: null };
      }
      if (name === 'release_user_invitation_claim') {
        if (state.status === 'processing') state.status = 'pending';
        return { data: true, error: null };
      }
      return { data: null, error: new Error(`Unexpected RPC ${name}`) };
    },
    auth: {
      admin: {
        createUser: async () => {
          state.createUserCalls += 1;
          return { data: { user: { id: 'user-a' } }, error: null };
        },
        updateUserById: async () => {
          state.updateUserCalls += 1;
          return { error: null };
        },
      },
    },
    from: (table) => {
      if (table === 'users') {
        return {
          select: () => ({
            ilike: () => ({
              maybeSingle: async () => ({
                data: existingProfileId ? { id: existingProfileId } : null,
                error: null,
              }),
            }),
          }),
          upsert: async (payload) => {
            state.profileUpserts.push(payload);
            return { error: null };
          },
        };
      }
      if (table === 'audit_logs') {
        return { insert: () => Promise.resolve({ error: null }) };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { serviceClient, state };
}

test('public invitation is single-use and cannot select administrative privileges', async () => {
  const { handleActivateInvitationPayload } = await loadServerModuleWithoutInstalledSupabase(activateModuleUrl);
  const { serviceClient, state } = createInvitationService();

  const payload = {
    token: 'valid-token',
    email: 'invitee@example.com',
    password: 'secure-password',
    fullName: 'Invitada',
    role: 'admin',
    owner: 'attacker',
    company_id: 'company-b',
  };

  const first = await handleActivateInvitationPayload(payload, { serviceClient });
  const replay = await handleActivateInvitationPayload(payload, { serviceClient });

  assert.equal(first.status, 200);
  assert.equal(first.body.data.role, 'user');
  assert.equal(state.profileUpserts[0].role, 'user');
  assert.equal(state.profileUpserts[0].plan, 'founder');
  assert.equal('owner' in state.profileUpserts[0], false);
  assert.equal('company_id' in state.profileUpserts[0], false);
  assert.equal(replay.status, 410);
  assert.equal(state.createUserCalls, 1);
  assert.equal(state.updateUserCalls, 0);
  assert.equal(state.status, 'accepted');
});

test('two concurrent public requests can create only one invited account', async () => {
  const { handleActivateInvitationPayload } = await loadServerModuleWithoutInstalledSupabase(activateModuleUrl);
  const { serviceClient, state } = createInvitationService();
  const payload = {
    token: 'valid-token',
    email: 'invitee@example.com',
    password: 'secure-password',
  };

  const results = await Promise.all([
    handleActivateInvitationPayload(payload, { serviceClient }),
    handleActivateInvitationPayload(payload, { serviceClient }),
  ]);

  assert.deepEqual(results.map((result) => result.status).sort(), [200, 410]);
  assert.equal(state.createUserCalls, 1);
  assert.equal(state.status, 'accepted');
});

test('public invitation never resets an existing account password', async () => {
  const { handleActivateInvitationPayload } = await loadServerModuleWithoutInstalledSupabase(activateModuleUrl);
  const { serviceClient, state } = createInvitationService({ existingProfileId: 'existing-user' });

  const result = await handleActivateInvitationPayload(
    {
      token: 'valid-token',
      email: 'invitee@example.com',
      password: 'attacker-password',
    },
    { serviceClient }
  );

  assert.equal(result.status, 409);
  assert.equal(state.createUserCalls, 0);
  assert.equal(state.updateUserCalls, 0);
  assert.equal(state.status, 'pending');
});

test('authenticated acceptance binds the invitation to the session email and forces user role', async () => {
  const { handleAcceptInvitationPayload } = await loadServerModuleWithoutInstalledSupabase(acceptModuleUrl);
  const { serviceClient, state } = createInvitationService();
  const anonClient = {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: 'user-a',
            email: 'invitee@example.com',
            user_metadata: { role: 'admin', full_name: 'Invitada' },
          },
        },
        error: null,
      }),
    },
  };

  const mismatch = await handleAcceptInvitationPayload(
    { token: 'valid-token', email: 'other@example.com', accessToken: 'session-token' },
    { anonClient, serviceClient }
  );
  assert.equal(mismatch.status, 403);
  assert.equal(state.status, 'pending');

  const accepted = await handleAcceptInvitationPayload(
    {
      token: 'valid-token',
      email: 'invitee@example.com',
      accessToken: 'session-token',
      role: 'admin',
      company_id: 'company-b',
    },
    { anonClient, serviceClient }
  );

  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.data.role, 'user');
  assert.equal(state.profileUpserts.at(-1).role, 'user');
  assert.equal('company_id' in state.profileUpserts.at(-1), false);
  assert.equal(state.status, 'accepted');
});
