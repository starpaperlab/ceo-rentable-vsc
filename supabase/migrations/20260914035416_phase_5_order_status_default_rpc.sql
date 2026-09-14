-- CEO Rentable OS™ — Fase 5 / Bloque B
-- Cambio atómico del estado predeterminado de pedidos por workspace.

begin;

create or replace function public.set_default_order_status(target_status_id uuid)
returns public.order_statuses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.order_statuses%rowtype;
begin
  if target_status_id is null then
    raise exception 'Estado requerido.';
  end if;

  select *
    into v_status
    from public.order_statuses
   where id = target_status_id
   for update;

  if not found then
    raise exception 'Estado no encontrado.';
  end if;

  if not public.workspace_can_write(v_status.workspace_id, 'orders') then
    raise exception 'No autorizado.';
  end if;

  update public.order_statuses
     set is_default = false,
         updated_at = now()
   where workspace_id = v_status.workspace_id
     and is_default = true;

  update public.order_statuses
     set is_default = true,
         is_active = true,
         updated_at = now()
   where id = v_status.id
   returning * into v_status;

  return v_status;
end;
$$;

revoke all on function public.set_default_order_status(uuid) from public;
revoke all on function public.set_default_order_status(uuid) from anon;
grant execute on function public.set_default_order_status(uuid) to authenticated;
grant execute on function public.set_default_order_status(uuid) to service_role;

commit;
