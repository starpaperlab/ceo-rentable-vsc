-- CEO Rentable 2.0 — Fase 3 / Punto 8
-- Tipos de notificación persistentes para centro unificado.

begin;

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  notification_type text not null,
  severity text not null default 'info',
  title text not null,
  message text,
  action_path text,
  source_type text,
  source_id uuid,
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_notifications_type_check check (
    notification_type in (
      'reminder',
      'follow_up',
      'appointment',
      'receivable',
      'quote',
      'product_update',
      'system'
    )
  ),
  constraint app_notifications_severity_check check (
    severity in ('info','success','warning','critical')
  )
);

create index if not exists idx_app_notifications_workspace_published
  on public.app_notifications(workspace_id, published_at desc);
create index if not exists idx_app_notifications_active
  on public.app_notifications(is_active, published_at desc);
create index if not exists idx_app_notifications_type
  on public.app_notifications(notification_type);

alter table public.app_notifications enable row level security;

drop policy if exists app_notifications_select on public.app_notifications;
drop policy if exists app_notifications_insert on public.app_notifications;
drop policy if exists app_notifications_update on public.app_notifications;
drop policy if exists app_notifications_delete on public.app_notifications;

create policy app_notifications_select
  on public.app_notifications
  for select to authenticated
  using (
    (
      workspace_id is null
      and notification_type in ('product_update','system')
    )
    or public.workspace_has_module_access(workspace_id, 'dashboard')
  );

create policy app_notifications_insert
  on public.app_notifications
  for insert to authenticated
  with check (
    (
      workspace_id is null
      and public.is_admin(auth.uid())
    )
    or public.workspace_can_write(workspace_id, 'dashboard')
  );

create policy app_notifications_update
  on public.app_notifications
  for update to authenticated
  using (
    (
      workspace_id is null
      and public.is_admin(auth.uid())
    )
    or public.workspace_can_write(workspace_id, 'dashboard')
  )
  with check (
    (
      workspace_id is null
      and public.is_admin(auth.uid())
    )
    or public.workspace_can_write(workspace_id, 'dashboard')
  );

create policy app_notifications_delete
  on public.app_notifications
  for delete to authenticated
  using (
    (
      workspace_id is null
      and public.is_admin(auth.uid())
    )
    or public.workspace_can_write(workspace_id, 'dashboard')
  );

commit;
