alter table public.products
  add column if not exists pricing_override_enabled boolean not null default false;

create table if not exists public.pricing_category_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_by text,
  category text not null,
  category_key text generated always as (lower(btrim(category))) stored,
  target_margin numeric,
  minimum_margin numeric,
  percentage_fees numeric,
  fixed_fees numeric,
  commercial_rounding numeric,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint pricing_category_settings_category_nonempty check (length(btrim(category)) > 0),
  constraint pricing_category_settings_target_valid check (target_margin is null or (target_margin >= 0 and target_margin < 100)),
  constraint pricing_category_settings_minimum_valid check (minimum_margin is null or (minimum_margin >= 0 and minimum_margin < 100)),
  constraint pricing_category_settings_fee_valid check (percentage_fees is null or (percentage_fees >= 0 and percentage_fees < 100)),
  constraint pricing_category_settings_fixed_valid check (fixed_fees is null or fixed_fees >= 0),
  constraint pricing_category_settings_rounding_valid check (commercial_rounding is null or commercial_rounding > 0),
  constraint pricing_category_settings_unique unique (workspace_id, category_key)
);

create index if not exists idx_pricing_category_settings_workspace
  on public.pricing_category_settings(workspace_id, category_key);

alter table public.pricing_category_settings enable row level security;
revoke all on table public.pricing_category_settings from anon, authenticated;
grant select, insert, update, delete on table public.pricing_category_settings to authenticated;

drop policy if exists pricing_category_settings_workspace_select on public.pricing_category_settings;
create policy pricing_category_settings_workspace_select
on public.pricing_category_settings for select to authenticated
using (public.workspace_has_module_access(workspace_id, 'products'));

drop policy if exists pricing_category_settings_workspace_insert on public.pricing_category_settings;
create policy pricing_category_settings_workspace_insert
on public.pricing_category_settings for insert to authenticated
with check (public.workspace_can_write(workspace_id, 'products') and user_id = auth.uid());

drop policy if exists pricing_category_settings_workspace_update on public.pricing_category_settings;
create policy pricing_category_settings_workspace_update
on public.pricing_category_settings for update to authenticated
using (public.workspace_can_write(workspace_id, 'products'))
with check (public.workspace_can_write(workspace_id, 'products') and user_id = auth.uid());

drop policy if exists pricing_category_settings_workspace_delete on public.pricing_category_settings;
create policy pricing_category_settings_workspace_delete
on public.pricing_category_settings for delete to authenticated
using (public.workspace_can_write(workspace_id, 'products'));

create or replace function public.sync_pricing_category_settings_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;
revoke all on function public.sync_pricing_category_settings_updated_at() from public, anon, authenticated;

drop trigger if exists trg_pricing_category_settings_updated_at on public.pricing_category_settings;
create trigger trg_pricing_category_settings_updated_at
before update on public.pricing_category_settings
for each row execute function public.sync_pricing_category_settings_updated_at();

update public.products p
set pricing_override_enabled = true
from public.business_config bc
where bc.workspace_id = p.workspace_id
  and (
    (p.target_margin is not null and p.target_margin is distinct from bc.target_margin_pct)
    or (p.minimum_margin is not null and p.minimum_margin is distinct from bc.minimum_margin_pct)
    or (p.percentage_fees is not null and p.percentage_fees is distinct from bc.payment_fee_pct)
    or (p.fixed_fees is not null and p.fixed_fees is distinct from bc.payment_fixed_fee)
    or (p.commercial_rounding is not null and p.commercial_rounding is distinct from bc.commercial_rounding)
  );

create or replace function public.apply_pricing_inheritance_for_workspace(target_workspace_id uuid, target_category_key text default null)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  update public.products p
  set
    target_margin = coalesce(
      (select pcs.target_margin from public.pricing_category_settings pcs where pcs.workspace_id=p.workspace_id and pcs.category_key=lower(btrim(coalesce(p.category,''))) limit 1),
      (select bc.target_margin_pct from public.business_config bc where bc.workspace_id=p.workspace_id order by bc.updated_at desc limit 1), 40),
    minimum_margin = coalesce(
      (select pcs.minimum_margin from public.pricing_category_settings pcs where pcs.workspace_id=p.workspace_id and pcs.category_key=lower(btrim(coalesce(p.category,''))) limit 1),
      (select bc.minimum_margin_pct from public.business_config bc where bc.workspace_id=p.workspace_id order by bc.updated_at desc limit 1), 20),
    percentage_fees = coalesce(
      (select pcs.percentage_fees from public.pricing_category_settings pcs where pcs.workspace_id=p.workspace_id and pcs.category_key=lower(btrim(coalesce(p.category,''))) limit 1),
      (select bc.payment_fee_pct from public.business_config bc where bc.workspace_id=p.workspace_id order by bc.updated_at desc limit 1), 0),
    fixed_fees = coalesce(
      (select pcs.fixed_fees from public.pricing_category_settings pcs where pcs.workspace_id=p.workspace_id and pcs.category_key=lower(btrim(coalesce(p.category,''))) limit 1),
      (select bc.payment_fixed_fee from public.business_config bc where bc.workspace_id=p.workspace_id order by bc.updated_at desc limit 1), 0),
    commercial_rounding = coalesce(
      (select pcs.commercial_rounding from public.pricing_category_settings pcs where pcs.workspace_id=p.workspace_id and pcs.category_key=lower(btrim(coalesce(p.category,''))) limit 1),
      (select bc.commercial_rounding from public.business_config bc where bc.workspace_id=p.workspace_id order by bc.updated_at desc limit 1), 10),
    updated_at = timezone('utc', now())
  where p.workspace_id=target_workspace_id
    and p.pricing_override_enabled=false
    and (target_category_key is null or lower(btrim(coalesce(p.category,'')))=target_category_key);
