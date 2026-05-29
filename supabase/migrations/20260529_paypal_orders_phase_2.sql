-- CEO Rentable OS™
-- PayPal Phase 2: store created orders before capture/access activation.

create extension if not exists pgcrypto;

create table if not exists public.paypal_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  paypal_order_id text not null unique,
  plan_code text not null,
  amount numeric(12, 2) not null,
  currency text not null default 'USD',
  status text not null default 'created',
  approval_url text,
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_paypal_orders_user_id_created_at
  on public.paypal_orders(user_id, created_at desc);

create index if not exists idx_paypal_orders_status_created_at
  on public.paypal_orders(status, created_at desc);

alter table public.paypal_orders enable row level security;

drop policy if exists paypal_orders_owner_select on public.paypal_orders;
create policy paypal_orders_owner_select
  on public.paypal_orders for select
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists paypal_orders_owner_insert on public.paypal_orders;
create policy paypal_orders_owner_insert
  on public.paypal_orders for insert
  with check (user_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists paypal_orders_owner_update on public.paypal_orders;
create policy paypal_orders_owner_update
  on public.paypal_orders for update
  using (user_id = auth.uid() or public.is_admin(auth.uid()))
  with check (user_id = auth.uid() or public.is_admin(auth.uid()));
