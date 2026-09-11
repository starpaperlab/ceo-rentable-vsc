-- CEO Rentable 2.0 — Fase 1
-- Cuenta -> Workspace/Empresa -> Miembros -> Datos de empresa
-- Esta migración es aditiva: no elimina el ownership legacy por user_id.

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  country_code text,
  currency_code text not null default 'DOP',
  timezone text not null default 'America/Santo_Domingo',
  logo_url text,
  brand_primary_color text,
  brand_accent_color text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member','viewer')),
  status text not null default 'active' check (status in ('active','invited','disabled')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspaces_owner_user_id_idx on public.workspaces(owner_user_id);
create index if not exists workspace_members_user_id_idx on public.workspace_members(user_id);

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
  );
$$;

create or replace function public.is_workspace_admin(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.role in ('owner','admin')
  );
$$;

drop policy if exists "workspace members can read workspace" on public.workspaces;
create policy "workspace members can read workspace"
on public.workspaces for select
to authenticated
using (public.is_workspace_member(id) or owner_user_id = auth.uid());

drop policy if exists "owners can create workspace" on public.workspaces;
create policy "owners can create workspace"
on public.workspaces for insert
to authenticated
with check (owner_user_id = auth.uid());

drop policy if exists "workspace admins can update workspace" on public.workspaces;
create policy "workspace admins can update workspace"
on public.workspaces for update
to authenticated
using (public.is_workspace_admin(id) or owner_user_id = auth.uid())
with check (public.is_workspace_admin(id) or owner_user_id = auth.uid());

drop policy if exists "members can read memberships" on public.workspace_members;
create policy "members can read memberships"
on public.workspace_members for select
to authenticated
using (user_id = auth.uid() or public.is_workspace_member(workspace_id));

drop policy if exists "workspace admins can manage memberships" on public.workspace_members;
create policy "workspace admins can manage memberships"
on public.workspace_members for all
to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

-- Helper para crear el workspace inicial de una cuenta sin romper datos existentes.
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
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;

  select wm.workspace_id into v_workspace_id
  from public.workspace_members wm
  where wm.user_id = v_user_id and wm.status = 'active'
  order by wm.created_at asc
  limit 1;

  if v_workspace_id is not null then return v_workspace_id; end if;

  v_name := coalesce(nullif(trim(p_name), ''), 'Mi empresa');
  insert into public.workspaces(name, owner_user_id)
  values (v_name, v_user_id)
  returning id into v_workspace_id;

  insert into public.workspace_members(workspace_id, user_id, role, status)
  values (v_workspace_id, v_user_id, 'owner', 'active')
  on conflict do nothing;

  return v_workspace_id;
end;
$$;

-- Fase 1B aplicará workspace_id + RLS a cada tabla de negocio después del inventario/backfill.
-- No se relaja ninguna política legacy durante esta migración.