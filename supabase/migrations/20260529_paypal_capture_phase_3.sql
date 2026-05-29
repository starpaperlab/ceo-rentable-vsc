-- CEO Rentable OS™
-- PayPal Phase 3: capture bookkeeping, idempotency, and access activation support.

alter table public.users
  add column if not exists payment_provider text,
  add column if not exists provider_customer_id text;

alter table public.subscriptions
  add column if not exists payment_provider text,
  add column if not exists provider_customer_id text,
  add column if not exists provider_subscription_id text;

alter table public.transactions
  add column if not exists payment_provider text,
  add column if not exists provider_order_id text,
  add column if not exists provider_capture_id text,
  add column if not exists provider_event_id text;

alter table public.paypal_orders
  add column if not exists paypal_capture_id text;

create unique index if not exists idx_transactions_provider_capture_unique
  on public.transactions(payment_provider, provider_capture_id)
  where payment_provider is not null and provider_capture_id is not null;

create index if not exists idx_transactions_provider_order
  on public.transactions(payment_provider, provider_order_id)
  where payment_provider is not null and provider_order_id is not null;

create index if not exists idx_users_payment_provider
  on public.users(payment_provider);

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.transactions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.transactions drop constraint if exists %I', c.conname);
  end loop;
end $$;

alter table public.transactions
  add constraint transactions_status_check
  check (status in ('pending', 'succeeded', 'completed', 'failed', 'refunded', 'canceled'));

do $$
begin
  alter table public.users drop constraint if exists users_access_source_check;

  alter table public.users
    add constraint users_access_source_check
    check (access_source in (
      'self_signup',
      'manual_lifetime',
      'stripe_purchase',
      'manual_payment',
      'paypal_payment',
      'paypal_subscription',
      'admin',
      'legacy'
    ));
exception
  when undefined_column then
    null;
end $$;
