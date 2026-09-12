-- CEO Rentable 2.0 — Fase 2 cierre
-- Cierra ejecución anónima explícitamente.

begin;

revoke execute on function public.reserve_document_number(uuid,text) from anon;
grant execute on function public.reserve_document_number(uuid,text) to authenticated;
grant execute on function public.reserve_document_number(uuid,text) to service_role;

commit;
