alter table public.order_items
  add column if not exists percentage_fees_snapshot numeric not null default 0,
  add column if not exists fixed_fees_snapshot numeric not null default 0,
  add column if not exists minimum_margin_snapshot numeric not null default 0,
  add column if not exists target_margin_snapshot numeric not null default 0,
  add column if not exists pricing_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists pricing_engine_version_snapshot integer not null default 1;

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

  select * into v_quote from public.quotes where id = target_quote_id for update;
  if not found then raise exception 'Cotización no encontrada.'; end if;
  if v_quote.workspace_id is null then raise exception 'La cotización no está asociada a un workspace.'; end if;
  if not public.workspace_can_write(v_quote.workspace_id, 'billing')
     or not public.workspace_can_write(v_quote.workspace_id, 'orders') then
    raise exception 'No autorizado.';
  end if;
  if coalesce(v_quote.status, 'pending') <> 'approved' then
    raise exception 'Solo una cotización aprobada puede convertirse en pedido.';
  end if;
  if v_quote.client_id is null then raise exception 'La cotización debe tener un cliente asociado antes de convertirse.'; end if;

  select * into v_existing from public.orders where quote_id = v_quote.id limit 1;
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
  where workspace_id = v_quote.workspace_id and code = 'confirmed' and is_active = true
  limit 1;

  if v_status is null then
    select code into v_status
    from public.order_statuses
    where workspace_id = v_quote.workspace_id and is_default = true and is_active = true
    order by sort_order, created_at limit 1;
  end if;
  if v_status is null then raise exception 'Configura al menos un estado activo para pedidos.'; end if;

  insert into public.orders (
    workspace_id,user_id,created_by,brand_profile_id,quote_id,order_number,date,
    client_id,client_name,client_email,client_phone,subtotal,discount_amount,shipping_amount,
    additional_charges,additional_charges_total,subtotal_before_tax,tax_enabled,tax_pct,tax_amount,
    total_final,operational_status,notes
  ) values (
    v_quote.workspace_id,v_quote.user_id,v_quote.created_by,v_quote.brand_profile_id,v_quote.id,
    v_order_number,current_date,v_quote.client_id,v_quote.client_name,v_quote.client_email,v_quote.client_phone,
    coalesce(v_quote.subtotal,0),0,0,coalesce(v_quote.additional_charges,'[]'::jsonb),
    coalesce(v_quote.additional_charges_total,0),coalesce(v_quote.subtotal_before_tax,v_quote.subtotal,0),
    coalesce(v_quote.tax_enabled,false),coalesce(v_quote.tax_pct,0),coalesce(v_quote.tax_amount,0),
    coalesce(v_quote.total_final,0),v_status,v_quote.notes
  ) returning * into v_order;

  insert into public.order_items (
    workspace_id,user_id,created_by,brand_profile_id,order_id,product_id,inventory_item_id,
    description,item_description,product_type,sku,category,unit,tax_pct,currency,quantity,unit_price,
    unit_cost_snapshot,unit_profit_snapshot,margin_pct_snapshot,cost_breakdown_snapshot,cost_engine_version_snapshot,
    percentage_fees_snapshot,fixed_fees_snapshot,minimum_margin_snapshot,target_margin_snapshot,
    pricing_snapshot,pricing_engine_version_snapshot,total,sort_order
  )
  select
    v_quote.workspace_id,v_quote.user_id,v_quote.created_by,v_quote.brand_profile_id,v_order.id,
    nullif(item->>'product_id','')::uuid,nullif(item->>'inventory_item_id','')::uuid,
    coalesce(nullif(btrim(item->>'description'),''),'Producto / Servicio'),
    nullif(btrim(item->>'item_description'),''),nullif(item->>'product_type',''),nullif(item->>'sku',''),
    nullif(item->>'category',''),coalesce(nullif(btrim(item->>'unit'),''),'unidad'),
    coalesce(nullif(item->>'tax_pct','')::numeric,0),nullif(item->>'currency',''),
    greatest(coalesce(nullif(item->>'quantity','')::numeric,1),0),
    coalesce(nullif(item->>'unit_price','')::numeric,0),
    coalesce(nullif(item->>'unit_cost_snapshot','')::numeric,0),
    coalesce(nullif(item->>'unit_profit_snapshot','')::numeric,0),
    coalesce(nullif(item->>'margin_pct_snapshot','')::numeric,0),
    coalesce(item->'cost_breakdown_snapshot','{}'::jsonb),
    coalesce(nullif(item->>'cost_engine_version_snapshot','')::integer,1),
    coalesce(nullif(item->>'percentage_fees_snapshot','')::numeric,0),
    coalesce(nullif(item->>'fixed_fees_snapshot','')::numeric,0),
    coalesce(nullif(item->>'minimum_margin_snapshot','')::numeric,0),
    coalesce(nullif(item->>'target_margin_snapshot','')::numeric,0),
    coalesce(item->'pricing_snapshot','{}'::jsonb),
    coalesce(nullif(item->>'pricing_engine_version_snapshot','')::integer,1),
    coalesce(nullif(item->>'total','')::numeric,
      coalesce(nullif(item->>'unit_price','')::numeric,0) * greatest(coalesce(nullif(item->>'quantity','')::numeric,1),0)),
    ordinality - 1
  from jsonb_array_elements(coalesce(v_quote.line_items,'[]'::jsonb)) with ordinality as lines(item, ordinality);

  return v_order;
