-- CEO Rentable 2.0 — Fase 1: permisos por módulo
-- Aditivo y compatible con miembros existentes.

alter table public.workspace_members
  add column if not exists module_permissions jsonb not null default '{}'::jsonb;

comment on column public.workspace_members.module_permissions is
  'Mapa de permisos por modulo. Owner tiene acceso total; otros roles pueden restringirse por modulo.';

create or replace function public.workspace_has_module_access(target_workspace_id uuid, target_module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and (
        wm.role = 'owner'
        or coalesce((wm.module_permissions ->> target_module)::boolean, false)
      )
  );
$$;

revoke all on function public.workspace_has_module_access(uuid, text) from public;
grant execute on function public.workspace_has_module_access(uuid, text) to authenticated;
