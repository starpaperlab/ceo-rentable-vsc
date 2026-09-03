create table if not exists public.paypal_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  paypal_subscription_id text not null unique,
  paypal_plan_id text not null,
  plan_code text not null check (plan_code in ('monthly', 'annual')),
  status text not null default 'pending_checkout',
  payer_email text,
  start_time timestamptz,
  next_billing_time timestamptz,
  raw_provider_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists paypal_subscriptions_user_id_idx
  on public.paypal_subscriptions(user_id);

create index if not exists paypal_subscriptions_status_idx
  on public.paypal_subscriptions(status);

alter table public.paypal_subscriptions enable row level security;

drop policy if exists "Users can read own PayPal subscriptions" on public.paypal_subscriptions;
create policy "Users can read own PayPal subscriptions"
  on public.paypal_subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

comment on table public.paypal_subscriptions is
  'Phase 0.2 source of persisted PayPal recurring subscription identifiers and lifecycle state. Writes are performed server-side with the service role.';
