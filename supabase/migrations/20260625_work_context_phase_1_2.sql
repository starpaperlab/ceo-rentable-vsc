-- CEO Rentable OS(TM)
-- Work context foundation: brand access assignments + nullable brand links.
-- Additive only. No legacy data backfill and no global filtering changes.

create table if not exists public.brand_profile_members (
  id uuid primary key default gen_random_uuid(),
  brand_profile_id uuid not null references public.brand_profiles(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'manager', 'member', 'viewer')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint brand_profile_members_brand_user_unique unique (brand_profile_id, user_id)
);

create index if not exists idx_brand_profile_members_brand_id
  on public.brand_profile_members(brand_profile_id);

create index if not exists idx_brand_profile_members_user_id
  on public.brand_profile_members(user_id);

alter table public.brand_profile_members enable row level security;

drop policy if exists brand_profile_members_select on public.brand_profile_members;
create policy brand_profile_members_select
on public.brand_profile_members
for select
using (user_id = auth.uid() or public.is_admin());

drop policy if exists brand_profile_members_insert_admin on public.brand_profile_members;
create policy brand_profile_members_insert_admin
on public.brand_profile_members
for insert
with check (public.is_admin());

drop policy if exists brand_profile_members_update_admin on public.brand_profile_members;
create policy brand_profile_members_update_admin
on public.brand_profile_members
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists brand_profile_members_delete_admin on public.brand_profile_members;
create policy brand_profile_members_delete_admin
on public.brand_profile_members
for delete
using (public.is_admin());

do $$
begin
  if exists (
    select 1
      from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname = 'set_updated_at'
  )
  and not exists (
    select 1
      from pg_trigger
     where tgname = 'trg_brand_profile_members_updated_at'
       and tgrelid = 'public.brand_profile_members'::regclass
  ) then
    execute '
      create trigger trg_brand_profile_members_updated_at
      before update on public.brand_profile_members
      for each row
      execute function public.set_updated_at()
    ';
  end if;
end
$$;

drop policy if exists "Assigned users can view brand profiles" on public.brand_profiles;
create policy "Assigned users can view brand profiles"
on public.brand_profiles
for select
using (
  exists (
    select 1
      from public.brand_profile_members bpm
     where bpm.brand_profile_id = brand_profiles.id
       and bpm.user_id = auth.uid()
  )
);

alter table if exists public.clients
  add column if not exists brand_profile_id uuid references public.brand_profiles(id) on delete set null;

alter table if exists public.products
  add column if not exists brand_profile_id uuid references public.brand_profiles(id) on delete set null;

alter table if exists public.orders
  add column if not exists brand_profile_id uuid references public.brand_profiles(id) on delete set null;

alter table if exists public.order_items
  add column if not exists brand_profile_id uuid references public.brand_profiles(id) on delete set null;

alter table if exists public.inventory_items
  add column if not exists brand_profile_id uuid references public.brand_profiles(id) on delete set null;

alter table if exists public.inventory_movements
  add column if not exists brand_profile_id uuid references public.brand_profiles(id) on delete set null;

alter table if exists public.monthly_records
  add column if not exists brand_profile_id uuid references public.brand_profiles(id) on delete set null;

create index if not exists idx_clients_brand_profile_id
  on public.clients(brand_profile_id);

create index if not exists idx_products_brand_profile_id
  on public.products(brand_profile_id);

create index if not exists idx_orders_brand_profile_id
  on public.orders(brand_profile_id);

create index if not exists idx_order_items_brand_profile_id
  on public.order_items(brand_profile_id);

create index if not exists idx_inventory_items_brand_profile_id
  on public.inventory_items(brand_profile_id);

create index if not exists idx_inventory_movements_brand_profile_id
  on public.inventory_movements(brand_profile_id);

create index if not exists idx_monthly_records_brand_profile_id
  on public.monthly_records(brand_profile_id);
