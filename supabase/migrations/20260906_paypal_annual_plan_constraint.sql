-- CEO Rentable OS™
-- Fase 0.2: alinear constraints de suscripciones con la oferta comercial actual.
-- La oferta pública vigente es mensual/anual; Founder/Lifetime permanece legacy/admin-only.

alter table public.users drop constraint if exists users_plan_check;
alter table public.users
  add constraint users_plan_check
  check (plan in ('free', 'founder', 'subscription', 'founder_lifetime', 'monthly', 'annual', 'admin'));

alter table public.subscriptions drop constraint if exists subscriptions_plan_code_check;
alter table public.subscriptions
  add constraint subscriptions_plan_code_check
  check (plan_code in ('free', 'basico', 'pro', 'manual', 'founder', 'founder_lifetime', 'monthly', 'annual'));

alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions
  add constraint subscriptions_plan_check
  check (plan in ('free', 'founder', 'subscription', 'founder_lifetime', 'monthly', 'annual', 'admin'));
