-- CEO Rentable OS™
-- PayPal Phase 4: webhook event observation and idempotency.

create extension if not exists pgcrypto;

create table if not exists public.paypal_events (
  id uuid primary key default gen_random_uuid(),
  paypal_event_id text not null unique,
  event_type text not null,
  status text not null default 'received'
    check (status in ('received', 'processed', 'ignored', 'failed')),
  resource_id text,
  resource_type text,
  user_id uuid references public.users(id) on delete set null,
  paypal_order_id text,
  paypal_capture_id text,
  payload_reduced jsonb not null default '{}'::jsonb,
  error_message_sanitized text,
  first_received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_paypal_events_event_type_received
  on public.paypal_events(event_type, first_received_at desc);

create index if not exists idx_paypal_events_status_received
  on public.paypal_events(status, first_received_at desc);

create index if not exists idx_paypal_events_user_received
  on public.paypal_events(user_id, first_received_at desc);

create index if not exists idx_paypal_events_capture
  on public.paypal_events(paypal_capture_id)
  where paypal_capture_id is not null;

alter table public.paypal_events enable row level security;

drop policy if exists paypal_events_admin_select on public.paypal_events;
create policy paypal_events_admin_select
  on public.paypal_events for select
  using (public.is_admin(auth.uid()));

drop policy if exists paypal_events_admin_insert on public.paypal_events;
create policy paypal_events_admin_insert
  on public.paypal_events for insert
  with check (public.is_admin(auth.uid()));

drop policy if exists paypal_events_admin_update on public.paypal_events;
create policy paypal_events_admin_update
  on public.paypal_events for update
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
