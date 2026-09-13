-- Fase 4: catálogo unificado, costos detallados y combos.
begin;

alter table public.products
  add column if not exists image_url text,
  add column if not exists unit text not null default 'unidad',
  add column if not exists currency text not null default 'DOP',
  add column if not exists tax_pct numeric(5,2) not null default 0,
  add column if not exists cost_mode text not null default 'manual',
  add column if not exists manual_cost numeric(14,2) not null default 0,
  add column if not exists hourly_cost numeric(14,2) not null default 0,
  add column if not exists material_cost numeric(14,2) not null default 0,
  add column if not exists other_cost numeric(14,2) not null default 0,
  add column if not exists target_margin numeric(5,2) not null default 40;

alter table public.products drop constraint if exists products_product_type_check;
alter table public.products add constraint products_product_type_check
  check (product_type in ('fisico', 'digital', 'servicio', 'combo'));
alter table public.products drop constraint if exists products_sale_price_nonnegative;
alter table public.products add constraint products_sale_price_nonnegative check (sale_price >= 0) not valid;
alter table public.products drop constraint if exists products_cost_nonnegative;
alter table public.products add constraint products_cost_nonnegative check (costo_unitario >= 0) not valid;
alter table public.products drop constraint if exists products_tax_valid;
alter table public.products add constraint products_tax_valid check (tax_pct >= 0 and tax_pct <= 100) not valid;
alter table public.products drop constraint if exists products_target_margin_valid;
alter table public.products add constraint products_target_margin_valid check (target_margin >= 0 and target_margin < 100) not valid;
alter table public.products drop constraint if exists products_cost_mode_valid;
alter table public.products add constraint products_cost_mode_valid check (cost_mode in ('manual', 'detailed', 'service')) not valid;
alter table public.products validate constraint products_sale_price_nonnegative;
alter table public.products validate constraint products_cost_nonnegative;
alter table public.products validate constraint products_tax_valid;
alter table public.products validate constraint products_target_margin_valid;
alter table public.products validate constraint products_cost_mode_valid;

update public.products set manual_cost = coalesce(costo_unitario, 0) where manual_cost = 0;

