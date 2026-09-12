-- CEO Rentable 2.0 — Fase 3 / Punto 11
-- Endurece permisos por módulo para recordatorios y notificaciones.

begin;

drop policy if exists reminders_workspace_select on public.reminders;
drop policy if exists reminders_workspace_insert on public.reminders;
drop policy if exists reminders_workspace_update on public.reminders;
drop policy if exists reminders_workspace_delete on public.reminders;

create policy reminders_workspace_select
  on public.reminders
  for select to authenticated
  using (
    case
      when source_type = 'client' then public.workspace_has_module_access(workspace_id, 'clients')
      when source_type = 'appointment' then public.workspace_has_module_access(workspace_id, 'agenda')
      else public.workspace_has_module_access(workspace_id, 'dashboard')
    end
  );

create policy reminders_workspace_insert
  on public.reminders
  for insert to authenticated
  with check (
    case
      when source_type = 'client' then public.workspace_can_write(workspace_id, 'clients')
      when source_type = 'appointment' then public.workspace_can_write(workspace_id, 'agenda')
      else public.workspace_can_write(workspace_id, 'dashboard')
    end
  );

create policy reminders_workspace_update
  on public.reminders
  for update to authenticated
  using (
    case
      when source_type = 'client' then public.workspace_can_write(workspace_id, 'clients')
      when source_type = 'appointment' then public.workspace_can_write(workspace_id, 'agenda')
      else public.workspace_can_write(workspace_id, 'dashboard')
    end
  )
  with check (
    case
      when source_type = 'client' then public.workspace_can_write(workspace_id, 'clients')
      when source_type = 'appointment' then public.workspace_can_write(workspace_id, 'agenda')
      else public.workspace_can_write(workspace_id, 'dashboard')
    end
  );

create policy reminders_workspace_delete
  on public.reminders
  for delete to authenticated
  using (
    case
      when source_type = 'client' then public.workspace_can_write(workspace_id, 'clients')
      when source_type = 'appointment' then public.workspace_can_write(workspace_id, 'agenda')
      else public.workspace_can_write(workspace_id, 'dashboard')
    end
  );

drop policy if exists app_notifications_select on public.app_notifications;

create policy app_notifications_select
  on public.app_notifications
  for select to authenticated
  using (
    (
      workspace_id is null
      and notification_type in ('product_update','system')
    )
    or (
      workspace_id is not null
      and (
        (notification_type in ('reminder','follow_up') and public.workspace_has_module_access(workspace_id, 'clients'))
        or (notification_type = 'appointment' and public.workspace_has_module_access(workspace_id, 'agenda'))
        or (notification_type = 'receivable' and public.workspace_has_module_access(workspace_id, 'receivables'))
        or (notification_type = 'quote' and public.workspace_has_module_access(workspace_id, 'billing'))
        or (notification_type in ('product_update','system') and public.workspace_has_module_access(workspace_id, 'dashboard'))
      )
    )
  );

commit;
