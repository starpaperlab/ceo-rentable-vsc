begin;

alter table public.products
  add column if not exists cost_complexity text not null default 'standard',
  add column if not exists cost_status text not null default 'current',
  add column if not exists direct_cost numeric(18,4) not null default 0,
  add column if not exists labor_cost numeric(18,4) not null default 0,
  add column if not exists overhead_cost numeric(18,4) not null default 0,
  add column if not exists equipment_cost numeric(18,4) not null default 0,
  add column if not exists cost_breakdown jsonb not null default '{}'::jsonb,
  add column if not exists cost_confidence_pct numeric(5,2) not null default 0,
  add column if not exists cost_calculated_at timestamptz,
  add column if not exists cost_engine_version integer not null default 1;

alter table public.products drop constraint if exists products_cost_complexity_check;
alter table public.products add constraint products_cost_complexity_check
  check (cost_complexity in ('low','standard','high'));

alter table public.products drop constraint if exists products_cost_status_check;
alter table public.products add constraint products_cost_status_check
  check (cost_status in ('current','review','incomplete'));

alter table public.products drop constraint if exists products_cost_confidence_pct_check;
alter table public.products add constraint products_cost_confidence_pct_check
  check (cost_confidence_pct >= 0 and cost_confidence_pct <= 100);

alter table public.order_items
  add column if not exists cost_breakdown_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists cost_engine_version_snapshot integer;

create or replace function public.mark_material_cost_dependents_for_review()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.purchase_price is distinct from old.purchase_price
     or new.purchase_quantity is distinct from old.purchase_quantity
     or new.unit is distinct from old.unit
     or new.custom_unit is distinct from old.custom_unit
     or new.cost_method is distinct from old.cost_method
     or new.yield_quantity is distinct from old.yield_quantity
     or new.yield_unit is distinct from old.yield_unit
     or new.estimated_cost_per_use is distinct from old.estimated_cost_per_use
     or new.waste_pct is distinct from old.waste_pct then
    new.last_price_change_at := timezone('utc', now());

    update public.product_cost_components
       set needs_recalculation = true,
           updated_at = timezone('utc', now())
     where business_material_id = new.id;

    update public.products p
       set cost_status = 'review',
           updated_at = timezone('utc', now())
     where exists (
       select 1
       from public.product_cost_components c
       where c.product_id = p.id
         and c.business_material_id = new.id
     );
  end if;
  return new;
end;
$$;

commit;
