-- CEO Rentable 2.0 — Fase 1
-- Elimina índices legacy que impedían múltiples configuraciones por workspace.

begin;

drop index if exists public.idx_business_config_user_unique;
drop index if exists public.idx_business_config_owner;

create unique index if not exists idx_business_config_workspace_unique
on public.business_config(workspace_id)
where workspace_id is not null;

commit;
