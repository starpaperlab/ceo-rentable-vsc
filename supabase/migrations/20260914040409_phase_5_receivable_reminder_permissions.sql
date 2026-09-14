-- CEO Rentable OS™ — Fase 5 / Bloque D
-- Permite seguimientos de cobro sobre la infraestructura existente de reminders.

begin;

create index if not exists idx_reminders_workspace_source_status
  on public.reminders(workspace_id, source_type, source_id, status, due_at);

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
      when source_type = 'invoice' then (
        public.workspace_has_module_access(workspace_id, 'receivables')
        or public.workspace_has_module_access(workspace_id, 'billing')
      )
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
      when source_type = 'invoice' then (
        public.workspace_can_write(workspace_id, 'receivables')
        or public.workspace_can_write(workspace_id, 'billing')
      )
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
      when source_type = 'invoice' then (
        public.workspace_can_write(workspace_id, 'receivables')
        or public.workspace_can_write(workspace_id, 'billing')
      )
      else public.workspace_can_write(workspace_id, 'dashboard')
    end
  )
  with check (
    case
      when source_type = 'client' then public.workspace_can_write(workspace_id, 'clients')
      when source_type = 'appointment' then public.workspace_can_write(workspace_id, 'agenda')
      when source_type = 'invoice' then (
        public.workspace_can_write(workspace_id, 'receivables')
        or public.workspace_can_write(workspace_id, 'billing')
      )
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
      when source_type = 'invoice' then (
        public.workspace_can_write(workspace_id, 'receivables')
        or public.workspace_can_write(workspace_id, 'billing')
      )
      else public.workspace_can_write(workspace_id, 'dashboard')
    end
  );

commit;
