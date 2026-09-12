-- CEO Rentable 2.0 — Fase 2 cierre
-- Métodos de pago configurables y numeración atómica por workspace.

begin;

alter table public.business_config
  add column if not exists accepted_payment_methods text[] not null
    default array['Efectivo','Transferencia']::text[];

create unique index if not exists invoices_workspace_invoice_number_uidx
  on public.invoices (workspace_id, invoice_number)
  where workspace_id is not null and invoice_number is not null and btrim(invoice_number) <> '';

create unique index if not exists quotes_workspace_quote_number_uidx
  on public.quotes (workspace_id, quote_number)
  where workspace_id is not null and quote_number is not null and btrim(quote_number) <> '';

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
    next_number := greatest(coalesce(cfg.next_invoice_number, 1), 1);
    prefix := upper(coalesce(nullif(btrim(cfg.invoice_prefix), ''), 'FAC'));

    update public.business_config
       set next_invoice_number = next_number + 1,
           updated_at = now()
     where id = cfg.id;
  else
    next_number := greatest(coalesce(cfg.next_quote_number, 1), 1);
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
