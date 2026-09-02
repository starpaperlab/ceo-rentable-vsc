import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const atomicMigrationUrl = new URL(
  '../../supabase/migrations/20260831_paypal_atomic_activation.sql',
  import.meta.url
);
const captureMigrationUrl = new URL(
  '../../supabase/migrations/20260529_paypal_capture_phase_3.sql',
  import.meta.url
);

test('completed PayPal transactions reconcile access, subscription and local order in one DB transaction', async () => {
  const sql = await readFile(atomicMigrationUrl, 'utf8');

  assert.match(sql, /create or replace function public\.apply_completed_paypal_transaction\(\)/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = public/i);
  assert.match(sql, /update public\.users[\s\S]*access_status\s*=\s*'active'/i);
  assert.match(sql, /insert into public\.subscriptions/i);
  assert.match(sql, /update public\.paypal_orders/i);
  assert.match(sql, /raise exception 'PayPal transaction user not found'/i);
  assert.match(sql, /raise exception 'PayPal local order not found for completed transaction'/i);
  assert.match(sql, /after insert on public\.transactions/i);
  assert.match(sql, /when \(new\.payment_provider = 'paypal' and new\.status = 'completed'\)/i);
});

test('PayPal capture idempotency remains backed by a database unique index', async () => {
  const sql = await readFile(captureMigrationUrl, 'utf8');

  assert.match(sql, /create unique index if not exists idx_transactions_provider_capture_unique/i);
  assert.match(sql, /public\.transactions\(payment_provider, provider_capture_id\)/i);
});
