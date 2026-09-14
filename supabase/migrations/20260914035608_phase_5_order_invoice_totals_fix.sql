-- CEO Rentable OS™ — Fase 5 / Bloque B
-- Conserva descuentos, envío, cargos, impuestos y snapshots al convertir pedido -> factura.

begin;

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
  v_additional_charges jsonb;
  v_additional_charges_total numeric := 0;
  v_invoice_subtotal numeric := 0;
  v_subtotal_before_tax numeric := 0;
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
      update public.orders
      set generated_invoice_id = v_existing.id, updated_at = now()
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

  if coalesce(v_order.discount_amount, 0) > 0 then
    v_line_items := v_line_items || jsonb_build_array(
      jsonb_build_object(
        'description', 'Descuento aplicado',
        'item_description', 'Descuento heredado del pedido ' || v_order.order_number,
        'unit_price', -coalesce(v_order.discount_amount, 0),
        'quantity', 1,
        'total', -coalesce(v_order.discount_amount, 0)
      )
    );
  end if;

  v_additional_charges := coalesce(v_order.additional_charges, '[]'::jsonb);

  if coalesce(v_order.shipping_amount, 0) > 0 then
    v_additional_charges := v_additional_charges || jsonb_build_array(
      jsonb_build_object('name', 'Envío', 'amount', coalesce(v_order.shipping_amount, 0))
    );
  end if;

  v_invoice_subtotal := greatest(coalesce(v_order.subtotal, 0) - coalesce(v_order.discount_amount, 0), 0);
  v_additional_charges_total := coalesce(v_order.additional_charges_total, 0) + coalesce(v_order.shipping_amount, 0);
  v_subtotal_before_tax := v_invoice_subtotal + v_additional_charges_total;

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
    v_line_items, v_invoice_subtotal, v_additional_charges, v_additional_charges_total,
    v_subtotal_before_tax, coalesce(v_order.tax_enabled, false), coalesce(v_order.tax_pct, 0),
    coalesce(v_order.tax_amount, 0), coalesce(v_order.total_final, 0),
    coalesce(v_order.total_final, 0), coalesce(v_total_cost, 0),
    'pending',
    concat_ws(E'\n\n', 'Factura generada desde pedido ' || v_order.order_number || '.', nullif(v_order.notes, ''))
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
