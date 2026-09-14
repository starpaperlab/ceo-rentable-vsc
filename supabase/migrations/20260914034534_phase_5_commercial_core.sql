-- CEO Rentable OS™ — Fase 5 / Bloque A
-- Motor comercial conectado: trazabilidad, estados configurables e integridad de conversiones.

begin;

alter table public.orders
  add column if not exists quote_id uuid,
  add column if not exists additional_charges jsonb not null default '[]'::jsonb,
  add column if not exists additional_charges_total numeric not null default 0,
  add column if not exists subtotal_before_tax numeric not null default 0,
  add column if not exists tax_enabled boolean not null default false,
  add column if not exists tax_pct numeric not null default 0,
  add column if not exists tax_amount numeric not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_quote_id_fkey'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_quote_id_fkey
      foreign key (quote_id)
      references public.quotes(id)
      on delete restrict;
  end if;
end;
$$;

create unique index if not exists idx_orders_quote_id_unique
  on public.orders(quote_id)
  where quote_id is not null;

create unique index if not exists idx_invoices_order_id_unique
  on public.invoices(order_id)
  where order_id is not null;

create unique index if not exists idx_orders_workspace_number_unique
  on public.orders(workspace_id, order_number)
  where workspace_id is not null;

create index if not exists idx_orders_quote_id
  on public.orders(quote_id);

create table if not exists public.order_statuses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  code text not null,
  name text not null,
  sort_order integer not null default 0,
  color text,
  is_default boolean not null default false,
  is_terminal boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_statuses_code_check check (btrim(code) <> ''),
  constraint order_statuses_name_check check (btrim(name) <> ''),
  constraint order_statuses_workspace_code_unique unique (workspace_id, code)
);

create unique index if not exists idx_order_statuses_one_default_per_workspace
  on public.order_statuses(workspace_id)
  where is_default = true and is_active = true;

create index if not exists idx_order_statuses_workspace_sort
  on public.order_statuses(workspace_id, sort_order, created_at);

insert into public.order_statuses (
  workspace_id, code, name, sort_order, color, is_default, is_terminal, is_active
)
select
  w.id,
  s.code,
  s.name,
  s.sort_order,
  s.color,
  s.is_default,
  s.is_terminal,
  true
from public.workspaces w
cross join (
  values
    ('draft', 'Borrador', 10, 'neutral', true, false),
    ('pending', 'Pendiente', 20, 'neutral', false, false),
    ('confirmed', 'Confirmado', 30, 'brand', false, false),
    ('in_production', 'En producción', 40, 'brand', false, false),
    ('ready_for_delivery', 'Listo para entrega', 50, 'brand', false, false),
    ('delivered', 'Entregado', 60, 'success', false, true),
    ('canceled', 'Cancelado', 70, 'danger', false, true)
) as s(code, name, sort_order, color, is_default, is_terminal)
on conflict (workspace_id, code) do nothing;

alter table public.orders
  drop constraint if exists orders_operational_status_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_workspace_operational_status_fkey'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_workspace_operational_status_fkey
      foreign key (workspace_id, operational_status)
      references public.order_statuses(workspace_id, code)
      on update cascade
      on delete restrict
      not valid;
  end if;
end;
$$;

alter table public.orders
  validate constraint orders_workspace_operational_status_fkey;

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid,
  changed_by_email text,
  changed_at timestamptz not null default now()
);

create index if not exists idx_order_status_history_order_changed
  on public.order_status_history(order_id, changed_at desc);

create index if not exists idx_order_status_history_workspace_changed
  on public.order_status_history(workspace_id, changed_at desc);

alter table public.order_statuses enable row level security;
alter table public.order_status_history enable row level security;

drop policy if exists order_statuses_workspace_select on public.order_statuses;
drop policy if exists order_statuses_workspace_insert on public.order_statuses;
drop policy if exists order_statuses_workspace_update on public.order_statuses;
drop policy if exists order_statuses_workspace_delete on public.order_statuses;

create policy order_statuses_workspace_select
  on public.order_statuses
  for select to authenticated
  using (public.workspace_has_module_access(workspace_id, 'orders'));

create policy order_statuses_workspace_insert
  on public.order_statuses
  for insert to authenticated
  with check (public.workspace_can_write(workspace_id, 'orders'));

