-- CEO Rentable OS
-- Pagos parciales y cuentas por cobrar para facturas.

create extension if not exists pgcrypto;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'invoices'
      and constraint_name = 'invoices_status_check'
  ) then
    alter table public.invoices drop constraint invoices_status_check;
  end if;

  alter table public.invoices
    add constraint invoices_status_check
    check (status in ('pending', 'partial', 'paid', 'canceled', 'overdue'));
exception
  when duplicate_object then null;
end $$;

create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  created_by text,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  payment_date date not null default current_date,
  amount numeric(12, 2) not null check (amount > 0),
  payment_method text not null default 'Efectivo',
  reference_number text,
  notes text,
  registered_by uuid,
  registered_by_email text,
  receipt_number text,
  receipt_status text not null default 'not_generated',
  receipt_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_invoice_payments_invoice_id on public.invoice_payments(invoice_id);
create index if not exists idx_invoice_payments_user_id on public.invoice_payments(user_id);
create index if not exists idx_invoice_payments_created_by on public.invoice_payments(lower(created_by));
create index if not exists idx_invoice_payments_payment_date on public.invoice_payments(payment_date);

create or replace function public.sync_invoice_payment_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_owner_id uuid;
  invoice_owner_email text;
  current_email text;
  is_admin_user boolean;
begin
  select i.user_id, i.created_by
    into invoice_owner_id, invoice_owner_email
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

create or replace function public.prevent_invoice_payment_overpayment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_total numeric(12, 2);
  other_payments_total numeric(12, 2);
begin
  select coalesce(total_final, 0)
    into invoice_total
  from public.invoices
  where id = new.invoice_id;

  if invoice_total is null then
    raise exception 'Factura no encontrada para validar el abono.';
  end if;

  select coalesce(sum(amount), 0)
    into other_payments_total
  from public.invoice_payments
  where invoice_id = new.invoice_id
    and id is distinct from new.id;

  if coalesce(other_payments_total, 0) + coalesce(new.amount, 0) > invoice_total + 0.005 then
    raise exception 'El total abonado no puede superar el total de la factura.';
  end if;

  return new;
end;
$$;

create or replace function public.sync_invoice_payment_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_invoice_id uuid;
  invoice_total numeric(12, 2);
  paid_total numeric(12, 2);
  next_status text;
begin
  if tg_op = 'DELETE' then
    target_invoice_id := old.invoice_id;
  else
    target_invoice_id := new.invoice_id;
  end if;

  select coalesce(total_final, 0)
    into invoice_total
  from public.invoices
  where id = target_invoice_id;

  if invoice_total is null then
    return null;
  end if;

  select coalesce(sum(amount), 0)
    into paid_total
  from public.invoice_payments
  where invoice_id = target_invoice_id;

  if paid_total <= 0.005 then
    next_status := 'pending';
  elsif paid_total + 0.005 >= invoice_total then
    next_status := 'paid';
  else
    next_status := 'partial';
  end if;

  update public.invoices
  set status = next_status,
      updated_at = timezone('utc', now())
  where id = target_invoice_id
    and status is distinct from next_status;

  return null;
end;
$$;

create or replace function public.audit_invoice_payment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data public.invoice_payments%rowtype;
  action_name text;
begin
  if tg_op = 'DELETE' then
    row_data := old;
  else
    row_data := new;
  end if;

  action_name := case tg_op
    when 'INSERT' then 'invoice_payment_created'
    when 'UPDATE' then 'invoice_payment_updated'
    when 'DELETE' then 'invoice_payment_deleted'
    else 'invoice_payment_changed'
  end;

  begin
    insert into public.audit_logs (admin_id, target_user_id, action, details, created_at)
    values (
      coalesce(auth.uid(), row_data.registered_by),
      row_data.user_id,
      action_name,
      jsonb_build_object(
        'invoice_id', row_data.invoice_id,
        'payment_id', row_data.id,
        'amount', row_data.amount,
        'payment_method', row_data.payment_method,
        'reference_number', row_data.reference_number
      ),
      timezone('utc', now())
    );
  exception
    when undefined_table or undefined_column or foreign_key_violation or insufficient_privilege then
      null;
  end;

  return null;
end;
$$;

drop trigger if exists trg_invoice_payments_metadata on public.invoice_payments;
create trigger trg_invoice_payments_metadata
before insert or update on public.invoice_payments
for each row execute function public.sync_invoice_payment_metadata();

drop trigger if exists trg_invoice_payments_overpayment on public.invoice_payments;
create trigger trg_invoice_payments_overpayment
before insert or update on public.invoice_payments
for each row execute function public.prevent_invoice_payment_overpayment();

drop trigger if exists trg_invoice_payments_status_insert_update on public.invoice_payments;
create trigger trg_invoice_payments_status_insert_update
after insert or update on public.invoice_payments
for each row execute function public.sync_invoice_payment_status();

drop trigger if exists trg_invoice_payments_status_delete on public.invoice_payments;
create trigger trg_invoice_payments_status_delete
after delete on public.invoice_payments
for each row execute function public.sync_invoice_payment_status();

drop trigger if exists trg_invoice_payments_audit_insert_update on public.invoice_payments;
create trigger trg_invoice_payments_audit_insert_update
after insert or update on public.invoice_payments
for each row execute function public.audit_invoice_payment_change();

drop trigger if exists trg_invoice_payments_audit_delete on public.invoice_payments;
create trigger trg_invoice_payments_audit_delete
after delete on public.invoice_payments
for each row execute function public.audit_invoice_payment_change();

alter table public.invoice_payments enable row level security;

drop policy if exists invoice_payments_owner_select on public.invoice_payments;
create policy invoice_payments_owner_select on public.invoice_payments
for select
using (
  user_id = auth.uid()
  or lower(coalesce(created_by, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

drop policy if exists invoice_payments_owner_insert on public.invoice_payments;
create policy invoice_payments_owner_insert on public.invoice_payments
for insert
with check (
  (
    user_id = auth.uid()
    or lower(coalesce(created_by, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  )
  and exists (
    select 1
    from public.invoices i
    where i.id = invoice_id
      and (
        i.user_id = auth.uid()
        or lower(coalesce(i.created_by, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
      )
  )
);

drop policy if exists invoice_payments_owner_update on public.invoice_payments;
create policy invoice_payments_owner_update on public.invoice_payments
for update
using (
  user_id = auth.uid()
  or lower(coalesce(created_by, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
)
with check (
  user_id = auth.uid()
  or lower(coalesce(created_by, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);

drop policy if exists invoice_payments_owner_delete on public.invoice_payments;
create policy invoice_payments_owner_delete on public.invoice_payments
for delete
using (
  user_id = auth.uid()
  or lower(coalesce(created_by, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
);
