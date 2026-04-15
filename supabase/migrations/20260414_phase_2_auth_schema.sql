-- ============================================================
-- CEO RENTABLE OS™
-- FASE 2 · SUPABASE + AUTH + RLS
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- HELPERS
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.sync_owned_record_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    new.user_id = auth.uid();
  end if;

  if new.created_by is null and new.user_id is not null then
    select email
      into new.created_by
      from public.users
     where id = new.user_id;
  end if;

  if new.created_at is null then
    new.created_at = timezone('utc', now());
  end if;

  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ============================================================
-- USERS / AUTH PROFILE
-- ============================================================

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  phone text,
  business_name text,
  avatar_url text,
  role text not null default 'user' check (role in ('admin', 'user')),
  plan text not null default 'free' check (plan in ('free', 'founder', 'subscription', 'admin')),
  has_access boolean not null default false,
  onboarding_completed boolean not null default false,
  luna_access boolean not null default false,
  automatizaciones_access boolean not null default false,
  nuevas_funciones_access boolean not null default false,
  currency text not null default 'USD',
  timezone text not null default 'America/Santo_Domingo',
  stripe_customer_id text unique,
  stripe_session_id text,
  last_login_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_users_role on public.users(role);
create index if not exists idx_users_plan on public.users(plan);
create index if not exists idx_users_has_access on public.users(has_access);

create or replace function public.is_admin(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
      from public.users
     where id = target_user_id
       and role = 'admin'
  );
$$;

create or replace function public.handle_user_profile_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.email = lower(trim(new.email));

  if tg_op = 'INSERT' then
    if auth.uid() is not null and not public.is_admin() and new.id <> auth.uid() then
      raise exception 'No puedes crear perfiles para otra usuaria.';
    end if;

    if auth.uid() is not null and not public.is_admin() then
      new.role = 'user';
      new.plan = 'free';
      new.has_access = false;
      new.luna_access = false;
      new.automatizaciones_access = false;
      new.nuevas_funciones_access = false;
    end if;
  end if;

  if tg_op = 'UPDATE' and auth.uid() is not null and not public.is_admin() then
    new.id = old.id;
    new.email = old.email;
    new.role = old.role;
    new.plan = old.plan;
    new.has_access = old.has_access;
    new.luna_access = old.luna_access;
    new.automatizaciones_access = old.automatizaciones_access;
    new.nuevas_funciones_access = old.nuevas_funciones_access;
    new.stripe_customer_id = old.stripe_customer_id;
    new.stripe_session_id = old.stripe_session_id;
  end if;

  if new.role = 'admin' then
    new.has_access = true;
    new.plan = 'admin';
  end if;

  if new.created_at is null then
    new.created_at = timezone('utc', now());
  end if;

  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_users_defaults on public.users;
create trigger trg_users_defaults
before insert or update on public.users
for each row
execute function public.handle_user_profile_defaults();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (
    id,
    email,
    full_name,
    phone,
    role,
    plan,
    has_access,
    onboarding_completed,
    currency,
    timezone,
    created_at,
    updated_at
  )
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'phone',
    case
      when new.raw_user_meta_data ->> 'role' = 'admin' then 'admin'
      else 'user'
    end,
    case
      when new.raw_user_meta_data ->> 'role' = 'admin' then 'admin'
      when new.raw_user_meta_data ->> 'plan' in ('founder', 'subscription') then new.raw_user_meta_data ->> 'plan'
      else 'free'
    end,
    case
      when new.raw_user_meta_data ->> 'role' = 'admin' then true
      else coalesce((new.raw_user_meta_data ->> 'has_access')::boolean, false)
    end,
    coalesce((new.raw_user_meta_data ->> 'onboarding_completed')::boolean, false),
    coalesce(new.raw_user_meta_data ->> 'currency', 'USD'),
    coalesce(new.raw_user_meta_data ->> 'timezone', 'America/Santo_Domingo'),
    timezone('utc', now()),
    timezone('utc', now())
  )
  on conflict (id) do update
     set email = excluded.email,
         full_name = coalesce(public.users.full_name, excluded.full_name),
         phone = coalesce(public.users.phone, excluded.phone),
         updated_at = timezone('utc', now());

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

