-- CEO Rentable 2.0 — Fase 3 / Punto 6
-- Recordatorios internos reutilizables para CRM y operaciones.

begin;

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  user_id uuid,
  created_by text,
  title text not null,
  notes text,
  due_at timestamptz not null,
  status text not null default 'pending',
  priority text not null default 'normal',
  source_type text,
  source_id uuid,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reminders_status_check check (status in ('pending','done','dismissed')),
  constraint reminders_priority_check check (priority in ('low','normal','high','urgent'))
);

create index if not exists idx_reminders_workspace_due_at
  on public.reminders(workspace_id, due_at);
create index if not exists idx_reminders_client_id
  on public.reminders(client_id);
create index if not exists idx_reminders_workspace_status
  on public.reminders(workspace_id, status);

alter table public.reminders enable row level security;

drop policy if exists reminders_workspace_select on public.reminders;
drop policy if exists reminders_workspace_insert on public.reminders;
drop policy if exists reminders_workspace_update on public.reminders;
drop policy if exists reminders_workspace_delete on public.reminders;

create policy reminders_workspace_select
  on public.reminders
  for select to authenticated
  using (
    public.workspace_has_module_access(workspace_id, 'dashboard')
    or public.workspace_has_module_access(workspace_id, 'clients')
    or public.workspace_has_module_access(workspace_id, 'agenda')
  );

create policy reminders_workspace_insert
  on public.reminders
  for insert to authenticated
  with check (
    public.workspace_can_write(workspace_id, 'dashboard')
    or public.workspace_can_write(workspace_id, 'clients')
    or public.workspace_can_write(workspace_id, 'agenda')
  );

create policy reminders_workspace_update
  on public.reminders
  for update to authenticated
  using (
    public.workspace_can_write(workspace_id, 'dashboard')
    or public.workspace_can_write(workspace_id, 'clients')
    or public.workspace_can_write(workspace_id, 'agenda')
  )
  with check (
    public.workspace_can_write(workspace_id, 'dashboard')
    or public.workspace_can_write(workspace_id, 'clients')
    or public.workspace_can_write(workspace_id, 'agenda')
  );

create policy reminders_workspace_delete
  on public.reminders
  for delete to authenticated
  using (
    public.workspace_can_write(workspace_id, 'dashboard')
    or public.workspace_can_write(workspace_id, 'clients')
    or public.workspace_can_write(workspace_id, 'agenda')
  );

commit;
