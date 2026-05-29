-- CEO Rentable OS™
-- P0 Stripe idempotency for business transactions
-- Fecha: 2026-04-23

alter table if exists public.transactions
  add column if not exists stripe_event_id text;

create unique index if not exists idx_transactions_stripe_event_id_unique
  on public.transactions (stripe_event_id)
  where stripe_event_id is not null;

create index if not exists idx_transactions_stripe_payment_id
  on public.transactions (stripe_payment_id);
