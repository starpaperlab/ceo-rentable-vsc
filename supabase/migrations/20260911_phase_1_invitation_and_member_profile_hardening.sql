-- CEO Rentable 2.0 — Fase 1
-- Permite invitaciones por workspace y lectura segura de perfiles de miembros.

begin;

drop index if exists public.user_invitations_email_unique;
drop index if exists public.user_invitations_workspace_email_unique;
drop index if exists public.user_invitations_legacy_email_unique;

create unique index user_invitations_workspace_email_unique
on public.user_invitations (workspace_id, lower(email))
where workspace_id is not null;

create unique index user_invitations_legacy_email_unique
on public.user_invitations (lower(email))
where workspace_id is null;

create or replace function public.workspace_member_profiles(p_workspace_id uuid)
returns table (
  id uuid,
  email text,
  full_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.email, u.full_name
  from public.workspace_members wm
  join public.users u on u.id = wm.user_id
  where wm.workspace_id = p_workspace_id
    and wm.status = 'active'
    and (
      public.is_admin(auth.uid())
      or exists (
        select 1
        from public.workspace_members manager
        where manager.workspace_id = p_workspace_id
          and manager.user_id = auth.uid()
          and manager.status = 'active'
          and manager.role in ('owner','admin')
      )
    )
  order by wm.created_at asc;
$$;

revoke all on function public.workspace_member_profiles(uuid) from public, anon;
grant execute on function public.workspace_member_profiles(uuid) to authenticated, service_role;

commit;