create policy order_statuses_workspace_update
  on public.order_statuses
  for update to authenticated
  using (public.workspace_can_write(workspace_id, 'orders'))
  with check (public.workspace_can_write(workspace_id, 'orders'));

create policy order_statuses_workspace_delete
  on public.order_statuses
  for delete to authenticated
  using (public.workspace_can_write(workspace_id, 'orders'));

drop policy if exists order_status_history_workspace_select on public.order_status_history;
drop policy if exists order_status_history_workspace_insert on public.order_status_history;
drop policy if exists order_status_history_workspace_update on public.order_status_history;
drop policy if exists order_status_history_workspace_delete on public.order_status_history;

create policy order_status_history_workspace_select
  on public.order_status_history
  for select to authenticated
  using (public.workspace_has_module_access(workspace_id, 'orders'));

create policy order_status_history_workspace_insert
  on public.order_status_history
  for insert to authenticated
  with check (public.workspace_can_write(workspace_id, 'orders'));

create policy order_status_history_workspace_update
  on public.order_status_history
  for update to authenticated
  using (public.workspace_can_write(workspace_id, 'orders'))
  with check (public.workspace_can_write(workspace_id, 'orders'));

create policy order_status_history_workspace_delete
  on public.order_status_history
  for delete to authenticated
  using (public.workspace_can_write(workspace_id, 'orders'));

