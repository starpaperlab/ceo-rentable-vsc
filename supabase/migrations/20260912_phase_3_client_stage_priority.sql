-- CEO Rentable 2.0 — Fase 3 / Punto 5
-- Etapa comercial y prioridad del cliente.

begin;

alter table public.clients
  add column if not exists crm_stage text not null default 'new',
  add column if not exists priority text not null default 'normal';

alter table public.clients
  drop constraint if exists clients_crm_stage_check,
  add constraint clients_crm_stage_check
  check (crm_stage in ('new','follow_up','interested','quoted','negotiation','won','lost'));

alter table public.clients
  drop constraint if exists clients_priority_check,
  add constraint clients_priority_check
  check (priority in ('low','normal','high','urgent'));

update public.clients
   set crm_stage = case
     when coalesce(total_billed,0) > 0 then 'won'
     else 'new'
   end
 where crm_stage is null
    or crm_stage not in ('new','follow_up','interested','quoted','negotiation','won','lost');

update public.clients
   set priority = case
     when status = 'vip' then 'high'
     else 'normal'
   end
 where priority is null
    or priority not in ('low','normal','high','urgent');

create index if not exists idx_clients_workspace_crm_stage
  on public.clients(workspace_id, crm_stage);

create index if not exists idx_clients_workspace_priority
  on public.clients(workspace_id, priority);

commit;
