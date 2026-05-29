-- CEO Rentable OS™
-- Observabilidad de Webhook Stripe (modo observación, sin enforcement)
-- Fecha: 2026-04-17

create extension if not exists pgcrypto;

create table if not exists public.stripe_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null,
  event_type text not null,
  livemode boolean not null,
  status text not null check (status in ('received', 'processing', 'processed', 'failed', 'ignored', 'replayed_observed')),
  attempt_count int not null default 1 check (attempt_count >= 1),
  request_id text not null,
  first_received_at timestamptz not null default now(),
  last_received_at timestamptz not null default now(),
  processing_started_at timestamptz null,
  processed_at timestamptz null,
  last_error_at timestamptz null,
  event_created_at timestamptz null,
  customer_id text null,
  subscription_id text null,
  invoice_id text null,
  payment_intent_id text null,
  charge_id text null,
  user_id uuid null,
  is_replay boolean not null default false,
  last_http_status int null,
  error_code text null,
  error_message_sanitized text null,
  payload_reduced jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint stripe_events_stripe_event_id_unique unique (stripe_event_id)
);

create index if not exists idx_stripe_events_event_type_first_received_at
  on public.stripe_events(event_type, first_received_at desc);

create index if not exists idx_stripe_events_status_first_received_at
  on public.stripe_events(status, first_received_at desc);

create index if not exists idx_stripe_events_user_id_first_received_at
  on public.stripe_events(user_id, first_received_at desc);
