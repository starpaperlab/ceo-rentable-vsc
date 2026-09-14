-- CEO Rentable OS™ — Fase 5 / Bloque A
-- Corrección de expansión JSON en cotización -> pedido.

begin;

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
  if target_quote_id is null then
    raise exception 'Cotización requerida.';
  end if;

  select *
    into v_quote
    from public.quotes
   where id = target_quote_id
   for update;

  if not found then
    raise exception 'Cotización no encontrada.';
  end if;

  if v_quote.workspace_id is null then
    raise exception 'La cotización no está asociada a un workspace.';
  end if;

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

  select *
    into v_existing
    from public.orders
   where quote_id = v_quote.id
   limit 1;

  if found then
    return v_existing;
  end if;

  v_line_count := case
    when jsonb_typeof(coalesce(v_quote.line_items, '[]'::jsonb)) = 'array'
      then jsonb_array_length(coalesce(v_quote.line_items, '[]'::jsonb))
    else 0
  end;

  if v_line_count = 0 then
    raise exception 'La cotización no contiene productos o servicios.';
  end if;

  v_order_number := public.reserve_order_number(v_quote.workspace_id);

  select code
    into v_status
    from public.order_statuses
   where workspace_id = v_quote.workspace_id
     and code = 'confirmed'
     and is_active = true
   limit 1;

  if v_status is null then
    select code
      into v_status
      from public.order_statuses
     where workspace_id = v_quote.workspace_id
       and is_default = true
       and is_active = true
     order by sort_order, created_at
     limit 1;
  end if;

  if v_status is null then
    raise exception 'Configura al menos un estado activo para pedidos.';
  end if;

  insert into public.orders (
    workspace_id,
    user_id,
    created_by,
    brand_profile_id,
    quote_id,
    order_number,
    date,
    client_id,
    client_name,
    client_email,
    client_phone,
    subtotal,
    discount_amount,
    shipping_amount,
    additional_charges,
    additional_charges_total,
    subtotal_before_tax,
    tax_enabled,
    tax_pct,
    tax_amount,
    total_final,
    operational_status,
    notes
  )
  values (
    v_quote.workspace_id,
    v_quote.user_id,
    v_quote.created_by,
    v_quote.brand_profile_id,
    v_quote.id,
    v_order_number,
    current_date,
    v_quote.client_id,
    v_quote.client_name,
    v_quote.client_email,
    v_quote.client_phone,
    coalesce(v_quote.subtotal, 0),
    0,
    0,
    coalesce(v_quote.additional_charges, '[]'::jsonb),
    coalesce(v_quote.additional_charges_total, 0),
    coalesce(v_quote.subtotal_before_tax, v_quote.subtotal, 0),
    coalesce(v_quote.tax_enabled, false),
    coalesce(v_quote.tax_pct, 0),
    coalesce(v_quote.tax_amount, 0),
    coalesce(v_quote.total_final, 0),
    v_status,
    v_quote.notes
  )
  returning * into v_order;

  insert into public.order_items (
    workspace_id,
    user_id,
    created_by,
    brand_profile_id,
    order_id,
    product_id,
    inventory_item_id,
    description,
    item_description,
    product_type,
    sku,
    category,
    unit,
    tax_pct,
    currency,
    quantity,
    unit_price,
    unit_cost_snapshot,
    unit_profit_snapshot,
    margin_pct_snapshot,
    total,
    sort_order
  )
  select
    v_quote.workspace_id,
    v_quote.user_id,
    v_quote.created_by,
    v_quote.brand_profile_id,
    v_order.id,
    nullif(item->>'product_id', '')::uuid,
    nullif(item->>'inventory_item_id', '')::uuid,
    coalesce(nullif(btrim(item->>'description'), ''), 'Producto / Servicio'),
    nullif(btrim(item->>'item_description'), ''),
    nullif(item->>'product_type', ''),
    nullif(item->>'sku', ''),
    nullif(item->>'category', ''),
    coalesce(nullif(btrim(item->>'unit'), ''), 'unidad'),
    coalesce(nullif(item->>'tax_pct', '')::numeric, 0),
    nullif(item->>'currency', ''),
    greatest(coalesce(nullif(item->>'quantity', '')::numeric, 1), 0),
    coalesce(nullif(item->>'unit_price', '')::numeric, 0),
    coalesce(nullif(item->>'unit_cost_snapshot', '')::numeric, 0),
    coalesce(
      nullif(item->>'unit_profit_snapshot', '')::numeric,
      coalesce(nullif(item->>'unit_price', '')::numeric, 0)
        - coalesce(nullif(item->>'unit_cost_snapshot', '')::numeric, 0)
    ),
    coalesce(
      nullif(item->>'margin_pct_snapshot', '')::numeric,
      case
        when coalesce(nullif(item->>'unit_price', '')::numeric, 0) > 0
          then (
            (
              coalesce(nullif(item->>'unit_price', '')::numeric, 0)
              - coalesce(nullif(item->>'unit_cost_snapshot', '')::numeric, 0)
            )
            / coalesce(nullif(item->>'unit_price', '')::numeric, 1)
          ) * 100
        else 0
      end
    ),
    coalesce(
      nullif(item->>'total', '')::numeric,
      coalesce(nullif(item->>'unit_price', '')::numeric, 0)
        * greatest(coalesce(nullif(item->>'quantity', '')::numeric, 1), 0)
    ),
    ordinality - 1
  from jsonb_array_elements(coalesce(v_quote.line_items, '[]'::jsonb))
       with ordinality as lines(item, ordinality);

  return v_order;
end;
$$;

revoke all on function public.convert_quote_to_order(uuid) from public;
revoke all on function public.convert_quote_to_order(uuid) from anon;
grant execute on function public.convert_quote_to_order(uuid) to authenticated;
grant execute on function public.convert_quote_to_order(uuid) to service_role;

commit;
