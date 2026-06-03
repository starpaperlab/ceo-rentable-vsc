-- CEO Rentable OS™
-- PayPal commercial plans: Founder Lifetime and Monthly in DOP.
-- Safe migration: no drops of tables/data, only additive columns and refreshed checks.

alter table public.users
  add column if not exists payment_provider text,
  add column if not exists access_source text,
  add column if not exists is_lifetime boolean not null default false;

alter table public.subscriptions
  add column if not exists plan text not null default 'free',
  add column if not exists is_lifetime boolean not null default false,
  add column if not exists access_source text,
  add column if not exists payment_provider text,
  add column if not exists provider_customer_id text,
  add column if not exists provider_subscription_id text;

alter table public.paypal_orders
  alter column currency set default 'DOP';

alter table public.users drop constraint if exists users_plan_check;
alter table public.users
  add constraint users_plan_check
  check (plan in ('free', 'founder', 'subscription', 'founder_lifetime', 'monthly', 'admin'));

alter table public.users drop constraint if exists users_access_source_check;
alter table public.users
  add constraint users_access_source_check
  check (access_source is null or access_source in (
    'self_signup',
    'manual_lifetime',
    'stripe_purchase',
    'manual_payment',
    'paypal',
    'paypal_payment',
    'paypal_subscription',
    'admin',
    'legacy'
  ));

alter table public.subscriptions drop constraint if exists subscriptions_plan_code_check;
alter table public.subscriptions
  add constraint subscriptions_plan_code_check
  check (plan_code in ('free', 'basico', 'pro', 'manual', 'founder', 'founder_lifetime', 'monthly'));

alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions
  add constraint subscriptions_plan_check
  check (plan in ('free', 'founder', 'subscription', 'founder_lifetime', 'monthly', 'admin'));

alter table public.subscriptions drop constraint if exists subscriptions_access_source_check;
alter table public.subscriptions
  add constraint subscriptions_access_source_check
  check (access_source is null or access_source in (
    'self_signup',
    'manual_lifetime',
    'stripe_purchase',
    'manual_payment',
    'paypal',
    'paypal_payment',
    'paypal_subscription',
    'admin',
    'legacy'
  ));

alter table public.paypal_orders drop constraint if exists paypal_orders_active_plan_check;
alter table public.paypal_orders
  add constraint paypal_orders_active_plan_check
  check (plan_code in ('founder_lifetime', 'monthly') and currency = 'DOP') not valid;

create index if not exists idx_users_paypal_current_plan
  on public.users(plan, payment_provider, has_access)
  where payment_provider = 'paypal';

create index if not exists idx_subscriptions_paypal_current_plan
  on public.subscriptions(plan_code, status, payment_provider)
  where payment_provider = 'paypal';
