-- CEO Rentable 2.0 — Fase 1
-- Hardening explícito de funciones SECURITY DEFINER introducidas por workspaces.

revoke all on function public.is_workspace_member(uuid) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated;

revoke all on function public.is_workspace_admin(uuid) from public, anon;
grant execute on function public.is_workspace_admin(uuid) to authenticated;

revoke all on function public.ensure_personal_workspace(text) from public, anon;
grant execute on function public.ensure_personal_workspace(text) to authenticated;

-- Esta función devuelve métricas globales de backfill y no debe exponerse
-- a cualquier usuaria autenticada.
revoke all on function public.workspace_backfill_status() from public, anon, authenticated;
grant execute on function public.workspace_backfill_status() to service_role;

revoke all on function public.workspace_has_module_access(uuid, text) from public, anon;
grant execute on function public.workspace_has_module_access(uuid, text) to authenticated;