-- ============================================================
-- CORE BUSINESS TABLES
-- ============================================================

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan_code text not null default 'free' check (plan_code in ('free', 'basico', 'pro', 'manual', 'founder')),
  status text not null default 'inactive' check (status in ('inactive', 'trialing', 'active', 'past_due', 'canceled', 'expired', 'incomplete')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  stripe_payment_id text,
  stripe_invoice_id text,
  amount numeric(12, 2) not null default 0,
  currency text not null default 'USD',
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'refunded', 'canceled')),
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  created_by text,
  name text not null,
  sku text,
  descripcion text,
  sale_price numeric(12, 2) not null default 0,
  costo_unitario numeric(12, 2) not null default 0,
  margin_pct numeric(8, 2) default 0,
  current_stock integer not null default 0,
  min_stock_alert integer not null default 0,
  unit text not null default 'unidad',
  product_type text not null default 'fisico' check (product_type in ('fisico', 'digital', 'servicio')),
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive', 'analysis', 'approved', 'en_analisis')),
  cac numeric(12, 2) default 0,
  net_profit numeric(12, 2) default 0,
  service_hours numeric(12, 2) default 0,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_products_user_id on public.products(user_id);
create index if not exists idx_products_created_by on public.products(created_by);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  created_by text,
  name text not null,
  email text,
  phone text,
  status text not null default 'new' check (status in ('new', 'recurring', 'vip', 'inactive')),
  total_billed numeric(12, 2) not null default 0,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_clients_user_id on public.clients(user_id);
create index if not exists idx_clients_created_by on public.clients(created_by);

create table if not exists public.business_config (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  created_by text,
  business_name text,
  logo_url text,
  brand_color text default '#D45387',
  font_family text default 'Montserrat',
  fiscal_name text,
  fiscal_id text,
  fiscal_address text,
  currency text not null default 'USD',
  timezone text not null default 'America/Santo_Domingo',
  quarterly_goal numeric(12, 2) not null default 0,
  target_margin_pct numeric(5, 2) not null default 40,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.monthly_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  created_by text,
  month text not null,
  income numeric(12, 2) not null default 0,
  expenses numeric(12, 2) not null default 0,
  profit numeric(12, 2) not null default 0,
  margin_pct numeric(8, 2) not null default 0,
  notes text,
  is_closed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint monthly_records_month_format check (month ~ '^\d{4}-\d{2}$')
);

create unique index if not exists idx_monthly_records_user_month on public.monthly_records(user_id, month);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  created_by text,
  invoice_number text not null,
  date date not null default current_date,
  due_date date,
  client_id uuid references public.clients(id) on delete set null,
  client_name text,
  client_email text,
  client_phone text,
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric(12, 2) not null default 0,
  tax_enabled boolean not null default false,
  tax_pct numeric(5, 2) not null default 0,
  tax_amount numeric(12, 2) not null default 0,
  total_final numeric(12, 2) not null default 0,
  total_ingresos numeric(12, 2) not null default 0,
  total_costos numeric(12, 2) not null default 0,
  total_ganancia numeric(12, 2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'paid', 'canceled', 'overdue')),
  notes text,
  company_name text,
  logo_url text,
  brand_color text default '#D45387',
  font_family text default 'Montserrat',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_invoices_user_number on public.invoices(user_id, invoice_number);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  created_by text,
  quote_number text not null,
  date date not null default current_date,
  due_date date,
  client_id uuid references public.clients(id) on delete set null,
  client_name text,
  client_email text,
  client_phone text,
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric(12, 2) not null default 0,
  tax_enabled boolean not null default false,
  tax_pct numeric(5, 2) not null default 0,
  tax_amount numeric(12, 2) not null default 0,
  total_final numeric(12, 2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  notes text,
  company_name text,
  logo_url text,
  brand_color text default '#D45387',
  font_family text default 'Montserrat',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_quotes_user_number on public.quotes(user_id, quote_number);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  created_by text,
  product_name text not null,
  product_type text not null default 'fisico' check (product_type in ('fisico', 'digital', 'servicio')),
  descripcion text,
  sku text,
  costo_unitario numeric(12, 2) not null default 0,
  sale_price numeric(12, 2) not null default 0,
  current_stock numeric(12, 2) not null default 0,
  min_stock_alert numeric(12, 2) not null default 0,
  unit text not null default 'unidad',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_inventory_items_user_id on public.inventory_items(user_id);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  created_by text,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  product_name text not null,
  invoice_number text,
  type text not null check (type in ('entrada', 'salida', 'ajuste')),
  quantity numeric(12, 2) not null default 0,
  reason text,
  date date not null default current_date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_inventory_movements_user_id on public.inventory_movements(user_id);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  created_by text,
  client_name text not null,
  client_phone text,
  service_type text not null,
  date date not null,
  time text,
  price numeric(12, 2) not null default 0,
  status text not null default 'programado' check (status in ('programado', 'confirmado', 'en_proceso', 'completado', 'cancelado')),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.product_analysis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  created_by text,
  name text not null,
  sale_price numeric(12, 2) not null default 0,
  cost numeric(12, 2) not null default 0,
  margin_pct numeric(8, 2) not null default 0,
  product_type text not null default 'fisico' check (product_type in ('fisico', 'digital', 'servicio')),
  status text not null default 'analysis' check (status in ('analysis', 'approved', 'rejected', 'synced')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  created_by text,
  report_type text not null check (report_type in ('inventory', 'profitability', 'sales', 'clients', 'alerts')),
  filters jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  file_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  created_by text,
  type text not null,
  title text not null,
  message text not null,
  leida boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- ============================================================
-- EMAILS / CRM / ADMIN
-- ============================================================

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  subject text not null,
  html_content text not null,
  text_content text,
  variables jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  template_id uuid references public.email_templates(id) on delete set null,
  to_email text not null,
  subject text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error_message text,
  sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_email_logs_user_id on public.email_logs(user_id);

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.users(id) on delete cascade,
  template_id uuid not null references public.email_templates(id) on delete cascade,
  name text not null,
  description text,
  target_plan text,
  status text not null default 'draft' check (status in ('draft', 'sending', 'completed', 'failed')),
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.users(id) on delete set null,
  target_user_id uuid references public.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  source text not null default 'diagnostico',
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'converted', 'lost')),
  monthly_sales text,
  knows_margin boolean,
  controls_costs boolean,
  knows_best_product boolean,
  ceo_score numeric(5, 2),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- ============================================================
