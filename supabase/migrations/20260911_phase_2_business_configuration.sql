-- CEO Rentable 2.0 — Fase 2
-- Configuración operativa, fiscal, pagos y numeración por workspace.

begin;

alter table public.business_config
  add column if not exists country_code text,
  add column if not exists timezone text not null default 'America/Santo_Domingo',
  add column if not exists tax_enabled boolean not null default false,
  add column if not exists tax_name text not null default 'ITBIS',
  add column if not exists tax_rate numeric(6,3) not null default 0,
  add column if not exists bank_name text,
  add column if not exists bank_account_name text,
  add column if not exists bank_account_number text,
  add column if not exists bank_account_type text,
  add column if not exists payment_instructions text,
  add column if not exists signature_name text,
  add column if not exists signature_title text,
  add column if not exists terms_text text,
  add column if not exists invoice_prefix text not null default 'FAC',
  add column if not exists quote_prefix text not null default 'COT',
  add column if not exists next_invoice_number integer not null default 1,
  add column if not exists next_quote_number integer not null default 1;

alter table public.business_config
  drop constraint if exists business_config_tax_rate_check,
  add constraint business_config_tax_rate_check check (tax_rate >= 0 and tax_rate <= 100),
  drop constraint if exists business_config_next_invoice_number_check,
  add constraint business_config_next_invoice_number_check check (next_invoice_number >= 1),
  drop constraint if exists business_config_next_quote_number_check,
  add constraint business_config_next_quote_number_check check (next_quote_number >= 1);

commit;
