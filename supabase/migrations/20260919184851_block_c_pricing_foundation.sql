alter table public.business_config
  add column if not exists minimum_margin_pct numeric not null default 20,
  add column if not exists payment_fee_pct numeric not null default 0,
  add column if not exists payment_fixed_fee numeric not null default 0,
  add column if not exists commercial_rounding numeric not null default 10;

alter table public.business_config drop constraint if exists business_config_minimum_margin_valid;
alter table public.business_config add constraint business_config_minimum_margin_valid
  check (minimum_margin_pct >= 0 and minimum_margin_pct < 100) not valid;
alter table public.business_config validate constraint business_config_minimum_margin_valid;

alter table public.business_config drop constraint if exists business_config_payment_fee_valid;
alter table public.business_config add constraint business_config_payment_fee_valid
  check (payment_fee_pct >= 0 and payment_fee_pct < 100 and payment_fixed_fee >= 0) not valid;
alter table public.business_config validate constraint business_config_payment_fee_valid;

alter table public.products
  add column if not exists minimum_margin numeric,
  add column if not exists percentage_fees numeric,
  add column if not exists fixed_fees numeric,
  add column if not exists commercial_rounding numeric,
  add column if not exists price_status text not null default 'current',
  add column if not exists price_calculated_at timestamptz,
  add column if not exists pricing_engine_version integer not null default 1,
  add column if not exists pricing_snapshot jsonb not null default '{}'::jsonb;

alter table public.products drop constraint if exists products_minimum_margin_valid;
alter table public.products add constraint products_minimum_margin_valid
  check (minimum_margin is null or (minimum_margin >= 0 and minimum_margin < 100)) not valid;
alter table public.products validate constraint products_minimum_margin_valid;

alter table public.products drop constraint if exists products_percentage_fees_valid;
alter table public.products add constraint products_percentage_fees_valid
  check (percentage_fees is null or (percentage_fees >= 0 and percentage_fees < 100)) not valid;
alter table public.products validate constraint products_percentage_fees_valid;

alter table public.products drop constraint if exists products_fixed_fees_valid;
alter table public.products add constraint products_fixed_fees_valid
  check (fixed_fees is null or fixed_fees >= 0) not valid;
alter table public.products validate constraint products_fixed_fees_valid;

alter table public.products drop constraint if exists products_price_status_valid;
alter table public.products add constraint products_price_status_valid
  check (price_status in ('current','review','outdated')) not valid;
alter table public.products validate constraint products_price_status_valid;

create table if not exists public.product_price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete cascade,
  old_price numeric not null default 0,
  new_price numeric not null default 0,
  cost_snapshot numeric not null default 0,
  margin_snapshot numeric not null default 0,
  markup_snapshot numeric,
  target_margin_snapshot numeric,
  minimum_margin_snapshot numeric,
  percentage_fees_snapshot numeric not null default 0,
  fixed_fees_snapshot numeric not null default 0,
  changed_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_product_price_history_product on public.product_price_history(product_id, changed_at desc);
create index if not exists idx_product_price_history_workspace on public.product_price_history(workspace_id, changed_at desc);

alter table public.product_price_history enable row level security;
revoke all on table public.product_price_history from anon, authenticated;
grant select, insert on table public.product_price_history to authenticated;

drop policy if exists product_price_history_workspace_select on public.product_price_history;
create policy product_price_history_workspace_select
on public.product_price_history for select to authenticated
using (public.workspace_has_module_access(workspace_id, 'products'));

drop policy if exists product_price_history_workspace_insert on public.product_price_history;
create policy product_price_history_workspace_insert
on public.product_price_history for insert to authenticated
with check (
  public.workspace_can_write(workspace_id, 'products')
  and exists (
    select 1 from public.products p
    where p.id = product_id and p.workspace_id = workspace_id and p.user_id = user_id
  )
);

create or replace function public.track_product_price_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_profit numeric;
begin
  if new.sale_price is distinct from old.sale_price then
    v_profit := coalesce(new.sale_price, 0) - coalesce(new.costo_unitario, 0)
      - (coalesce(new.sale_price, 0) * coalesce(new.percentage_fees, 0) / 100)
      - coalesce(new.fixed_fees, 0);

    insert into public.product_price_history (
      product_id, workspace_id, user_id, old_price, new_price, cost_snapshot,
      margin_snapshot, markup_snapshot, target_margin_snapshot, minimum_margin_snapshot,
      percentage_fees_snapshot, fixed_fees_snapshot
    ) values (
      new.id, new.workspace_id, new.user_id, coalesce(old.sale_price, 0), coalesce(new.sale_price, 0),
      coalesce(new.costo_unitario, 0),
      case when coalesce(new.sale_price, 0) > 0 then round((v_profit / new.sale_price) * 100, 2) else 0 end,
      case when coalesce(new.costo_unitario, 0) > 0 then round((v_profit / new.costo_unitario) * 100, 2) else null end,
      new.target_margin, new.minimum_margin, coalesce(new.percentage_fees, 0), coalesce(new.fixed_fees, 0)
    );
  end if;
  return new;
end;
$$;

revoke all on function public.track_product_price_change() from public, anon, authenticated;

drop trigger if exists trg_track_product_price_change on public.products;
create trigger trg_track_product_price_change
after update of sale_price on public.products
for each row execute function public.track_product_price_change();

create or replace function public.mark_product_price_for_review()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.costo_unitario is distinct from old.costo_unitario
     or new.target_margin is distinct from old.target_margin
     or new.minimum_margin is distinct from old.minimum_margin
     or new.percentage_fees is distinct from old.percentage_fees
     or new.fixed_fees is distinct from old.fixed_fees then
    new.price_status := 'review';
  end if;
  return new;
end;
$$;

revoke all on function public.mark_product_price_for_review() from public, anon, authenticated;

drop trigger if exists trg_mark_product_price_for_review on public.products;
create trigger trg_mark_product_price_for_review
before update of costo_unitario, target_margin, minimum_margin, percentage_fees, fixed_fees on public.products
for each row execute function public.mark_product_price_for_review();
