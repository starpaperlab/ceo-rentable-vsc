import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const rlsMigrationUrl = new URL(
  '../../supabase/migrations/202608150001_phase_0_1_rls_admin_hardening.sql',
  import.meta.url
);
const invitationMigrationUrl = new URL(
  '../../supabase/migrations/202608150002_phase_0_1_invitation_security.sql',
  import.meta.url
);
const activateHandlerUrl = new URL('../../server/activateInvitationHandler.js', import.meta.url);
const emailHandlerUrl = new URL('../../server/sendEmailHandler.js', import.meta.url);

test('RLS migration never grants owner writes through NULL', async () => {
  const sql = await readFile(rlsMigrationUrl, 'utf8');

  assert.doesNotMatch(sql, /coalesce\s*\(\s*user_id\s*=\s*auth\.uid\(\)\s*,\s*true\s*\)/i);
  assert.match(sql, /with check \(user_id = auth\.uid\(\) or public\.is_admin\(auth\.uid\(\)\)\)/i);
  assert.match(sql, /set user_id = u\.id[\s\S]*where x\.user_id is null/i);
  assert.match(sql, /unresolved_preserved/i);
});

test('admin authority comes from public.users and signup metadata is ignored', async () => {
  const sql = await readFile(rlsMigrationUrl, 'utf8');

  assert.match(sql, /from public\.users u[\s\S]*u\.role/i);
  assert.match(sql, /create or replace function public\.handle_new_auth_user\(\)/i);
  assert.match(sql, /'user',\s*'free',\s*false,\s*'pending_payment'/i);
  assert.doesNotMatch(sql, /raw_user_meta_data\s*->>\s*'role'/i);
});

test('invitation migration enforces atomic single-use service-role claims', async () => {
  const sql = await readFile(invitationMigrationUrl, 'utf8');

  assert.match(sql, /update public\.user_invitations i[\s\S]*i\.status = 'pending'[\s\S]*returning i\.\*/i);
  assert.match(sql, /and lower\(coalesce\(i\.role, 'user'\)\) = 'user'/i);
  assert.match(sql, /i\.expires_at is not null[\s\S]*i\.expires_at > timezone\('utc', now\(\)\)/i);
  assert.match(sql, /grant execute on function public\.claim_user_invitation[\s\S]*to service_role/i);
  assert.match(sql, /server_authorization_required/i);
  assert.match(sql, /invitation_token_required/i);
});

test('handlers contain no accepted-invitation password reset or metadata authorization', async () => {
  const [activationSource, emailSource] = await Promise.all([
    readFile(activateHandlerUrl, 'utf8'),
    readFile(emailHandlerUrl, 'utf8'),
  ]);

  assert.doesNotMatch(activationSource, /updateUserById/);
  assert.doesNotMatch(activationSource, /payload\.(role|owner|company_id)/);
  assert.doesNotMatch(emailSource, /roleFromJwt/);
  assert.doesNotMatch(emailSource, /requestedScope\s*!==\s*['"]admin['"]/);
  assert.match(emailSource, /\.from\('users'\)[\s\S]*\.select\('role'\)/);
});
