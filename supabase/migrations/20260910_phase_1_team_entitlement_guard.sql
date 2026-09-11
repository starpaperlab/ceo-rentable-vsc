-- CEO Rentable 2.0 — Fase 1
-- Cierra multiusuario para el plan individual y deja preparada la base para Business.

begin;

alter table public.workspaces
  add column if not exists team_enabled boolean not null default false,
  add column if not exists seat_limit integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'workspaces_seat_limit_check'
      and conrelid = 'public.workspaces'::regclass
  ) then
    alter table public.workspaces
      add constraint workspaces_seat_limit_check check (seat_limit >= 1);
  end if;
end $$;

drop policy if exists "workspace admins can manage memberships" on public.workspace_members;
drop policy if exists workspace_admins_update_memberships on public.workspace_members;
drop policy if exists workspace_admins_delete_memberships on public.workspace_members;
drop policy if exists workspace_admins_insert_memberships on public.workspace_members;

create policy workspace_admins_update_memberships
on public.workspace_members
for update
to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

create policy workspace_admins_delete_memberships
on public.workspace_members
for delete
to authenticated
using (public.is_workspace_admin(workspace_id));

create policy workspace_admins_insert_memberships
on public.workspace_members
for insert
to authenticated
with check (
  public.is_workspace_admin(workspace_id)
  and exists (
    select 1
    from public.workspaces w
    where w.id = workspace_id
      and w.team_enabled = true
      and (
        select count(*)
        from public.workspace_members wm
        where wm.workspace_id = workspace_id
          and wm.status = 'active'
      ) < w.seat_limit
  )
);

commit;