create or replace function public.capture_order_status_history()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history (
      workspace_id, order_id, from_status, to_status, changed_by, changed_by_email
    )
    values (
      new.workspace_id, new.id, null, new.operational_status,
      auth.uid(), lower(coalesce(auth.jwt() ->> 'email', ''))
    );
  elsif new.operational_status is distinct from old.operational_status then
    insert into public.order_status_history (
      workspace_id, order_id, from_status, to_status, changed_by, changed_by_email
    )
    values (
      new.workspace_id, new.id, old.operational_status, new.operational_status,
      auth.uid(), lower(coalesce(auth.jwt() ->> 'email', ''))
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_status_history on public.orders;
create trigger trg_orders_status_history
after insert or update of operational_status on public.orders
for each row execute function public.capture_order_status_history();

create or replace function public.reserve_order_number(target_workspace_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  highest_existing integer := 0;
  next_number integer;
begin
  if target_workspace_id is null then raise exception 'Workspace requerido.'; end if;
  if not public.workspace_can_write(target_workspace_id, 'orders') then raise exception 'No autorizado.'; end if;

  perform pg_advisory_xact_lock(
    hashtext('ceo_rentable_order_number'),
    hashtext(target_workspace_id::text)
  );

  select coalesce(max((regexp_match(order_number, '(\d+)\s*$'))[1]::integer), 0)
    into highest_existing
    from public.orders
   where workspace_id = target_workspace_id
     and order_number ~ '(\d+)\s*$';

  next_number := highest_existing + 1;
  return 'PED-' || lpad(next_number::text, 4, '0');
end;
$$;

revoke all on function public.reserve_order_number(uuid) from public;
revoke all on function public.reserve_order_number(uuid) from anon;
grant execute on function public.reserve_order_number(uuid) to authenticated;
grant execute on function public.reserve_order_number(uuid) to service_role;

create or replace function public.convert_quote_to_order(target_quote_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote public.quotes%rowtype;
  v_order public.orders%rowtype;
  v_existing public.orders%rowtype;
  v_order_number text;
  v_status text;
  v_line_count integer;
begin
  if target_quote_id is null then raise exception 'Cotización requerida.'; end if;

  select * into v_quote
  from public.quotes
  where id = target_quote_id
  for update;

  if not found then raise exception 'Cotización no encontrada.'; end if;
  if v_quote.workspace_id is null then raise exception 'La cotización no está asociada a un workspace.'; end if;

  if not public.workspace_can_write(v_quote.workspace_id, 'billing')
     or not public.workspace_can_write(v_quote.workspace_id, 'orders') then
    raise exception 'No autorizado.';
  end if;

  if coalesce(v_quote.status, 'pending') <> 'approved' then
    raise exception 'Solo una cotización aprobada puede convertirse en pedido.';
  end if;

  if v_quote.client_id is null then
    raise exception 'La cotización debe tener un cliente asociado antes de convertirse.';
  end if;

  select * into v_existing
  from public.orders
  where quote_id = v_quote.id
  limit 1;

  if found then return v_existing; end if;

  v_line_count := case
    when jsonb_typeof(coalesce(v_quote.line_items, '[]'::jsonb)) = 'array'
      then jsonb_array_length(coalesce(v_quote.line_items, '[]'::jsonb))
    else 0
  end;

  if v_line_count = 0 then raise exception 'La cotización no contiene productos o servicios.'; end if;

  v_order_number := public.reserve_order_number(v_quote.workspace_id);

  select code into v_status
  from public.order_statuses
  where workspace_id = v_quote.workspace_id
    and code = 'confirmed'
    and is_active = true
  limit 1;

  if v_status is null then
    select code into v_status
    from public.order_statuses
    where workspace_id = v_quote.workspace_id
      and is_default = true
      and is_active = true
    order by sort_order, created_at
    limit 1;
  end if;

  if v_status is null then raise exception 'Configura al menos un estado activo para pedidos.'; end if;

  insert into public.orders (
    workspace_id, user_id, created_by, brand_profile_id, quote_id,
    order_number, date, client_id, client_name, client_email, client_phone,
    subtotal, discount_amount, shipping_amount,
    additional_charges, additional_charges_total, subtotal_before_tax,
    tax_enabled, tax_pct, tax_amount, total_final, operational_status, notes
  )
  values (
    v_quote.workspace_id, v_quote.user_id, v_quote.created_by, v_quote.brand_profile_id, v_quote.id,
    v_order_number, current_date, v_quote.client_id, v_quote.client_name, v_quote.client_email, v_quote.client_phone,
    coalesce(v_quote.subtotal, 0), 0, 0,
    coalesce(v_quote.additional_charges, '[]'::jsonb),
    coalesce(v_quote.additional_charges_total, 0),
    coalesce(v_quote.subtotal_before_tax, v_quote.subtotal, 0),
    coalesce(v_quote.tax_enabled, false), coalesce(v_quote.tax_pct, 0),
    coalesce(v_quote.tax_amount, 0), coalesce(v_quote.total_final, 0),
    v_status, v_quote.notes
  )
  returning * into v_order;

  insert into public.order_items (
    workspace_id, user_id, created_by, brand_profile_id, order_id,
    product_id, inventory_item_id, description, item_description,
    product_type, sku, category, unit, tax_pct, currency,
    quantity, unit_price, unit_cost_snapshot, unit_profit_snapshot,
    margin_pct_snapshot, total, sort_order
  )
  select
    v_quote.workspace_id, v_quote.user_id, v_quote.created_by, v_quote.brand_profile_id, v_order.id,
    li.product_id, li.inventory_item_id,
    coalesce(nullif(btrim(li.description), ''), 'Producto / Servicio'),
    nullif(btrim(li.item_description), ''), li.product_type, li.sku, li.category,
    coalesce(nullif(btrim(li.unit), ''), 'unidad'),
    coalesce(li.tax_pct, 0), li.currency,
    greatest(coalesce(li.quantity, 1), 0), coalesce(li.unit_price, 0),
    coalesce(li.unit_cost_snapshot, 0),
    coalesce(li.unit_profit_snapshot, coalesce(li.unit_price, 0) - coalesce(li.unit_cost_snapshot, 0)),
    coalesce(
      li.margin_pct_snapshot,
      case when coalesce(li.unit_price, 0) > 0
        then ((coalesce(li.unit_price, 0) - coalesce(li.unit_cost_snapshot, 0)) / li.unit_price) * 100
        else 0 end
    ),
    coalesce(li.total, coalesce(li.unit_price, 0) * greatest(coalesce(li.quantity, 1), 0)),
    li.ordinality - 1
  from jsonb_to_recordset(coalesce(v_quote.line_items, '[]'::jsonb)) with ordinality as li(
    product_id uuid, inventory_item_id uuid, description text, item_description text,
    product_type text, sku text, category text, unit text, tax_pct numeric, currency text,
    unit_price numeric, unit_cost_snapshot numeric, unit_profit_snapshot numeric,
    margin_pct_snapshot numeric, quantity numeric, total numeric, ordinality bigint
  );

  return v_order;
end;
$$;

revoke all on function public.convert_quote_to_order(uuid) from public;
revoke all on function public.convert_quote_to_order(uuid) from anon;
grant execute on function public.convert_quote_to_order(uuid) to authenticated;
grant execute on function public.convert_quote_to_order(uuid) to service_role;

create or replace function public.convert_order_to_invoice(target_order_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_invoice public.invoices%rowtype;
  v_existing public.invoices%rowtype;
  v_invoice_number text;
  v_line_items jsonb;
  v_total_cost numeric := 0;
begin
  if target_order_id is null then raise exception 'Pedido requerido.'; end if;

  select * into v_order
  from public.orders
  where id = target_order_id
  for update;

  if not found then raise exception 'Pedido no encontrado.'; end if;
  if v_order.workspace_id is null then raise exception 'El pedido no está asociado a un workspace.'; end if;

  if not public.workspace_can_write(v_order.workspace_id, 'orders')
     or not public.workspace_can_write(v_order.workspace_id, 'billing') then
    raise exception 'No autorizado.';
  end if;

  select * into v_existing
  from public.invoices
  where order_id = v_order.id
  limit 1;

  if found then
    if v_order.generated_invoice_id is distinct from v_existing.id then
      update public.orders set generated_invoice_id = v_existing.id, updated_at = now()
      where id = v_order.id;
    end if;
    return v_existing;
  end if;

  select
    jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'product_id', oi.product_id,
        'inventory_item_id', oi.inventory_item_id,
        'description', oi.description,
        'item_description', oi.item_description,
        'product_type', oi.product_type,
        'sku', oi.sku,
        'category', oi.category,
        'unit', oi.unit,
        'tax_pct', oi.tax_pct,
        'currency', oi.currency,
        'unit_price', oi.unit_price,
        'unit_cost_snapshot', oi.unit_cost_snapshot,
        'unit_profit_snapshot', oi.unit_profit_snapshot,
        'margin_pct_snapshot', oi.margin_pct_snapshot,
        'quantity', oi.quantity,
        'total', oi.total
      ))
      order by oi.sort_order, oi.created_at
    ),
    coalesce(sum(coalesce(oi.unit_cost_snapshot, 0) * coalesce(oi.quantity, 0)), 0)
  into v_line_items, v_total_cost
  from public.order_items oi
  where oi.order_id = v_order.id;

  if v_line_items is null or jsonb_array_length(v_line_items) = 0 then
    raise exception 'El pedido no contiene productos o servicios para facturar.';
  end if;

  v_invoice_number := public.reserve_document_number(v_order.workspace_id, 'invoice');

  insert into public.invoices (
    workspace_id, user_id, created_by, brand_profile_id, order_id,
    invoice_number, date, due_date, client_id, client_name, client_email, client_phone,
    line_items, subtotal, additional_charges, additional_charges_total,
    subtotal_before_tax, tax_enabled, tax_pct, tax_amount, total_final,
    total_ingresos, total_costos, status, notes
  )
  values (
    v_order.workspace_id, v_order.user_id, v_order.created_by, v_order.brand_profile_id, v_order.id,
    v_invoice_number, current_date, null, v_order.client_id, v_order.client_name,
    v_order.client_email, v_order.client_phone,
    v_line_items, coalesce(v_order.subtotal, 0),
    coalesce(v_order.additional_charges, '[]'::jsonb),
    coalesce(v_order.additional_charges_total, 0),
    coalesce(v_order.subtotal_before_tax, v_order.subtotal, 0),
    coalesce(v_order.tax_enabled, false), coalesce(v_order.tax_pct, 0),
    coalesce(v_order.tax_amount, 0), coalesce(v_order.total_final, 0),
    coalesce(v_order.total_final, 0), coalesce(v_total_cost, 0),
    'pending', v_order.notes
  )
  returning * into v_invoice;

  update public.orders
  set generated_invoice_id = v_invoice.id,
      operational_status = case
        when operational_status in ('draft', 'pending') then 'confirmed'
        else operational_status
      end,
      updated_at = now()
  where id = v_order.id;

  return v_invoice;
end;
$$;

revoke all on function public.convert_order_to_invoice(uuid) from public;
revoke all on function public.convert_order_to_invoice(uuid) from anon;
grant execute on function public.convert_order_to_invoice(uuid) to authenticated;
grant execute on function public.convert_order_to_invoice(uuid) to service_role;

commit;