end;
$$;

revoke all on function public.convert_quote_to_order(uuid) from public, anon;
grant execute on function public.convert_quote_to_order(uuid) to authenticated, service_role;

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
  select * into v_order from public.orders where id = target_order_id for update;
  if not found then raise exception 'Pedido no encontrado.'; end if;
  if v_order.workspace_id is null then raise exception 'El pedido no está asociado a un workspace.'; end if;
  if not public.workspace_can_write(v_order.workspace_id,'orders')
     or not public.workspace_can_write(v_order.workspace_id,'billing') then raise exception 'No autorizado.'; end if;

  select * into v_existing from public.invoices where order_id = v_order.id limit 1;
  if found then
    if v_order.generated_invoice_id is distinct from v_existing.id then
      update public.orders set generated_invoice_id=v_existing.id,updated_at=now() where id=v_order.id;
    end if;
    return v_existing;
  end if;

  select jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      'product_id',oi.product_id,'inventory_item_id',oi.inventory_item_id,'description',oi.description,
      'item_description',oi.item_description,'product_type',oi.product_type,'sku',oi.sku,'category',oi.category,
      'unit',oi.unit,'tax_pct',oi.tax_pct,'currency',oi.currency,'unit_price',oi.unit_price,
      'unit_cost_snapshot',oi.unit_cost_snapshot,'unit_profit_snapshot',oi.unit_profit_snapshot,
      'margin_pct_snapshot',oi.margin_pct_snapshot,'cost_breakdown_snapshot',oi.cost_breakdown_snapshot,
      'cost_engine_version_snapshot',oi.cost_engine_version_snapshot,
      'percentage_fees_snapshot',oi.percentage_fees_snapshot,'fixed_fees_snapshot',oi.fixed_fees_snapshot,
      'minimum_margin_snapshot',oi.minimum_margin_snapshot,'target_margin_snapshot',oi.target_margin_snapshot,
      'pricing_snapshot',oi.pricing_snapshot,'pricing_engine_version_snapshot',oi.pricing_engine_version_snapshot,
      'quantity',oi.quantity,'total',oi.total
    )) order by oi.sort_order,oi.created_at
  ),coalesce(sum(coalesce(oi.unit_cost_snapshot,0)*coalesce(oi.quantity,0)),0)
  into v_line_items,v_total_cost
  from public.order_items oi where oi.order_id=v_order.id;

  if v_line_items is null or jsonb_array_length(v_line_items)=0 then
    raise exception 'El pedido no contiene productos o servicios para facturar.';
  end if;

  if coalesce(v_order.discount_amount,0)>0 then
    v_line_items:=v_line_items||jsonb_build_array(jsonb_build_object(
      'description','Descuento aplicado','item_description','Descuento heredado del pedido '||v_order.order_number,
      'unit_price',-coalesce(v_order.discount_amount,0),'quantity',1,'total',-coalesce(v_order.discount_amount,0)
    ));
  end if;

  v_additional_charges:=coalesce(v_order.additional_charges,'[]'::jsonb);
  if coalesce(v_order.shipping_amount,0)>0 then
    v_additional_charges:=v_additional_charges||jsonb_build_array(jsonb_build_object('name','Envío','amount',coalesce(v_order.shipping_amount,0)));
  end if;

  v_invoice_subtotal:=greatest(coalesce(v_order.subtotal,0)-coalesce(v_order.discount_amount,0),0);
  v_additional_charges_total:=coalesce(v_order.additional_charges_total,0)+coalesce(v_order.shipping_amount,0);
  v_subtotal_before_tax:=v_invoice_subtotal+v_additional_charges_total;
  v_invoice_number:=public.reserve_document_number(v_order.workspace_id,'invoice');

  insert into public.invoices (
    workspace_id,user_id,created_by,brand_profile_id,order_id,invoice_number,date,due_date,
    client_id,client_name,client_email,client_phone,line_items,subtotal,additional_charges,
    additional_charges_total,subtotal_before_tax,tax_enabled,tax_pct,tax_amount,total_final,
    total_ingresos,total_costos,status,notes
  ) values (
    v_order.workspace_id,v_order.user_id,v_order.created_by,v_order.brand_profile_id,v_order.id,
    v_invoice_number,current_date,null,v_order.client_id,v_order.client_name,v_order.client_email,v_order.client_phone,
    v_line_items,v_invoice_subtotal,v_additional_charges,v_additional_charges_total,v_subtotal_before_tax,
    coalesce(v_order.tax_enabled,false),coalesce(v_order.tax_pct,0),coalesce(v_order.tax_amount,0),
    coalesce(v_order.total_final,0),coalesce(v_order.total_final,0),coalesce(v_total_cost,0),'pending',
    concat_ws(E'\n\n','Factura generada desde pedido '||v_order.order_number||'.',nullif(v_order.notes,''))
  ) returning * into v_invoice;

  update public.orders set generated_invoice_id=v_invoice.id,
    operational_status=case when operational_status in ('draft','pending') then 'confirmed' else operational_status end,
    updated_at=now()
  where id=v_order.id;

  return v_invoice;
end;
$$;

revoke all on function public.convert_order_to_invoice(uuid) from public, anon;
grant execute on function public.convert_order_to_invoice(uuid) to authenticated, service_role;
