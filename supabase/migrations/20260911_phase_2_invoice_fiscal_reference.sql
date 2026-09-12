-- CEO Rentable 2.0 — Fase 2
-- Referencia fiscal opcional por factura. No genera ni autoriza comprobantes fiscales.

begin;

alter table public.invoices
  add column if not exists fiscal_document_type text,
  add column if not exists fiscal_document_label text,
  add column if not exists fiscal_document_number text,
  add column if not exists fiscal_document_series text,
  add column if not exists fiscal_authority_reference text,
  add column if not exists fiscal_country_code text;

commit;