create table if not exists public.product_cost_components (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete cascade,
  created_by text,
  brand_profile_id uuid references public.brand_profiles(id) on delete set null,
  name text not null,
  cost_type text not null default 'otro' check (cost_type in (
    'materia_prima', 'mano_obra', 'empaque', 'comision', 'transporte',
    'costo_variable', 'costo_indirecto', 'desperdicio', 'otro'
  )),
  quantity numeric(14,4) not null default 1 check (quantity > 0),
  unit text not null default 'unidad',
  unit_cost numeric(14,4) not null default 0 check (unit_cost >= 0),
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.product_bundle_items (
  id uuid primary key default gen_random_uuid(),
  bundle_product_id uuid not null references public.products(id) on delete cascade,
  component_product_id uuid not null references public.products(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete cascade,
  created_by text,
  brand_profile_id uuid references public.brand_profiles(id) on delete set null,
  quantity numeric(14,4) not null default 1 check (quantity > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint product_bundle_items_not_self check (bundle_product_id <> component_product_id),
  constraint product_bundle_items_unique unique (bundle_product_id, component_product_id)
);

create index if not exists idx_product_cost_components_product on public.product_cost_components(product_id);
create index if not exists idx_product_cost_components_workspace on public.product_cost_components(workspace_id);
create index if not exists idx_product_cost_components_owner on public.product_cost_components(user_id, brand_profile_id);
create index if not exists idx_product_bundle_items_bundle on public.product_bundle_items(bundle_product_id);
create index if not exists idx_product_bundle_items_component on public.product_bundle_items(component_product_id);
create index if not exists idx_product_bundle_items_workspace on public.product_bundle_items(workspace_id);
create index if not exists idx_product_bundle_items_owner on public.product_bundle_items(user_id, brand_profile_id);
create index if not exists idx_products_catalog_filters on public.products(user_id, brand_profile_id, product_type, status);

create or replace function public.prevent_product_bundle_cycle()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if exists (
    with recursive descendants(id) as (
      select new.component_product_id
      union
      select pbi.component_product_id
      from public.product_bundle_items pbi
      join descendants d on pbi.bundle_product_id = d.id
    )
    select 1 from descendants where id = new.bundle_product_id
  ) then
    raise exception 'Un combo no puede contener referencias circulares.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_product_bundle_cycle on public.product_bundle_items;
create trigger trg_prevent_product_bundle_cycle
before insert or update on public.product_bundle_items
for each row execute function public.prevent_product_bundle_cycle();

create or replace function public.refresh_catalog_item_cost()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  affected_product_id uuid;
  previous_product_id uuid;
begin
  if tg_table_name = 'product_cost_components' then
    affected_product_id := coalesce(new.product_id, old.product_id);
    if tg_op = 'UPDATE' then previous_product_id := old.product_id; end if;
  else
    affected_product_id := coalesce(new.bundle_product_id, old.bundle_product_id);
    if tg_op = 'UPDATE' then previous_product_id := old.bundle_product_id; end if;
  end if;

  if tg_table_name = 'product_cost_components' then
    update public.products p
    set costo_unitario = coalesce((select round(sum(c.quantity * c.unit_cost), 2) from public.product_cost_components c where c.product_id = affected_product_id), 0),
        updated_at = timezone('utc', now())
    where p.id = affected_product_id and p.cost_mode = 'detailed';
  else
    update public.products p
    set costo_unitario = coalesce((select round(sum(b.quantity * child.costo_unitario), 2) from public.product_bundle_items b join public.products child on child.id = b.component_product_id where b.bundle_product_id = affected_product_id), 0),
        updated_at = timezone('utc', now())
    where p.id = affected_product_id and p.product_type = 'combo';
  end if;

  if tg_op = 'UPDATE' and previous_product_id is distinct from affected_product_id then
    if tg_table_name = 'product_cost_components' then
      update public.products p
      set costo_unitario = coalesce((select round(sum(c.quantity * c.unit_cost), 2) from public.product_cost_components c where c.product_id = previous_product_id), 0),
          updated_at = timezone('utc', now())
      where p.id = previous_product_id and p.cost_mode = 'detailed';
    else
      update public.products p
      set costo_unitario = coalesce((select round(sum(b.quantity * child.costo_unitario), 2) from public.product_bundle_items b join public.products child on child.id = b.component_product_id where b.bundle_product_id = previous_product_id), 0),
          updated_at = timezone('utc', now())
      where p.id = previous_product_id and p.product_type = 'combo';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_refresh_cost_component_total on public.product_cost_components;
create trigger trg_refresh_cost_component_total after insert or update or delete on public.product_cost_components
for each row execute function public.refresh_catalog_item_cost();
drop trigger if exists trg_refresh_bundle_total on public.product_bundle_items;
create trigger trg_refresh_bundle_total after insert or update or delete on public.product_bundle_items
for each row execute function public.refresh_catalog_item_cost();

create or replace function public.refresh_parent_bundle_costs()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.costo_unitario is distinct from old.costo_unitario then
    update public.products parent
    set costo_unitario = totals.total_cost,
        updated_at = timezone('utc', now())
    from (
      select b.bundle_product_id, round(sum(b.quantity * child.costo_unitario), 2) as total_cost
      from public.product_bundle_items b
      join public.products child on child.id = b.component_product_id
      where b.bundle_product_id in (select bundle_product_id from public.product_bundle_items where component_product_id = new.id)
      group by b.bundle_product_id
    ) totals
    where parent.id = totals.bundle_product_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_refresh_parent_bundle_costs on public.products;
create trigger trg_refresh_parent_bundle_costs after update of costo_unitario on public.products
for each row execute function public.refresh_parent_bundle_costs();

drop trigger if exists trg_product_cost_components_updated_at on public.product_cost_components;
create trigger trg_product_cost_components_updated_at before update on public.product_cost_components
for each row execute function public.set_updated_at();
drop trigger if exists trg_product_bundle_items_updated_at on public.product_bundle_items;
create trigger trg_product_bundle_items_updated_at before update on public.product_bundle_items
for each row execute function public.set_updated_at();

alter table public.product_cost_components enable row level security;
alter table public.product_bundle_items enable row level security;
revoke all on table public.product_cost_components, public.product_bundle_items from anon, authenticated;
grant select, insert, update, delete on table public.product_cost_components, public.product_bundle_items to authenticated;

drop policy if exists product_cost_components_owner_select on public.product_cost_components;
drop policy if exists product_cost_components_owner_insert on public.product_cost_components;
drop policy if exists product_cost_components_owner_update on public.product_cost_components;
drop policy if exists product_cost_components_owner_delete on public.product_cost_components;
drop policy if exists product_cost_components_workspace_select on public.product_cost_components;
drop policy if exists product_cost_components_workspace_insert on public.product_cost_components;
drop policy if exists product_cost_components_workspace_update on public.product_cost_components;
drop policy if exists product_cost_components_workspace_delete on public.product_cost_components;

create policy product_cost_components_workspace_select on public.product_cost_components for select to authenticated
using (public.workspace_has_module_access(workspace_id, 'products'));
create policy product_cost_components_workspace_insert on public.product_cost_components for insert to authenticated
with check (
  public.workspace_can_write(workspace_id, 'products')
  and exists (
    select 1 from public.products p
    where p.id = product_id and p.workspace_id = workspace_id and p.user_id = user_id
  )
);
create policy product_cost_components_workspace_update on public.product_cost_components for update to authenticated
using (public.workspace_can_write(workspace_id, 'products'))
with check (
  public.workspace_can_write(workspace_id, 'products')
  and exists (
    select 1 from public.products p
    where p.id = product_id and p.workspace_id = workspace_id and p.user_id = user_id
  )
);
create policy product_cost_components_workspace_delete on public.product_cost_components for delete to authenticated
using (public.workspace_can_write(workspace_id, 'products'));

drop policy if exists product_bundle_items_owner_select on public.product_bundle_items;
drop policy if exists product_bundle_items_owner_insert on public.product_bundle_items;
drop policy if exists product_bundle_items_owner_update on public.product_bundle_items;
drop policy if exists product_bundle_items_owner_delete on public.product_bundle_items;
drop policy if exists product_bundle_items_workspace_select on public.product_bundle_items;
drop policy if exists product_bundle_items_workspace_insert on public.product_bundle_items;
drop policy if exists product_bundle_items_workspace_update on public.product_bundle_items;
drop policy if exists product_bundle_items_workspace_delete on public.product_bundle_items;

create policy product_bundle_items_workspace_select on public.product_bundle_items for select to authenticated
using (public.workspace_has_module_access(workspace_id, 'products'));
create policy product_bundle_items_workspace_insert on public.product_bundle_items for insert to authenticated
with check (
  public.workspace_can_write(workspace_id, 'products')
  and exists (
    select 1 from public.products p
    where p.id = bundle_product_id and p.workspace_id = workspace_id and p.user_id = user_id
  )
  and exists (
    select 1 from public.products p
    where p.id = component_product_id and p.workspace_id = workspace_id and p.user_id = user_id
  )
);
create policy product_bundle_items_workspace_update on public.product_bundle_items for update to authenticated
using (public.workspace_can_write(workspace_id, 'products'))
with check (
  public.workspace_can_write(workspace_id, 'products')
  and exists (
    select 1 from public.products p
    where p.id = bundle_product_id and p.workspace_id = workspace_id and p.user_id = user_id
  )
  and exists (
    select 1 from public.products p
    where p.id = component_product_id and p.workspace_id = workspace_id and p.user_id = user_id
  )
);
create policy product_bundle_items_workspace_delete on public.product_bundle_items for delete to authenticated
using (public.workspace_can_write(workspace_id, 'products'));

commit;