end;
$$;
revoke all on function public.apply_pricing_inheritance_for_workspace(uuid,text) from public, anon;
grant execute on function public.apply_pricing_inheritance_for_workspace(uuid,text) to authenticated, service_role;

create or replace function public.propagate_business_pricing_defaults()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.workspace_id is null then return new; end if;
  if new.target_margin_pct is distinct from old.target_margin_pct
     or new.minimum_margin_pct is distinct from old.minimum_margin_pct
     or new.payment_fee_pct is distinct from old.payment_fee_pct
     or new.payment_fixed_fee is distinct from old.payment_fixed_fee
     or new.commercial_rounding is distinct from old.commercial_rounding then
    perform public.apply_pricing_inheritance_for_workspace(new.workspace_id, null);
  end if;
  return new;
end;
$$;
revoke all on function public.propagate_business_pricing_defaults() from public, anon, authenticated;

drop trigger if exists trg_propagate_business_pricing_defaults on public.business_config;
create trigger trg_propagate_business_pricing_defaults
after update of target_margin_pct,minimum_margin_pct,payment_fee_pct,payment_fixed_fee,commercial_rounding
on public.business_config for each row execute function public.propagate_business_pricing_defaults();

create or replace function public.propagate_category_pricing_rule()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  v_workspace uuid;
  v_category_key text;
  v_old_category_key text;
begin
  v_workspace := coalesce(new.workspace_id, old.workspace_id);
  v_category_key := case when tg_op='DELETE' then old.category_key else new.category_key end;
  v_old_category_key := case when tg_op='UPDATE' then old.category_key else null end;
  if tg_op='UPDATE' and v_old_category_key is distinct from v_category_key then
    perform public.apply_pricing_inheritance_for_workspace(v_workspace, v_old_category_key);
  end if;
  perform public.apply_pricing_inheritance_for_workspace(v_workspace, v_category_key);
  return coalesce(new, old);
end;
$$;
revoke all on function public.propagate_category_pricing_rule() from public, anon, authenticated;

drop trigger if exists trg_propagate_category_pricing_rule on public.pricing_category_settings;
create trigger trg_propagate_category_pricing_rule
after insert or update or delete on public.pricing_category_settings
for each row execute function public.propagate_category_pricing_rule();

create or replace function public.apply_pricing_inheritance_on_product()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  bc public.business_config%rowtype;
  pcs public.pricing_category_settings%rowtype;
begin
  if new.pricing_override_enabled=true then return new; end if;
  select * into bc from public.business_config where workspace_id=new.workspace_id order by updated_at desc limit 1;
  select * into pcs from public.pricing_category_settings
   where workspace_id=new.workspace_id and category_key=lower(btrim(coalesce(new.category,''))) limit 1;
  new.target_margin:=coalesce(pcs.target_margin,bc.target_margin_pct,40);
  new.minimum_margin:=coalesce(pcs.minimum_margin,bc.minimum_margin_pct,20);
  new.percentage_fees:=coalesce(pcs.percentage_fees,bc.payment_fee_pct,0);
  new.fixed_fees:=coalesce(pcs.fixed_fees,bc.payment_fixed_fee,0);
  new.commercial_rounding:=coalesce(pcs.commercial_rounding,bc.commercial_rounding,10);
  return new;
end;
$$;
revoke all on function public.apply_pricing_inheritance_on_product() from public, anon, authenticated;

drop trigger if exists trg_apply_pricing_inheritance_on_product on public.products;
create trigger trg_apply_pricing_inheritance_on_product
before insert or update of category,pricing_override_enabled
on public.products for each row execute function public.apply_pricing_inheritance_on_product();

do $$
declare w record;
begin
  for w in select distinct workspace_id from public.products where workspace_id is not null loop
    perform public.apply_pricing_inheritance_for_workspace(w.workspace_id,null);
  end loop;
end $$;
