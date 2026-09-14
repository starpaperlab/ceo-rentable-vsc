-- CEO Rentable OS™ — Fase 5 / Bloque A
-- Índice de soporte para la FK configurable de estados de pedido.

begin;

create index if not exists idx_orders_workspace_operational_status
  on public.orders(workspace_id, operational_status)
  where workspace_id is not null;

commit;
