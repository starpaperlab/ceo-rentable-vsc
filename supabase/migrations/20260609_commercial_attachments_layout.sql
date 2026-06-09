-- CEO Rentable OS™
-- Layout de anexos comerciales para cotizaciones y facturas.

alter table if exists public.invoices
  add column if not exists commercial_attachments_layout text not null default 'premium';

alter table if exists public.quotes
  add column if not exists commercial_attachments_layout text not null default 'premium';
