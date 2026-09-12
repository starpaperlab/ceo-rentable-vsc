-- CEO Rentable 2.0 — Fase 2 cierre
-- Snapshot de métodos de pago aceptados por documento.

begin;

alter table public.invoices
  add column if not exists accepted_payment_methods text[];

alter table public.quotes
  add column if not exists accepted_payment_methods text[];

commit;