-- TRIGGERS FOR UPDATED_AT / OWNERSHIP
-- ============================================================

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions;
create trigger trg_subscriptions_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();

drop trigger if exists trg_transactions_updated_at on public.transactions;
create trigger trg_transactions_updated_at before update on public.transactions for each row execute function public.set_updated_at();

drop trigger if exists trg_products_metadata on public.products;
create trigger trg_products_metadata before insert or update on public.products for each row execute function public.sync_owned_record_metadata();

drop trigger if exists trg_clients_metadata on public.clients;
create trigger trg_clients_metadata before insert or update on public.clients for each row execute function public.sync_owned_record_metadata();

drop trigger if exists trg_business_config_metadata on public.business_config;
create trigger trg_business_config_metadata before insert or update on public.business_config for each row execute function public.sync_owned_record_metadata();

drop trigger if exists trg_monthly_records_metadata on public.monthly_records;
create trigger trg_monthly_records_metadata before insert or update on public.monthly_records for each row execute function public.sync_owned_record_metadata();

drop trigger if exists trg_invoices_metadata on public.invoices;
create trigger trg_invoices_metadata before insert or update on public.invoices for each row execute function public.sync_owned_record_metadata();

drop trigger if exists trg_quotes_metadata on public.quotes;
create trigger trg_quotes_metadata before insert or update on public.quotes for each row execute function public.sync_owned_record_metadata();

drop trigger if exists trg_inventory_items_metadata on public.inventory_items;
create trigger trg_inventory_items_metadata before insert or update on public.inventory_items for each row execute function public.sync_owned_record_metadata();

drop trigger if exists trg_inventory_movements_metadata on public.inventory_movements;
create trigger trg_inventory_movements_metadata before insert or update on public.inventory_movements for each row execute function public.sync_owned_record_metadata();

drop trigger if exists trg_appointments_metadata on public.appointments;
create trigger trg_appointments_metadata before insert or update on public.appointments for each row execute function public.sync_owned_record_metadata();

drop trigger if exists trg_product_analysis_metadata on public.product_analysis;
create trigger trg_product_analysis_metadata before insert or update on public.product_analysis for each row execute function public.sync_owned_record_metadata();

drop trigger if exists trg_reports_metadata on public.reports;
create trigger trg_reports_metadata before insert or update on public.reports for each row execute function public.sync_owned_record_metadata();

drop trigger if exists trg_alerts_metadata on public.alerts;
create trigger trg_alerts_metadata before insert or update on public.alerts for each row execute function public.sync_owned_record_metadata();

drop trigger if exists trg_email_templates_updated_at on public.email_templates;
create trigger trg_email_templates_updated_at before update on public.email_templates for each row execute function public.set_updated_at();

