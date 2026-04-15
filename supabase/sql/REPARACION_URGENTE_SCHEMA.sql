-- CEO Rentable OS™
-- REPARACION URGENTE DE ESQUEMA (idempotente)
-- Ejecutar completo en Supabase SQL Editor

create extension if not exists pgcrypto;

create or replace function public.jwt_role()
returns text
language sql
stable
as $$
  select lower(coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role',
    'user'
  ));
$$;

create or replace function public.is_admin(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
as $$
  select public.jwt_role() = 'admin';
$$;

-- ============================================================
-- USERS (compatibilidad con frontend actual)
-- ============================================================
create table if not exists public.users (
  id uuid primary key,
  email text unique,
  full_name text,
  created_at timestamptz default timezone('utc', now())
);

alter table public.users add column if not exists phone text;
alter table public.users add column if not exists role text default 'user';
alter table public.users add column if not exists plan text default 'free';
alter table public.users add column if not exists has_access boolean default true;
alter table public.users add column if not exists onboarding_completed boolean default true;
alter table public.users add column if not exists currency text default 'USD';
alter table public.users add column if not exists timezone text default 'America/Santo_Domingo';
alter table public.users add column if not exists last_login_at timestamptz;
alter table public.users add column if not exists updated_at timestamptz default timezone('utc', now());

update public.users set role = coalesce(role, 'user') where role is null;
update public.users set plan = coalesce(plan, 'free') where plan is null;
update public.users set has_access = coalesce(has_access, true) where has_access is null;
update public.users set onboarding_completed = coalesce(onboarding_completed, true) where onboarding_completed is null;
update public.users set currency = coalesce(currency, 'USD') where currency is null;
update public.users set timezone = coalesce(timezone, 'America/Santo_Domingo') where timezone is null;
update public.users set updated_at = coalesce(updated_at, timezone('utc', now())) where updated_at is null;

-- Sincronizar auth.users -> public.users
insert into public.users (id, email, full_name, created_at, updated_at)
select
  au.id,
  lower(au.email),
  coalesce(au.raw_user_meta_data ->> 'full_name', split_part(au.email, '@', 1)),
  timezone('utc', now()),
  timezone('utc', now())
from auth.users au
on conflict (id) do update
set
  email = excluded.email,
  full_name = coalesce(public.users.full_name, excluded.full_name),
  updated_at = timezone('utc', now());

-- ============================================================
-- FUNCIONES TRIGGER OWNER/METADATA
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
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = tg_table_name
      and column_name = 'user_id'
  ) then
    if new.user_id is null and auth.uid() is not null then
      new.user_id = auth.uid();
    end if;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = tg_table_name
      and column_name = 'created_by'
  ) then
    if coalesce(new.created_by, '') = '' then
      new.created_by = lower(coalesce(auth.jwt() ->> 'email', ''));
    end if;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = tg_table_name
      and column_name = 'created_at'
  ) then
    if new.created_at is null then
      new.created_at = timezone('utc', now());
    end if;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = tg_table_name
      and column_name = 'updated_at'
  ) then
    new.updated_at = timezone('utc', now());
  end if;

  return new;
end;
$$;

