-- CEO Rentable 2.0 — Fase 1
-- Lleva business_config al workspace activo sin romper el histórico legacy.

begin;

alter table public.business_config
  add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict,
  add column if not exists brand_accent_color text default '#111827';

-- Histórico principal: cada configuración existente sigue al workspace
-- propietario de la cuenta que ya era dueña de esos datos.
update public.business_config bc
set workspace_id = w.id
from public.workspaces w
where bc.workspace_id is null
  and bc.user_id is not null
  and w.owner_user_id = bc.user_id
  and w.id = (
    select w2.id
    from public.workspaces w2
    where w2.owner_user_id = bc.user_id
    order by w2.created_at asc, w2.id asc
    limit 1
  );

-- Compatibilidad para filas históricas que solo tuvieran created_by.
update public.business_config bc
set workspace_id = w.id
from public.users u
join public.workspaces w on w.owner_user_id = u.id
where bc.workspace_id is null
  and bc.created_by is not null
  and lower(trim(bc.created_by)) = lower(trim(u.email))
  and w.id = (
    select w2.id
    from public.workspaces w2
    where w2.owner_user_id = u.id
    order by w2.created_at asc, w2.id asc
    limit 1
  );

-- El modelo anterior permitía solo una configuración por user_id.
-- Para multiempresa la unicidad correcta pasa a ser una configuración
-- por workspace. Se conserva user_id como compatibilidad/autoría legacy.
drop index if exists public.idx_business_config_user_unique;

create index if not exists idx_business_config_workspace_id
  on public.business_config(workspace_id);

create unique index if not exists idx_business_config_workspace_unique
  on public.business_config(workspace_id)
  where workspace_id is not null;

alter table public.business_config enable row level security;

drop policy if exists business_config_owner_select on public.business_config;
drop policy if exists business_config_owner_insert on public.business_config;
drop policy if exists business_config_owner_update on public.business_config;
drop policy if exists business_config_owner_delete on public.business_config;

create policy business_config_workspace_select
on public.business_config
for select
to authenticated
using (
  public.is_admin(auth.uid())
  or (workspace_id is not null and public.is_workspace_member(workspace_id))
  or (workspace_id is null and user_id = auth.uid())
);

create policy business_config_workspace_insert
on public.business_config
for insert
to authenticated
with check (
  public.is_admin(auth.uid())
  or (workspace_id is not null and public.is_workspace_admin(workspace_id))
  or (workspace_id is null and user_id = auth.uid())
);

create policy business_config_workspace_update
on public.business_config
for update
to authenticated
using (
  public.is_admin(auth.uid())
  or (workspace_id is not null and public.is_workspace_admin(workspace_id))
  or (workspace_id is null and user_id = auth.uid())
)
with check (
  public.is_admin(auth.uid())
  or (workspace_id is not null and public.is_workspace_admin(workspace_id))
  or (workspace_id is null and user_id = auth.uid())
);

create policy business_config_workspace_delete
on public.business_config
for delete
to authenticated
using (
  public.is_admin(auth.uid())
  or (workspace_id is not null and public.is_workspace_admin(workspace_id))
  or (workspace_id is null and user_id = auth.uid())
);

commit;
