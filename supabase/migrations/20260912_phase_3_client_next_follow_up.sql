-- CEO Rentable 2.0 — Fase 3 / Punto 4
-- Próximo seguimiento por cliente.

begin;

alter table public.clients
  add column if not exists next_follow_up_at timestamptz,
  add column if not exists next_follow_up_type text,
  add column if not exists next_follow_up_note text;

alter table public.clients
  drop constraint if exists clients_next_follow_up_type_check,
  add constraint clients_next_follow_up_type_check
  check (
    next_follow_up_type is null
    or next_follow_up_type in ('call','whatsapp','email','meeting','other')
  );

create index if not exists idx_clients_next_follow_up_at
  on public.clients(workspace_id, next_follow_up_at)
  where next_follow_up_at is not null;

commit;
