-- CEO Rentable OS™ — Fase 5 / Bloque E
-- Índices para las FK nuevas del pipeline.

begin;

create index if not exists idx_opportunities_client_id
  on public.opportunities(client_id);

create index if not exists idx_opportunity_history_from_stage_id
  on public.opportunity_stage_history(from_stage_id);

create index if not exists idx_opportunity_history_to_stage_id
  on public.opportunity_stage_history(to_stage_id);

commit;
