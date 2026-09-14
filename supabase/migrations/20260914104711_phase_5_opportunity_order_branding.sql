-- CEO Rentable OS™ — Fase 5 / Bloque F
-- Conserva el perfil de marca del cliente al convertir una oportunidad ganada en pedido.

begin;

create or replace function public.convert_opportunity_to_order(target_opportunity_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opportunity public.opportunities%rowtype;
  v_stage public.opportunity_stages%rowtype;
  v_client public.clients%rowtype;
  v_order public.orders%rowtype;
  v_existing public.orders%rowtype;
  v_order_number text;
  v_status text;
begin
  if target_opportunity_id is null then raise exception 'Oportunidad requerida.'; end if;

  select * into v_opportunity
  from public.opportunities
  where id = target_opportunity_id
  for update;

  if not found then raise exception 'Oportunidad no encontrada.'; end if;

  if not public.workspace_can_write(v_opportunity.workspace_id, 'opportunities')
     or not public.workspace_can_write(v_opportunity.workspace_id, 'orders') then
    raise exception 'No autorizado.';
  end if;

  select * into v_stage
  from public.opportunity_stages
  where id = v_opportunity.stage_id;

  if v_stage.stage_type <> 'won' then
    raise exception 'Solo una oportunidad ganada puede convertirse en pedido.';
  end if;

  select * into v_existing
  from public.orders
  where opportunity_id = v_opportunity.id
  limit 1;

  if found then return v_existing; end if;

  select * into v_client
  from public.clients
  where id = v_opportunity.client_id
    and workspace_id = v_opportunity.workspace_id;

  if not found then
    raise exception 'El cliente de la oportunidad no está disponible en este workspace.';
  end if;

  v_order_number := public.reserve_order_number(v_opportunity.workspace_id);

  select code into v_status
  from public.order_statuses
  where workspace_id = v_opportunity.workspace_id
    and code = 'draft'
    and is_active
  limit 1;

  if v_status is null then
    select code into v_status
    from public.order_statuses
    where workspace_id = v_opportunity.workspace_id
      and is_default
      and is_active
    order by sort_order
    limit 1;
  end if;

  insert into public.orders (
    workspace_id, user_id, created_by, brand_profile_id,
    order_number, date,
    client_id, client_name, client_email, client_phone,
    subtotal, discount_amount, shipping_amount, total_final,
    operational_status, notes, opportunity_id
  )
  values (
    v_opportunity.workspace_id,
    v_opportunity.user_id,
    v_opportunity.created_by,
    v_client.brand_profile_id,
    v_order_number,
    current_date,
    v_client.id,
    v_client.name,
    v_client.email,
    v_client.phone,
    0, 0, 0, 0,
    coalesce(v_status,'draft'),
    concat_ws(E'\n',
      'Pedido creado desde oportunidad: ' || v_opportunity.title,
      case when coalesce(v_opportunity.expected_value,0) > 0
        then 'Valor estimado de la oportunidad: ' || v_opportunity.expected_value::text
        else null
      end,
      nullif(v_opportunity.description,'')
    ),
    v_opportunity.id
  )
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.convert_opportunity_to_order(uuid) from public;
revoke all on function public.convert_opportunity_to_order(uuid) from anon;
grant execute on function public.convert_opportunity_to_order(uuid) to authenticated;
grant execute on function public.convert_opportunity_to_order(uuid) to service_role;

commit;
