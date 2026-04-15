-- ============================================================
-- CEO RENTABLE OS™
-- FASE 2 · PATCH LEGACY DE MODULOS
-- Ejecutar en SQL Editor de Supabase (una sola vez)
-- Corrige tablas faltantes/incompletas para:
-- Products, Clients, MonthlyControl, Billing, Inventory, Reports, Learn, AppSettings
-- ============================================================

create extension if not exists pgcrypto;

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

  if new.created_by is null and auth.jwt() ->> 'email' is not null then
    new.created_by = lower(auth.jwt() ->> 'email');
  end if;

  if new.created_at is null then
    new.created_at = timezone('utc', now());
  end if;

  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- ============================================================
-- PRODUCTS (tabla existente incompleta en algunos proyectos)
-- ============================================================
alter table if exists public.products add column if not exists user_id uuid;
alter table if exists public.products add column if not exists created_by text;
alter table if exists public.products add column if not exists name text;
alter table if exists public.products add column if not exists sku text;
alter table if exists public.products add column if not exists descripcion text;
alter table if exists public.products add column if not exists sale_price numeric(12,2) default 0;
alter table if exists public.products add column if not exists costo_unitario numeric(12,2) default 0;
alter table if exists public.products add column if not exists margin_pct numeric(8,2) default 0;
alter table if exists public.products add column if not exists current_stock integer default 0;
alter table if exists public.products add column if not exists min_stock_alert integer default 0;
alter table if exists public.products add column if not exists product_type text default 'fisico';
alter table if exists public.products add column if not exists status text default 'draft';
alter table if exists public.products add column if not exists created_at timestamptz default timezone('utc', now());
alter table if exists public.products add column if not exists updated_at timestamptz default timezone('utc', now());

do $$
begin
  if exists (select 1 from pg_class where relname = 'products' and relnamespace = 'public'::regnamespace) then
    update public.products set name = coalesce(name, 'Producto');
  end if;
end $$;

-- ============================================================
-- CLIENTS
-- ============================================================
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  created_by text,
  name text not null,
  email text,
  phone text,
  status text not null default 'new' check (status in ('new', 'recurring', 'vip')),
  total_billed numeric(12,2) not null default 0,
  notes text,
  created_date timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- ============================================================
-- MONTHLY RECORDS
-- ============================================================
create table if not exists public.monthly_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  created_by text,
  month text not null,
  income numeric(12,2) not null default 0,
  expenses numeric(12,2) not null default 0,
  profit numeric(12,2) not null default 0,
  margin_pct numeric(8,2) not null default 0,
  is_closed boolean not null default false,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_monthly_records_owner_month
  on public.monthly_records (coalesce(user_id::text, created_by), month);

-- ============================================================
-- INVOICES (tabla existente incompleta en algunos proyectos)
-- ============================================================
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
alter table if exists public.invoices add column if not exists reminder_sent_at timestamptz;
alter table if exists public.invoices add column if not exists created_at timestamptz default timezone('utc', now());
alter table if exists public.invoices add column if not exists updated_at timestamptz default timezone('utc', now());

-- ============================================================
-- QUOTES
-- ============================================================
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  created_by text,
  quote_number text not null,
  date date not null default current_date,
  due_date date,
  client_id uuid,
  client_name text,
  client_email text,
  client_phone text,
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0,
  tax_enabled boolean not null default false,
  tax_pct numeric(5,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_final numeric(12,2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  notes text,
  company_name text,
  logo_url text,
  brand_color text default '#D45387',
  font_family text default 'Inter',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- ============================================================
-- INVENTORY
-- ============================================================
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  created_by text,
  product_name text not null,
  product_type text not null default 'fisico' check (product_type in ('fisico', 'digital', 'servicio')),
  descripcion text,
  sku text,
  costo_unitario numeric(12,2) not null default 0,
  sale_price numeric(12,2) not null default 0,
  current_stock numeric(12,2) not null default 0,
  min_stock_alert numeric(12,2) not null default 0,
  unit text not null default 'unidad',
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  created_by text,
  inventory_item_id uuid,
  product_name text not null,
  invoice_number text,
  type text not null check (type in ('entrada', 'salida', 'ajuste')),
  quantity numeric(12,2) not null default 0,
  reason text,
  date date not null default current_date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- ============================================================
-- BUSINESS CONFIG
-- ============================================================
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
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_business_config_owner
  on public.business_config (coalesce(user_id::text, created_by));

-- ============================================================
-- Triggers de metadata owner + updated_at
-- ============================================================
do $$
declare
  t text;
  owned_tables text[] := array[
    'products',
    'clients',
    'monthly_records',
    'invoices',
    'quotes',
    'inventory_items',
    'inventory_movements',
    'business_config'
  ];
begin
  foreach t in array owned_tables
  loop
    execute format('drop trigger if exists trg_%I_owner_meta on public.%I', t, t);
    execute format('create trigger trg_%I_owner_meta before insert or update on public.%I for each row execute function public.sync_owned_record_metadata()', t, t);
  end loop;
end $$;

-- ============================================================
-- RLS
-- ============================================================
alter table public.products enable row level security;
alter table public.clients enable row level security;
alter table public.monthly_records enable row level security;
alter table public.invoices enable row level security;
alter table public.quotes enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.business_config enable row level security;

do $$
declare
  t text;
  owned_tables text[] := array[
    'products',
    'clients',
    'monthly_records',
    'invoices',
    'quotes',
    'inventory_items',
    'inventory_movements',
    'business_config'
  ];
begin
  foreach t in array owned_tables
  loop
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
        or (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
      )
    $fmt$, t);

    execute format($fmt$
      create policy %1$I_owner_insert on public.%1$I
      for insert
      with check (
        user_id = auth.uid()
        or lower(coalesce(created_by, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
      )
    $fmt$, t);

    execute format($fmt$
      create policy %1$I_owner_update on public.%1$I
      for update
      using (
        user_id = auth.uid()
        or lower(coalesce(created_by, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
      )
      with check (
        user_id = auth.uid()
        or lower(coalesce(created_by, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
      )
    $fmt$, t);

    execute format($fmt$
      create policy %1$I_owner_delete on public.%1$I
      for delete
      using (
        user_id = auth.uid()
        or lower(coalesce(created_by, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
      )
    $fmt$, t);
  end loop;
end $$;
