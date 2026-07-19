-- ============================================================
-- CEO RENTABLE OS™
-- FASE 3 · COST LIBRARY + PROFITABILITY COST LINES
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.cost_library_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  created_by text,
  name text not null,
  description text,
  category text not null check (category in (
    'material',
    'empaque',
    'herramienta_plataforma',
    'proceso_mano_obra',
    'soporte',
    'onboarding_entrega',
    'subcontrato',
    'traslado',
    'gasto_operativo',
    'comision_impuesto',
    'publicidad_captacion',
    'otro'
  )),
  calculation_type text not null check (calculation_type in (
    'fixed',
    'per_unit',
    'hourly',
    'percentage',
    'monthly_prorated',
    'annual_prorated'
  )),
  applies_to_product_types jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  fixed_amount numeric not null default 0 check (fixed_amount >= 0),
  purchase_cost numeric not null default 0 check (purchase_cost >= 0),
  purchase_quantity numeric not null default 0 check (purchase_quantity >= 0),
  usage_unit text,
  waste_percentage numeric not null default 0 check (waste_percentage >= 0),
  hourly_rate numeric not null default 0 check (hourly_rate >= 0),
  percentage_rate numeric not null default 0 check (percentage_rate >= 0),
  fixed_fee numeric not null default 0 check (fixed_fee >= 0),
  monthly_cost numeric not null default 0 check (monthly_cost >= 0),
  annual_cost numeric not null default 0 check (annual_cost >= 0),
  estimated_monthly_allocations numeric not null default 0 check (estimated_monthly_allocations >= 0),
  estimated_annual_allocations numeric not null default 0 check (estimated_annual_allocations >= 0),
  billing_period text check (billing_period is null or billing_period in ('one_time', 'per_sale', 'monthly', 'annual')),
  provider text,
  notes text,
  last_cost_update timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint cost_library_items_name_not_blank check (btrim(name) <> ''),
  constraint cost_library_items_product_types_array check (jsonb_typeof(applies_to_product_types) = 'array'),
  constraint cost_library_items_product_types_allowed check (
    not jsonb_path_exists(
      applies_to_product_types,
      '$[*] ? (@ != "fisico" && @ != "digital" && @ != "servicio")'
    )
  )
);

create table if not exists public.profitability_cost_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  created_by text,
  product_analysis_id uuid references public.product_analysis(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  cost_library_item_id uuid references public.cost_library_items(id) on delete set null,
  name_snapshot text not null,
  description_snapshot text,
  category_snapshot text not null check (category_snapshot in (
    'material',
    'empaque',
    'herramienta_plataforma',
    'proceso_mano_obra',
    'soporte',
    'onboarding_entrega',
    'subcontrato',
    'traslado',
    'gasto_operativo',
    'comision_impuesto',
    'publicidad_captacion',
    'otro'
  )),
  calculation_type_snapshot text not null check (calculation_type_snapshot in (
    'fixed',
    'per_unit',
    'hourly',
    'percentage',
    'monthly_prorated',
    'annual_prorated'
  )),
  usage_unit_snapshot text,
  quantity numeric not null default 1 check (quantity >= 0),
  hours numeric not null default 0 check (hours >= 0),
  sale_price_basis numeric not null default 0 check (sale_price_basis >= 0),
  percentage_rate_snapshot numeric not null default 0 check (percentage_rate_snapshot >= 0),
  fixed_fee_snapshot numeric not null default 0 check (fixed_fee_snapshot >= 0),
  waste_percentage_snapshot numeric not null default 0 check (waste_percentage_snapshot >= 0),
  unit_cost_snapshot numeric not null default 0 check (unit_cost_snapshot >= 0),
  base_amount numeric not null default 0 check (base_amount >= 0),
  waste_amount numeric not null default 0 check (waste_amount >= 0),
  computed_amount numeric not null default 0 check (computed_amount >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profitability_cost_lines_name_snapshot_not_blank check (btrim(name_snapshot) <> '')
);

create index if not exists idx_cost_library_items_user_id on public.cost_library_items(user_id);
create index if not exists idx_cost_library_items_category on public.cost_library_items(category);
create index if not exists idx_cost_library_items_is_active on public.cost_library_items(is_active);
create index if not exists idx_cost_library_items_user_category_active on public.cost_library_items(user_id, category, is_active);

create index if not exists idx_profitability_cost_lines_user_id on public.profitability_cost_lines(user_id);
create index if not exists idx_profitability_cost_lines_product_analysis_id on public.profitability_cost_lines(product_analysis_id);
create index if not exists idx_profitability_cost_lines_product_id on public.profitability_cost_lines(product_id);
create index if not exists idx_profitability_cost_lines_cost_library_item_id on public.profitability_cost_lines(cost_library_item_id);
create index if not exists idx_profitability_cost_lines_analysis_sort on public.profitability_cost_lines(product_analysis_id, sort_order);

drop trigger if exists trg_cost_library_items_metadata on public.cost_library_items;
create trigger trg_cost_library_items_metadata
before insert or update on public.cost_library_items
for each row
execute function public.sync_owned_record_metadata();

drop trigger if exists trg_cost_library_items_updated_at on public.cost_library_items;
create trigger trg_cost_library_items_updated_at
before update on public.cost_library_items
for each row
execute function public.set_updated_at();

drop trigger if exists trg_profitability_cost_lines_metadata on public.profitability_cost_lines;
create trigger trg_profitability_cost_lines_metadata
before insert or update on public.profitability_cost_lines
for each row
execute function public.sync_owned_record_metadata();

drop trigger if exists trg_profitability_cost_lines_updated_at on public.profitability_cost_lines;
create trigger trg_profitability_cost_lines_updated_at
before update on public.profitability_cost_lines
for each row
execute function public.set_updated_at();

alter table public.cost_library_items enable row level security;
alter table public.profitability_cost_lines enable row level security;

drop policy if exists cost_library_items_owner_select on public.cost_library_items;
create policy cost_library_items_owner_select on public.cost_library_items
for select
using (user_id = auth.uid() or public.is_admin());

drop policy if exists cost_library_items_owner_insert on public.cost_library_items;
create policy cost_library_items_owner_insert on public.cost_library_items
for insert
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists cost_library_items_owner_update on public.cost_library_items;
create policy cost_library_items_owner_update on public.cost_library_items
for update
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists cost_library_items_owner_delete on public.cost_library_items;
create policy cost_library_items_owner_delete on public.cost_library_items
for delete
using (user_id = auth.uid() or public.is_admin());

drop policy if exists profitability_cost_lines_owner_select on public.profitability_cost_lines;
create policy profitability_cost_lines_owner_select on public.profitability_cost_lines
for select
using (user_id = auth.uid() or public.is_admin());

drop policy if exists profitability_cost_lines_owner_insert on public.profitability_cost_lines;
create policy profitability_cost_lines_owner_insert on public.profitability_cost_lines
for insert
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists profitability_cost_lines_owner_update on public.profitability_cost_lines;
create policy profitability_cost_lines_owner_update on public.profitability_cost_lines
for update
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists profitability_cost_lines_owner_delete on public.profitability_cost_lines;
create policy profitability_cost_lines_owner_delete on public.profitability_cost_lines
for delete
using (user_id = auth.uid() or public.is_admin());
