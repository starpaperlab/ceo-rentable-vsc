begin;

alter table public.business_materials
  add column if not exists cost_method text not null default 'exact',
  add column if not exists yield_quantity numeric(14,4),
  add column if not exists yield_unit text,
  add column if not exists estimated_cost_per_use numeric(14,4),
  add column if not exists waste_pct numeric(7,4) not null default 0,
  add column if not exists supplier text,
  add column if not exists last_price_change_at timestamptz;

alter table public.business_materials drop constraint if exists business_materials_cost_method_check;
alter table public.business_materials add constraint business_materials_cost_method_check
  check (cost_method in ('exact','yield','estimated_use','automatic'));

alter table public.business_materials drop constraint if exists business_materials_yield_quantity_check;
alter table public.business_materials add constraint business_materials_yield_quantity_check
  check (yield_quantity is null or yield_quantity > 0);

alter table public.business_materials drop constraint if exists business_materials_estimated_use_check;
alter table public.business_materials add constraint business_materials_estimated_use_check
  check (estimated_cost_per_use is null or estimated_cost_per_use >= 0);

alter table public.business_materials drop constraint if exists business_materials_waste_pct_check;
alter table public.business_materials add constraint business_materials_waste_pct_check
  check (waste_pct >= 0 and waste_pct < 100);

alter table public.product_cost_components
  add column if not exists business_material_id uuid references public.business_materials(id) on delete set null,
  add column if not exists usage_unit text,
  add column if not exists custom_usage_unit text,
  add column if not exists source_cost_method text,
  add column if not exists source_unit_cost numeric(18,8),
  add column if not exists source_updated_at timestamptz,
  add column if not exists needs_recalculation boolean not null default false,
  add column if not exists calculation_notes jsonb not null default '{}'::jsonb;

create index if not exists idx_product_cost_components_material
  on public.product_cost_components(business_material_id)
  where business_material_id is not null;

create index if not exists idx_product_cost_components_recalculation
  on public.product_cost_components(workspace_id, needs_recalculation)
  where needs_recalculation = true;

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
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mark_material_cost_dependents_for_review on public.business_materials;
create trigger trg_mark_material_cost_dependents_for_review
before update on public.business_materials
for each row execute function public.mark_material_cost_dependents_for_review();

commit;
