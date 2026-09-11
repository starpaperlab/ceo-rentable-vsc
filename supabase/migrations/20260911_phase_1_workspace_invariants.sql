-- CEO Rentable 2.0 — Fase 1
-- Protege invariantes de ownership, monetización de asientos y creación idempotente de workspace.

begin;

create or replace function public.protect_workspace_invariants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_is_platform_admin boolean := coalesce(public.is_admin(auth.uid()), false);
begin
  if v_role = 'service_role' or v_is_platform_admin then
    return new;
  end if;

  if new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'WORKSPACE_OWNER_IMMUTABLE';
  end if;

  if new.team_enabled is distinct from old.team_enabled
     or new.seat_limit is distinct from old.seat_limit then
    raise exception 'WORKSPACE_PLAN_FIELDS_SERVER_ONLY';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_workspace_invariants on public.workspaces;
create trigger trg_protect_workspace_invariants
before update on public.workspaces
for each row execute function public.protect_workspace_invariants();

create or replace function public.protect_workspace_member_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_is_platform_admin boolean := coalesce(public.is_admin(auth.uid()), false);
  v_owner_user_id uuid;
begin
  if v_role = 'service_role' or v_is_platform_admin then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.role = 'owner' then
      select owner_user_id into v_owner_user_id
      from public.workspaces
      where id = new.workspace_id;

      if v_owner_user_id is distinct from auth.uid()
         or new.user_id is distinct from auth.uid()
         or exists (
           select 1 from public.workspace_members wm
           where wm.workspace_id = new.workspace_id and wm.role = 'owner'
         ) then
        raise exception 'WORKSPACE_OWNER_MEMBERSHIP_PROTECTED';
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.role = 'owner'
       and (
         new.role is distinct from old.role
         or new.user_id is distinct from old.user_id
         or new.workspace_id is distinct from old.workspace_id
         or new.status is distinct from old.status
       ) then
      raise exception 'WORKSPACE_OWNER_MEMBERSHIP_PROTECTED';
    end if;

    if old.role <> 'owner' and new.role = 'owner' then
      raise exception 'WORKSPACE_OWNER_ROLE_SERVER_ONLY';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.role = 'owner' then
      raise exception 'WORKSPACE_OWNER_MEMBERSHIP_PROTECTED';
    end if;
    return old;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_protect_workspace_member_owner on public.workspace_members;
create trigger trg_protect_workspace_member_owner
before insert or update or delete on public.workspace_members
for each row execute function public.protect_workspace_member_owner();

drop policy if exists workspace_admins_insert_memberships on public.workspace_members;
create policy workspace_admins_insert_memberships
on public.workspace_members
for insert
to authenticated
with check (
  public.is_workspace_admin(workspace_id)
  and role <> 'owner'
  and exists (
    select 1
    from public.workspaces w
    where w.id = workspace_members.workspace_id
      and w.team_enabled = true
      and (
        select count(*)
        from public.workspace_members wm
        where wm.workspace_id = workspace_members.workspace_id
          and wm.status = 'active'
      ) < w.seat_limit
  )
);

drop policy if exists workspace_admins_update_memberships on public.workspace_members;
create policy workspace_admins_update_memberships
on public.workspace_members
for update
to authenticated
using (
  public.is_workspace_admin(workspace_id)
  and role <> 'owner'
)
with check (
  public.is_workspace_admin(workspace_id)
  and role <> 'owner'
);

drop policy if exists workspace_admins_delete_memberships on public.workspace_members;
create policy workspace_admins_delete_memberships
on public.workspace_members
for delete
to authenticated
using (
  public.is_workspace_admin(workspace_id)
  and role <> 'owner'
);

create or replace function public.ensure_personal_workspace(p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_name text;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select wm.workspace_id into v_workspace_id
  from public.workspace_members wm
  where wm.user_id = v_user_id
    and wm.status = 'active'
  order by wm.created_at asc
  limit 1;

  if v_workspace_id is not null then
    return v_workspace_id;
  end if;

  v_name := coalesce(nullif(trim(p_name), ''), 'Mi empresa');

  insert into public.workspaces(name, owner_user_id)
  values(v_name, v_user_id)
  returning id into v_workspace_id;

  insert into public.workspace_members(workspace_id, user_id, role, status)
  values(v_workspace_id, v_user_id, 'owner', 'active');

  return v_workspace_id;
end;
$$;

revoke all on function public.protect_workspace_invariants() from public, anon, authenticated;
revoke all on function public.protect_workspace_member_owner() from public, anon, authenticated;

commit;
