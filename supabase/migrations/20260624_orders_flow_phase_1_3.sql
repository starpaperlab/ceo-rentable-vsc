-- CEO Rentable OS(TM)
-- Operational orders foundation and order-to-invoice connection.

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  created_by text,
  order_number text not null,
  date date not null default current_date,
  client_id uuid not null references public.clients(id) on delete restrict,
  client_name text,
  client_email text,
  client_phone text,
  contact_channel text,
  delivery_method text,
  personalization text,
  bank_account text,
  subtotal numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  shipping_amount numeric(12, 2) not null default 0,
  total_final numeric(12, 2) not null default 0,
  operational_status text not null default 'draft'
    check (operational_status in ('draft', 'pending', 'confirmed', 'in_production', 'ready_for_delivery', 'delivered', 'canceled')),
  generated_invoice_id uuid references public.invoices(id) on delete set null,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  created_by text,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  description text not null,
  item_description text,
  quantity numeric(12, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table if exists public.invoices
  add column if not exists order_id uuid references public.orders(id) on delete set null;

create unique index if not exists idx_orders_user_number on public.orders(user_id, order_number);
create index if not exists idx_orders_user_id on public.orders(user_id);
create index if not exists idx_orders_client_id on public.orders(client_id);
create index if not exists idx_orders_generated_invoice_id on public.orders(generated_invoice_id);
create index if not exists idx_order_items_user_id on public.order_items(user_id);
create index if not exists idx_order_items_order_id on public.order_items(order_id);
create index if not exists idx_invoices_order_id on public.invoices(order_id);

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

drop trigger if exists trg_order_items_updated_at on public.order_items;
create trigger trg_order_items_updated_at
before update on public.order_items
for each row execute function public.set_updated_at();

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists orders_owner_select on public.orders;
create policy orders_owner_select on public.orders
for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists orders_owner_insert on public.orders;
create policy orders_owner_insert on public.orders
for insert with check (user_id = auth.uid() or public.is_admin());

drop policy if exists orders_owner_update on public.orders;
create policy orders_owner_update on public.orders
for update using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists orders_owner_delete on public.orders;
create policy orders_owner_delete on public.orders
for delete using (user_id = auth.uid() or public.is_admin());

drop policy if exists order_items_owner_select on public.order_items;
create policy order_items_owner_select on public.order_items
for select using (
  user_id = auth.uid()
  or public.is_admin()
  or exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and (o.user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists order_items_owner_insert on public.order_items;
create policy order_items_owner_insert on public.order_items
for insert with check (
  user_id = auth.uid()
  or public.is_admin()
  or exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and (o.user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists order_items_owner_update on public.order_items;
create policy order_items_owner_update on public.order_items
for update using (
  user_id = auth.uid()
  or public.is_admin()
  or exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and (o.user_id = auth.uid() or public.is_admin())
  )
) with check (
  user_id = auth.uid()
  or public.is_admin()
  or exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and (o.user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists order_items_owner_delete on public.order_items;
create policy order_items_owner_delete on public.order_items
for delete using (
  user_id = auth.uid()
  or public.is_admin()
  or exists (
    select 1 from public.orders o
    where o.id = order_items.order_id
      and (o.user_id = auth.uid() or public.is_admin())
  )
);
