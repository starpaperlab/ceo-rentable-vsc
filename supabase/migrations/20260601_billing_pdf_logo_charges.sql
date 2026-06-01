-- CEO Rentable OS™
-- PDF professionalization: logo sizing and additional document charges.

alter table if exists public.business_config
  add column if not exists logo_size text not null default 'medium',
  add column if not exists logo_width numeric(8, 2) not null default 24;

alter table if exists public.invoices
  add column if not exists additional_charges jsonb not null default '[]'::jsonb,
  add column if not exists additional_charges_total numeric(12, 2) not null default 0,
  add column if not exists subtotal_before_tax numeric(12, 2) not null default 0,
  add column if not exists logo_size text,
  add column if not exists logo_width numeric(8, 2);

alter table if exists public.quotes
  add column if not exists additional_charges jsonb not null default '[]'::jsonb,
  add column if not exists additional_charges_total numeric(12, 2) not null default 0,
  add column if not exists subtotal_before_tax numeric(12, 2) not null default 0,
  add column if not exists logo_size text,
  add column if not exists logo_width numeric(8, 2);

do $$
begin
  if to_regclass('public.invoices') is not null then
    update public.invoices
    set subtotal_before_tax = coalesce(nullif(subtotal_before_tax, 0), subtotal + coalesce(additional_charges_total, 0))
    where subtotal_before_tax = 0;
  end if;

  if to_regclass('public.quotes') is not null then
    update public.quotes
    set subtotal_before_tax = coalesce(nullif(subtotal_before_tax, 0), subtotal + coalesce(additional_charges_total, 0))
    where subtotal_before_tax = 0;
  end if;
end $$;