-- ============================================================
-- TABLAS QUE FALTAN
-- ============================================================
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  created_by text,
  name text not null,
  email text,
  phone text,
  status text default 'new',
  total_billed numeric(12,2) default 0,
  notes text,
  created_date timestamptz default timezone('utc', now()),
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create table if not exists public.monthly_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  created_by text,
  month text not null,
  income numeric(12,2) default 0,
  expenses numeric(12,2) default 0,
  profit numeric(12,2) default 0,
  margin_pct numeric(8,2) default 0,
  is_closed boolean default false,
  notes text,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  created_by text,
  client_name text not null,
  client_phone text,
  service_type text not null,
  date date,
  time text,
  price numeric(12,2) default 0,
  status text default 'programado',
  notes text,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  created_by text,
  quote_number text,
  date date default current_date,
  due_date date,
  client_id uuid,
  client_name text,
  client_email text,
  client_phone text,
  line_items jsonb default '[]'::jsonb,
  subtotal numeric(12,2) default 0,
  tax_enabled boolean default false,
  tax_pct numeric(5,2) default 0,
  tax_amount numeric(12,2) default 0,
  total_final numeric(12,2) default 0,
  status text default 'pending',
  notes text,
  company_name text,
  logo_url text,
  brand_color text default '#D45387',
  font_family text default 'Inter',
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  created_by text,
  product_name text,
  product_type text default 'fisico',
  descripcion text,
  sku text,
  costo_unitario numeric(12,2) default 0,
  sale_price numeric(12,2) default 0,
  current_stock numeric(12,2) default 0,
  min_stock_alert numeric(12,2) default 0,
  unit text default 'unidad',
  notes text,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  created_by text,
  inventory_item_id uuid,
  product_name text,
  invoice_number text,
  type text,
  quantity numeric(12,2) default 0,
  reason text,
  date date default current_date,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create table if not exists public.business_config (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  created_by text,
  business_name text,
  logo_url text,
  brand_color text default '#D94F8A',
  font_family text default 'Inter',
  fiscal_name text,
  fiscal_id text,
  fiscal_address text,
  currency text default 'USD',
  quarterly_goal numeric(12,2) default 0,
  target_margin_pct numeric(8,2) default 40,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

-- ============================================================
-- TABLAS EXISTENTES PERO INCOMPLETAS
-- ============================================================
alter table if exists public.products add column if not exists user_id uuid;
alter table if exists public.products add column if not exists created_by text;
alter table if exists public.products add column if not exists name text;
alter table if exists public.products add column if not exists sale_price numeric(12,2) default 0;
alter table if exists public.products add column if not exists costo_unitario numeric(12,2) default 0;
alter table if exists public.products add column if not exists margin_pct numeric(8,2) default 0;
alter table if exists public.products add column if not exists product_type text default 'fisico';
alter table if exists public.products add column if not exists status text default 'draft';
alter table if exists public.products add column if not exists current_stock numeric(12,2) default 0;
alter table if exists public.products add column if not exists min_stock_alert numeric(12,2) default 0;
alter table if exists public.products add column if not exists updated_at timestamptz default timezone('utc', now());

alter table if exists public.invoices add column if not exists user_id uuid;
alter table if exists public.invoices add column if not exists created_by text;
alter table if exists public.invoices add column if not exists invoice_number text;
alter table if exists public.invoices add column if not exists date date default current_date;
alter table if exists public.invoices add column if not exists due_date date;
alter table if exists public.invoices add column if not exists client_id uuid;
alter table if exists public.invoices add column if not exists client_name text;
alter table if exists public.invoices add column if not exists client_email text;
alter table if exists public.invoices add column if not exists client_phone text;
alter table if exists public.invoices add column if not exists line_items jsonb default '[]'::jsonb;
alter table if exists public.invoices add column if not exists subtotal numeric(12,2) default 0;
alter table if exists public.invoices add column if not exists tax_enabled boolean default false;
alter table if exists public.invoices add column if not exists tax_pct numeric(5,2) default 0;
alter table if exists public.invoices add column if not exists tax_amount numeric(12,2) default 0;
alter table if exists public.invoices add column if not exists total_final numeric(12,2) default 0;
alter table if exists public.invoices add column if not exists status text default 'pending';
alter table if exists public.invoices add column if not exists notes text;
alter table if exists public.invoices add column if not exists company_name text;
alter table if exists public.invoices add column if not exists logo_url text;
alter table if exists public.invoices add column if not exists brand_color text default '#D45387';
alter table if exists public.invoices add column if not exists font_family text default 'Inter';
alter table if exists public.invoices add column if not exists updated_at timestamptz default timezone('utc', now());

alter table if exists public.product_analysis add column if not exists user_id uuid;
alter table if exists public.product_analysis add column if not exists created_by text;
alter table if exists public.product_analysis add column if not exists name text;
alter table if exists public.product_analysis add column if not exists sale_price numeric(12,2) default 0;
alter table if exists public.product_analysis add column if not exists cost numeric(12,2) default 0;
alter table if exists public.product_analysis add column if not exists margin_pct numeric(8,2) default 0;
alter table if exists public.product_analysis add column if not exists product_type text default 'fisico';
alter table if exists public.product_analysis add column if not exists status text default 'analysis';
alter table if exists public.product_analysis add column if not exists updated_at timestamptz default timezone('utc', now());

-- ============================================================
-- TRIGGERS + RLS + POLICIES
-- ============================================================
do $$
declare
  t text;
  owned_tables text[] := array[
    'products',
    'clients',
    'monthly_records',
    'appointments',
    'invoices',
    'quotes',
    'inventory_items',
    'inventory_movements',
    'business_config',
    'product_analysis'
  ];
begin
  foreach t in array owned_tables loop
    execute format('drop trigger if exists trg_%I_owner_meta on public.%I', t, t);
    execute format('create trigger trg_%I_owner_meta before insert or update on public.%I for each row execute function public.sync_owned_record_metadata()', t, t);

    execute format('create index if not exists idx_%I_user_id on public.%I (user_id)', t, t);
    execute format('create index if not exists idx_%I_created_by on public.%I (created_by)', t, t);

    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I_owner_select on public.%I', t, t);
    execute format('drop policy if exists %I_owner_insert on public.%I', t, t);
    execute format('drop policy if exists %I_owner_update on public.%I', t, t);
    execute format('drop policy if exists %I_owner_delete on public.%I', t, t);

    execute format($fmt$
      create policy %1$I_owner_select on public.%1$I
      for select
      using (
        user_id = auth.uid()
        or lower(coalesce(created_by, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or public.jwt_role() = 'admin'
      )
    $fmt$, t);

    execute format($fmt$
      create policy %1$I_owner_insert on public.%1$I
      for insert
      with check (
        user_id = auth.uid()
        or lower(coalesce(created_by, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or public.jwt_role() = 'admin'
      )
    $fmt$, t);

    execute format($fmt$
      create policy %1$I_owner_update on public.%1$I
      for update
      using (
        user_id = auth.uid()
        or lower(coalesce(created_by, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or public.jwt_role() = 'admin'
      )
      with check (
        user_id = auth.uid()
        or lower(coalesce(created_by, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or public.jwt_role() = 'admin'
      )
    $fmt$, t);

    execute format($fmt$
      create policy %1$I_owner_delete on public.%1$I
      for delete
      using (
        user_id = auth.uid()
        or lower(coalesce(created_by, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or public.jwt_role() = 'admin'
      )
    $fmt$, t);
  end loop;
end $$;

-- policies users
alter table public.users enable row level security;
drop policy if exists users_select_own_or_admin on public.users;
drop policy if exists users_insert_own_profile on public.users;
drop policy if exists users_update_own_or_admin on public.users;

create policy users_select_own_or_admin on public.users
for select
using (id = auth.uid() or public.jwt_role() = 'admin');

create policy users_insert_own_profile on public.users
for insert
with check (id = auth.uid() or public.jwt_role() = 'admin');

create policy users_update_own_or_admin on public.users
for update
using (id = auth.uid() or public.jwt_role() = 'admin')
with check (id = auth.uid() or public.jwt_role() = 'admin');

-- uploads bucket
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
using (bucket_id = 'uploads' and (owner = auth.uid()))
with check (bucket_id = 'uploads' and (owner = auth.uid()));

drop policy if exists uploads_owner_delete on storage.objects;
create policy uploads_owner_delete on storage.objects
for delete
to authenticated
using (bucket_id = 'uploads' and (owner = auth.uid()));
