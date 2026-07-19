-- CEO Rentable OS
-- Phase 1: formal receipt metadata for invoice payments.
-- One invoice_payments row remains the single financial source of truth.

create extension if not exists pgcrypto;

alter table if exists public.invoice_payments
  add column if not exists brand_profile_id uuid references public.brand_profiles(id) on delete set null,
  add column if not exists receipt_number text,
  add column if not exists receipt_status text not null default 'not_generated',
  add column if not exists receipt_metadata jsonb not null default '{}'::jsonb,
  add column if not exists receipt_issued_at timestamptz;

update public.invoice_payments p
   set brand_profile_id = i.brand_profile_id
  from public.invoices i
 where p.invoice_id = i.id
   and p.brand_profile_id is null
   and i.brand_profile_id is not null;

update public.invoice_payments
   set receipt_status = 'not_generated'
 where receipt_status is null
    or receipt_status not in ('not_generated', 'generated', 'void');

update public.invoice_payments
   set receipt_metadata = '{}'::jsonb
 where receipt_metadata is null;

alter table public.invoice_payments
  alter column receipt_status set default 'not_generated',
  alter column receipt_status set not null,
  alter column receipt_metadata set default '{}'::jsonb,
  alter column receipt_metadata set not null;

alter table public.invoice_payments
  drop constraint if exists invoice_payments_receipt_status_check;

alter table public.invoice_payments
  add constraint invoice_payments_receipt_status_check
  check (receipt_status in ('not_generated', 'generated', 'void'));

create index if not exists idx_invoice_payments_brand_profile_id
  on public.invoice_payments(brand_profile_id);

create unique index if not exists idx_invoice_payments_receipt_number_owner_brand
  on public.invoice_payments(
    coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(brand_profile_id, '00000000-0000-0000-0000-000000000000'::uuid),
    receipt_number
  )
  where receipt_number is not null
    and trim(receipt_number) <> '';

create or replace function public.sync_invoice_payment_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_owner_id uuid;
  invoice_owner_email text;
  invoice_brand_profile_id uuid;
  current_email text;
  is_admin_user boolean;
begin
  select i.user_id, i.created_by, i.brand_profile_id
    into invoice_owner_id, invoice_owner_email, invoice_brand_profile_id
  from public.invoices i
  where i.id = new.invoice_id;

  if invoice_owner_id is null and invoice_owner_email is null then
    raise exception 'Factura no encontrada para registrar el abono.';
  end if;

  current_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'admin'
  ) into is_admin_user;

  if not coalesce(is_admin_user, false)
     and auth.uid() is distinct from invoice_owner_id
     and lower(coalesce(invoice_owner_email, '')) <> current_email then
    raise exception 'No autorizado para registrar abonos en esta factura.';
  end if;

  new.user_id := coalesce(new.user_id, invoice_owner_id);
  new.created_by := lower(coalesce(new.created_by, invoice_owner_email, current_email, null));
  new.registered_by := coalesce(new.registered_by, auth.uid());
  new.registered_by_email := lower(coalesce(new.registered_by_email, current_email, new.created_by));
  new.brand_profile_id := coalesce(new.brand_profile_id, invoice_brand_profile_id);

  if new.payment_date is null then
    new.payment_date := current_date;
  end if;

  if new.created_at is null then
    new.created_at := timezone('utc', now());
  end if;

  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create or replace function public.generate_invoice_payment_receipt(payment_id uuid)
