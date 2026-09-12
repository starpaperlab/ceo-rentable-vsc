-- CEO Rentable 2.0 — Fase 3 / Punto 9
-- Estado por usuario para notificaciones: leído/no leído y descartado.

begin;

create table if not exists public.notification_user_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  notification_key text not null,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_user_state_key_not_blank check (length(trim(notification_key)) > 0),
  constraint notification_user_state_user_key_unique unique (user_id, notification_key)
);

create index if not exists idx_notification_user_state_user
  on public.notification_user_state(user_id);
create index if not exists idx_notification_user_state_workspace
  on public.notification_user_state(workspace_id);
create index if not exists idx_notification_user_state_unread
  on public.notification_user_state(user_id, read_at)
  where read_at is null;

alter table public.notification_user_state enable row level security;

drop policy if exists notification_user_state_select on public.notification_user_state;
drop policy if exists notification_user_state_insert on public.notification_user_state;
drop policy if exists notification_user_state_update on public.notification_user_state;
drop policy if exists notification_user_state_delete on public.notification_user_state;

create policy notification_user_state_select
  on public.notification_user_state
  for select to authenticated
  using (user_id = auth.uid());

create policy notification_user_state_insert
  on public.notification_user_state
  for insert to authenticated
  with check (user_id = auth.uid());

create policy notification_user_state_update
  on public.notification_user_state
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy notification_user_state_delete
  on public.notification_user_state
  for delete to authenticated
  using (user_id = auth.uid());

commit;