drop trigger if exists trg_email_logs_updated_at on public.email_logs;
create trigger trg_email_logs_updated_at before update on public.email_logs for each row execute function public.set_updated_at();

drop trigger if exists trg_email_campaigns_updated_at on public.email_campaigns;
create trigger trg_email_campaigns_updated_at before update on public.email_campaigns for each row execute function public.set_updated_at();

drop trigger if exists trg_audit_logs_updated_at on public.audit_logs;
create trigger trg_audit_logs_updated_at before update on public.audit_logs for each row execute function public.set_updated_at();

drop trigger if exists trg_leads_updated_at on public.leads;
create trigger trg_leads_updated_at before update on public.leads for each row execute function public.set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.users enable row level security;
alter table public.subscriptions enable row level security;
alter table public.transactions enable row level security;
alter table public.products enable row level security;
alter table public.clients enable row level security;
alter table public.business_config enable row level security;
alter table public.monthly_records enable row level security;
alter table public.invoices enable row level security;
alter table public.quotes enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.appointments enable row level security;
alter table public.product_analysis enable row level security;
alter table public.reports enable row level security;
alter table public.alerts enable row level security;
alter table public.email_templates enable row level security;
alter table public.email_logs enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.audit_logs enable row level security;
alter table public.leads enable row level security;

-- Users
drop policy if exists users_select_own_or_admin on public.users;
create policy users_select_own_or_admin on public.users
for select
using (id = auth.uid() or public.is_admin());

drop policy if exists users_insert_own_profile on public.users;
create policy users_insert_own_profile on public.users
for insert
with check (id = auth.uid() or public.is_admin());

drop policy if exists users_update_own_or_admin on public.users;
create policy users_update_own_or_admin on public.users
for update
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

drop policy if exists users_delete_admin_only on public.users;
create policy users_delete_admin_only on public.users
for delete
using (public.is_admin());

-- Generic owner tables
drop policy if exists subscriptions_owner_select on public.subscriptions;
create policy subscriptions_owner_select on public.subscriptions for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists subscriptions_owner_insert on public.subscriptions;
create policy subscriptions_owner_insert on public.subscriptions for insert with check (user_id = auth.uid() or public.is_admin());
drop policy if exists subscriptions_owner_update on public.subscriptions;
create policy subscriptions_owner_update on public.subscriptions for update using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists subscriptions_owner_delete on public.subscriptions;
create policy subscriptions_owner_delete on public.subscriptions for delete using (user_id = auth.uid() or public.is_admin());

drop policy if exists transactions_owner_select on public.transactions;
create policy transactions_owner_select on public.transactions for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists transactions_owner_insert on public.transactions;
create policy transactions_owner_insert on public.transactions for insert with check (user_id = auth.uid() or public.is_admin());
drop policy if exists transactions_owner_update on public.transactions;
create policy transactions_owner_update on public.transactions for update using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists transactions_owner_delete on public.transactions;
create policy transactions_owner_delete on public.transactions for delete using (user_id = auth.uid() or public.is_admin());

drop policy if exists products_owner_select on public.products;
create policy products_owner_select on public.products for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists products_owner_insert on public.products;
create policy products_owner_insert on public.products for insert with check (user_id = auth.uid() or public.is_admin());
drop policy if exists products_owner_update on public.products;
create policy products_owner_update on public.products for update using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists products_owner_delete on public.products;
create policy products_owner_delete on public.products for delete using (user_id = auth.uid() or public.is_admin());

drop policy if exists clients_owner_select on public.clients;
create policy clients_owner_select on public.clients for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists clients_owner_insert on public.clients;
create policy clients_owner_insert on public.clients for insert with check (user_id = auth.uid() or public.is_admin());
drop policy if exists clients_owner_update on public.clients;
create policy clients_owner_update on public.clients for update using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists clients_owner_delete on public.clients;
create policy clients_owner_delete on public.clients for delete using (user_id = auth.uid() or public.is_admin());

drop policy if exists business_config_owner_select on public.business_config;
create policy business_config_owner_select on public.business_config for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists business_config_owner_insert on public.business_config;
create policy business_config_owner_insert on public.business_config for insert with check (user_id = auth.uid() or public.is_admin());
drop policy if exists business_config_owner_update on public.business_config;
create policy business_config_owner_update on public.business_config for update using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists business_config_owner_delete on public.business_config;
create policy business_config_owner_delete on public.business_config for delete using (user_id = auth.uid() or public.is_admin());