returns public.invoice_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.invoice_payments%rowtype;
  v_invoice public.invoices%rowtype;
  v_current_user_id uuid := auth.uid();
  v_current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_is_admin boolean := false;
  v_owner_id uuid;
  v_brand_profile_id uuid;
  v_invoice_total numeric(12, 2);
  v_prior_paid numeric(12, 2);
  v_balance_previous numeric(12, 2);
  v_balance_after numeric(12, 2);
  v_next_number integer;
  v_receipt_number text;
  v_issued_at timestamptz := timezone('utc', now());
  v_zero_uuid constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  if payment_id is null then
    raise exception 'ID de abono requerido para generar recibo.';
  end if;

  if v_current_user_id is null then
    raise exception 'Debes iniciar sesión para generar recibos.';
  end if;

  select public.is_admin(v_current_user_id) into v_is_admin;

  select *
    into v_payment
    from public.invoice_payments
   where id = payment_id
   for update;

  if not found then
    raise exception 'Abono no encontrado para generar recibo.';
  end if;

  if v_payment.receipt_status = 'void' then
    raise exception 'No se puede generar recibo para un abono con recibo anulado.';
  end if;

  if v_payment.receipt_status = 'generated'
     and nullif(trim(coalesce(v_payment.receipt_number, '')), '') is not null then
    return v_payment;
  end if;

  select *
    into v_invoice
    from public.invoices
   where id = v_payment.invoice_id;

  if not found then
    raise exception 'Factura no encontrada para generar recibo.';
  end if;

  if not coalesce(v_is_admin, false)
     and v_payment.user_id is distinct from v_current_user_id
     and v_invoice.user_id is distinct from v_current_user_id
     and lower(coalesce(v_payment.created_by, '')) <> v_current_email
     and lower(coalesce(v_invoice.created_by, '')) <> v_current_email then
    raise exception 'No autorizado para generar recibos de este abono.';
  end if;

  v_owner_id := coalesce(v_payment.user_id, v_invoice.user_id);
  if v_owner_id is null then
    raise exception 'El abono no tiene usuario propietario para numerar el recibo.';
  end if;

  v_brand_profile_id := coalesce(v_payment.brand_profile_id, v_invoice.brand_profile_id);
  v_invoice_total := round(coalesce(v_invoice.total_final, 0)::numeric, 2);

  select coalesce(sum(p.amount), 0)
    into v_prior_paid
    from public.invoice_payments p
   where p.invoice_id = v_payment.invoice_id
     and p.id is distinct from v_payment.id
     and (
       p.payment_date < v_payment.payment_date
       or (
         p.payment_date = v_payment.payment_date
         and coalesce(p.created_at, '-infinity'::timestamptz) < coalesce(v_payment.created_at, '-infinity'::timestamptz)
       )
       or (
         p.payment_date = v_payment.payment_date
         and coalesce(p.created_at, '-infinity'::timestamptz) = coalesce(v_payment.created_at, '-infinity'::timestamptz)
         and p.id::text < v_payment.id::text
       )
     );

  v_prior_paid := round(coalesce(v_prior_paid, 0)::numeric, 2);
  v_balance_previous := greatest(round((v_invoice_total - v_prior_paid)::numeric, 2), 0);
  v_balance_after := greatest(round((v_balance_previous - coalesce(v_payment.amount, 0))::numeric, 2), 0);

  perform pg_advisory_xact_lock(
    hashtext('invoice_payment_receipts'),
    hashtext(coalesce(v_owner_id::text, v_zero_uuid::text) || ':' || coalesce(v_brand_profile_id::text, v_zero_uuid::text))
  );

  select coalesce(max(substring(receipt_number from '^REC-([0-9]+)$')::integer), 0) + 1
    into v_next_number
    from public.invoice_payments
   where coalesce(user_id, v_zero_uuid) = coalesce(v_owner_id, v_zero_uuid)
     and coalesce(brand_profile_id, v_zero_uuid) = coalesce(v_brand_profile_id, v_zero_uuid)
     and receipt_number ~ '^REC-[0-9]+$';

  v_receipt_number := 'REC-' || lpad(v_next_number::text, 4, '0');

  update public.invoice_payments
     set user_id = v_owner_id,
         brand_profile_id = v_brand_profile_id,
         receipt_number = v_receipt_number,
         receipt_status = 'generated',
         receipt_issued_at = v_issued_at,
         receipt_metadata = jsonb_strip_nulls(jsonb_build_object(
           'receipt_number', v_receipt_number,
           'receipt_issued_at', v_issued_at,
           'invoice_id', v_invoice.id,
           'invoice_number', v_invoice.invoice_number,
           'invoice_date', v_invoice.date,
           'client_id', v_invoice.client_id,
           'client_name', v_invoice.client_name,
           'client_email', v_invoice.client_email,
           'client_phone', v_invoice.client_phone,
           'payment_id', v_payment.id,
           'payment_date', v_payment.payment_date,
           'payment_method', v_payment.payment_method,
           'reference_number', v_payment.reference_number,
           'notes', v_payment.notes,
           'invoice_total', v_invoice_total,
           'balance_previous', v_balance_previous,
           'amount_paid', v_payment.amount,
           'balance_after', v_balance_after,
           'brand_profile_id', v_brand_profile_id,
           'branding_snapshot', coalesce(
             v_invoice.branding_snapshot,
             jsonb_strip_nulls(jsonb_build_object(
               'brand_profile_id', v_invoice.brand_profile_id,
               'company_name', v_invoice.company_name,
               'logo_url', v_invoice.logo_url,
               'brand_color', v_invoice.brand_color,
               'font_family', v_invoice.font_family
             ))
           ),
           'generated_by', v_current_user_id,
           'generated_by_email', v_current_email,
           'generated_at', v_issued_at
         )),
         updated_at = v_issued_at
   where id = v_payment.id
   returning * into v_payment;

  return v_payment;
end;
$$;

revoke all on function public.generate_invoice_payment_receipt(uuid) from public;
grant execute on function public.generate_invoice_payment_receipt(uuid) to authenticated;
grant execute on function public.generate_invoice_payment_receipt(uuid) to service_role;
