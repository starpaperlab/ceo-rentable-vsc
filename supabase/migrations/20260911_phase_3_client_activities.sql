-- CEO Rentable 2.0 — Fase 3 / Punto 2
-- Historial de actividades CRM por cliente y workspace.

begin;

create table if not exists public.client_activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  user_id uuid,
  created_by text,
  activity_type text not null default 'note',
  subject text not null,
  notes text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_activities_type_check check (
    activity_type in ('call','whatsapp','email','meeting','note','other')
  )
);

create index if not exists idx_client_activities_workspace_id
  on public.client_activities(workspace_id);
create index if not exists idx_client_activities_client_id
  on public.client_activities(client_id);
create index if not exists idx_client_activities_occurred_at
  on public.client_activities(occurred_at desc);

alter table public.client_activities enable row level security;

drop policy if exists client_activities_workspace_select on public.client_activities;
drop policy if exists client_activities_workspace_insert on public.client_activities;
drop policy if exists client_activities_workspace_update on public.client_activities;
drop policy if exists client_activities_workspace_delete on public.client_activities;

create policy client_activities_workspace_select
  on public.client_activities
  for select to authenticated
  using (public.workspace_has_module_access(workspace_id, 'clients'));

create policy client_activities_workspace_insert
  on public.client_activities
  for insert to authenticated
  with check (public.workspace_can_write(workspace_id, 'clients'));

create policy client_activities_workspace_update
  on public.client_activities
  for update to authenticated
  using (public.workspace_can_write(workspace_id, 'clients'))
  with check (public.workspace_can_write(workspace_id, 'clients'));

create policy client_activities_workspace_delete
  on public.client_activities
  for delete to authenticated
  using (public.workspace_can_write(workspace_id, 'clients'));

commit;