drop policy if exists monthly_records_owner_select on public.monthly_records;
create policy monthly_records_owner_select on public.monthly_records for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists monthly_records_owner_insert on public.monthly_records;
create policy monthly_records_owner_insert on public.monthly_records for insert with check (user_id = auth.uid() or public.is_admin());
drop policy if exists monthly_records_owner_update on public.monthly_records;
create policy monthly_records_owner_update on public.monthly_records for update using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists monthly_records_owner_delete on public.monthly_records;
create policy monthly_records_owner_delete on public.monthly_records for delete using (user_id = auth.uid() or public.is_admin());

drop policy if exists invoices_owner_select on public.invoices;
create policy invoices_owner_select on public.invoices for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists invoices_owner_insert on public.invoices;
create policy invoices_owner_insert on public.invoices for insert with check (user_id = auth.uid() or public.is_admin());
drop policy if exists invoices_owner_update on public.invoices;
create policy invoices_owner_update on public.invoices for update using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists invoices_owner_delete on public.invoices;
create policy invoices_owner_delete on public.invoices for delete using (user_id = auth.uid() or public.is_admin());

drop policy if exists quotes_owner_select on public.quotes;
create policy quotes_owner_select on public.quotes for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists quotes_owner_insert on public.quotes;
create policy quotes_owner_insert on public.quotes for insert with check (user_id = auth.uid() or public.is_admin());
drop policy if exists quotes_owner_update on public.quotes;
create policy quotes_owner_update on public.quotes for update using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists quotes_owner_delete on public.quotes;
create policy quotes_owner_delete on public.quotes for delete using (user_id = auth.uid() or public.is_admin());

drop policy if exists inventory_items_owner_select on public.inventory_items;
create policy inventory_items_owner_select on public.inventory_items for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists inventory_items_owner_insert on public.inventory_items;
create policy inventory_items_owner_insert on public.inventory_items for insert with check (user_id = auth.uid() or public.is_admin());
drop policy if exists inventory_items_owner_update on public.inventory_items;
create policy inventory_items_owner_update on public.inventory_items for update using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists inventory_items_owner_delete on public.inventory_items;
create policy inventory_items_owner_delete on public.inventory_items for delete using (user_id = auth.uid() or public.is_admin());

drop policy if exists inventory_movements_owner_select on public.inventory_movements;
create policy inventory_movements_owner_select on public.inventory_movements for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists inventory_movements_owner_insert on public.inventory_movements;
create policy inventory_movements_owner_insert on public.inventory_movements for insert with check (user_id = auth.uid() or public.is_admin());
drop policy if exists inventory_movements_owner_update on public.inventory_movements;
create policy inventory_movements_owner_update on public.inventory_movements for update using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists inventory_movements_owner_delete on public.inventory_movements;
create policy inventory_movements_owner_delete on public.inventory_movements for delete using (user_id = auth.uid() or public.is_admin());

drop policy if exists appointments_owner_select on public.appointments;
create policy appointments_owner_select on public.appointments for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists appointments_owner_insert on public.appointments;
create policy appointments_owner_insert on public.appointments for insert with check (user_id = auth.uid() or public.is_admin());
drop policy if exists appointments_owner_update on public.appointments;
create policy appointments_owner_update on public.appointments for update using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists appointments_owner_delete on public.appointments;
create policy appointments_owner_delete on public.appointments for delete using (user_id = auth.uid() or public.is_admin());

drop policy if exists product_analysis_owner_select on public.product_analysis;
create policy product_analysis_owner_select on public.product_analysis for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists product_analysis_owner_insert on public.product_analysis;
create policy product_analysis_owner_insert on public.product_analysis for insert with check (user_id = auth.uid() or public.is_admin());
drop policy if exists product_analysis_owner_update on public.product_analysis;
create policy product_analysis_owner_update on public.product_analysis for update using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists product_analysis_owner_delete on public.product_analysis;
create policy product_analysis_owner_delete on public.product_analysis for delete using (user_id = auth.uid() or public.is_admin());

drop policy if exists reports_owner_select on public.reports;
create policy reports_owner_select on public.reports for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists reports_owner_insert on public.reports;
create policy reports_owner_insert on public.reports for insert with check (user_id = auth.uid() or public.is_admin());
drop policy if exists reports_owner_update on public.reports;
create policy reports_owner_update on public.reports for update using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists reports_owner_delete on public.reports;
create policy reports_owner_delete on public.reports for delete using (user_id = auth.uid() or public.is_admin());

