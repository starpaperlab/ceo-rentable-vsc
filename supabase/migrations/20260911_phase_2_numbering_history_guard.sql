-- CEO Rentable 2.0 — Fase 2 cierre
-- Refuerza numeración atómica contra contadores antiguos o documentos históricos.

begin;

create or replace function public.reserve_document_number(
  target_workspace_id uuid,
  document_type text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.business_config%rowtype;
  configured_next integer;
  highest_existing integer := 0;
  next_number integer;
  prefix text;
begin
  if target_workspace_id is null then
    raise exception 'Workspace requerido.';
  end if;

  if not public.workspace_can_write(target_workspace_id, 'billing') then
    raise exception 'No autorizado.';
  end if;

  if document_type not in ('invoice','quote') then
    raise exception 'Tipo de documento inválido.';
  end if;

  select *
    into cfg
    from public.business_config
   where workspace_id = target_workspace_id
   order by updated_at desc nulls last
   limit 1
   for update;

  if not found then
    raise exception 'Configura tu negocio antes de crear documentos.';
  end if;

  if document_type = 'invoice' then
    select coalesce(max((regexp_match(invoice_number, '(\d+)\s*$'))[1]::integer), 0)
      into highest_existing
      from public.invoices
     where workspace_id = target_workspace_id
       and invoice_number ~ '(\d+)\s*$';

    configured_next := greatest(coalesce(cfg.next_invoice_number, 1), 1);
    next_number := greatest(configured_next, highest_existing + 1);
    prefix := upper(coalesce(nullif(btrim(cfg.invoice_prefix), ''), 'FAC'));

    update public.business_config
       set next_invoice_number = next_number + 1,
           updated_at = now()
     where id = cfg.id;
  else
    select coalesce(max((regexp_match(quote_number, '(\d+)\s*$'))[1]::integer), 0)
      into highest_existing
      from public.quotes
     where workspace_id = target_workspace_id
       and quote_number ~ '(\d+)\s*$';

    configured_next := greatest(coalesce(cfg.next_quote_number, 1), 1);
    next_number := greatest(configured_next, highest_existing + 1);
    prefix := upper(coalesce(nullif(btrim(cfg.quote_prefix), ''), 'COT'));

    update public.business_config
       set next_quote_number = next_number + 1,
           updated_at = now()
     where id = cfg.id;
  end if;

  return prefix || '-' || lpad(next_number::text, 4, '0');
end;
$$;

revoke all on function public.reserve_document_number(uuid,text) from public;
grant execute on function public.reserve_document_number(uuid,text) to authenticated;
grant execute on function public.reserve_document_number(uuid,text) to service_role;

commit;
