-- CEO Rentable 2.0 — Fase 1
-- Endurece funciones auxiliares señaladas por el linter de Supabase.

begin;

alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.jwt_role() set search_path = public, pg_temp;
alter function public.normalize_email_template_fields() set search_path = public, pg_temp;
alter function public.touch_updated_at() set search_path = public, pg_temp;
alter function public.enforce_user_access_segmentation() set search_path = public, pg_temp;

commit;