drop policy if exists alerts_owner_select on public.alerts;
create policy alerts_owner_select on public.alerts for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists alerts_owner_insert on public.alerts;
create policy alerts_owner_insert on public.alerts for insert with check (user_id = auth.uid() or public.is_admin());
drop policy if exists alerts_owner_update on public.alerts;
create policy alerts_owner_update on public.alerts for update using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists alerts_owner_delete on public.alerts;
create policy alerts_owner_delete on public.alerts for delete using (user_id = auth.uid() or public.is_admin());

-- Email + admin
drop policy if exists email_templates_admin_select on public.email_templates;
create policy email_templates_admin_select on public.email_templates for select using (public.is_admin());
drop policy if exists email_templates_admin_insert on public.email_templates;
create policy email_templates_admin_insert on public.email_templates for insert with check (public.is_admin());
drop policy if exists email_templates_admin_update on public.email_templates;
create policy email_templates_admin_update on public.email_templates for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists email_templates_admin_delete on public.email_templates;
create policy email_templates_admin_delete on public.email_templates for delete using (public.is_admin());

drop policy if exists email_logs_owner_select on public.email_logs;
create policy email_logs_owner_select on public.email_logs for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists email_logs_owner_insert on public.email_logs;
create policy email_logs_owner_insert on public.email_logs for insert with check (user_id = auth.uid() or public.is_admin());
drop policy if exists email_logs_owner_update on public.email_logs;
create policy email_logs_owner_update on public.email_logs for update using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists email_logs_owner_delete on public.email_logs;
create policy email_logs_owner_delete on public.email_logs for delete using (public.is_admin());

drop policy if exists email_campaigns_admin_select on public.email_campaigns;
create policy email_campaigns_admin_select on public.email_campaigns for select using (admin_id = auth.uid() or public.is_admin());
drop policy if exists email_campaigns_admin_insert on public.email_campaigns;
create policy email_campaigns_admin_insert on public.email_campaigns for insert with check (admin_id = auth.uid() or public.is_admin());
drop policy if exists email_campaigns_admin_update on public.email_campaigns;
create policy email_campaigns_admin_update on public.email_campaigns for update using (admin_id = auth.uid() or public.is_admin()) with check (admin_id = auth.uid() or public.is_admin());
drop policy if exists email_campaigns_admin_delete on public.email_campaigns;
create policy email_campaigns_admin_delete on public.email_campaigns for delete using (admin_id = auth.uid() or public.is_admin());

drop policy if exists audit_logs_admin_select on public.audit_logs;
create policy audit_logs_admin_select on public.audit_logs for select using (admin_id = auth.uid() or public.is_admin());
drop policy if exists audit_logs_admin_insert on public.audit_logs;
create policy audit_logs_admin_insert on public.audit_logs for insert with check (admin_id = auth.uid() or public.is_admin());
drop policy if exists audit_logs_admin_delete on public.audit_logs;
create policy audit_logs_admin_delete on public.audit_logs for delete using (public.is_admin());

-- Leads: public insert, admin manage
drop policy if exists leads_public_insert on public.leads;
create policy leads_public_insert on public.leads for insert with check (true);
drop policy if exists leads_admin_select on public.leads;
create policy leads_admin_select on public.leads for select using (public.is_admin());
drop policy if exists leads_admin_update on public.leads;
create policy leads_admin_update on public.leads for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists leads_admin_delete on public.leads;
create policy leads_admin_delete on public.leads for delete using (public.is_admin());

-- ============================================================
-- STORAGE BUCKET FOR LOGOS / DOCUMENT ASSETS
-- ============================================================

insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do nothing;

drop policy if exists uploads_public_read on storage.objects;
create policy uploads_public_read on storage.objects
for select
using (bucket_id = 'uploads');

drop policy if exists uploads_authenticated_insert on storage.objects;
create policy uploads_authenticated_insert on storage.objects
for insert
to authenticated
with check (bucket_id = 'uploads');

drop policy if exists uploads_owner_update on storage.objects;
create policy uploads_owner_update on storage.objects
for update
to authenticated
using (bucket_id = 'uploads' and (owner = auth.uid() or public.is_admin()))
with check (bucket_id = 'uploads' and (owner = auth.uid() or public.is_admin()));

drop policy if exists uploads_owner_delete on storage.objects;
create policy uploads_owner_delete on storage.objects
for delete
to authenticated
using (bucket_id = 'uploads' and (owner = auth.uid() or public.is_admin()));
