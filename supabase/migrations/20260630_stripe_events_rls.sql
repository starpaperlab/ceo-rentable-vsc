-- CEO Rentable OS
-- Security hardening: stripe_events is internal webhook observability.
-- No anon/authenticated app user should read or mutate this table directly.

alter table if exists public.stripe_events enable row level security;

revoke all on table public.stripe_events from anon;
revoke all on table public.stripe_events from authenticated;
revoke all on table public.stripe_events from public;

grant all on table public.stripe_events to service_role;

comment on table public.stripe_events is
  'Internal Stripe webhook observability table. RLS enabled; direct anon/authenticated access intentionally denied. Backend/service_role only.';
