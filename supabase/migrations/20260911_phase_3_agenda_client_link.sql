-- CEO Rentable 2.0 — Fase 3 / Punto 3
-- Vincula agenda con clientes CRM.

begin;

alter table public.appointments
  add column if not exists client_id uuid references public.clients(id) on delete set null;

create index if not exists idx_appointments_client_id
  on public.appointments(client_id);

with unique_matches as (
  select
    a.id as appointment_id,
    min(c.id::text)::uuid as client_id
  from public.appointments a
  join public.clients c
    on c.workspace_id = a.workspace_id
   and lower(trim(c.name)) = lower(trim(a.client_name))
  where a.client_id is null
    and a.workspace_id is not null
    and nullif(trim(a.client_name), '') is not null
  group by a.id
  having count(*) = 1
)
update public.appointments a
   set client_id = m.client_id
  from unique_matches m
 where a.id = m.appointment_id
   and a.client_id is null;

commit;
