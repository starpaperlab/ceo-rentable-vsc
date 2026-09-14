-- CEO Rentable OS™ — Fase 5 / Bloque E
-- Invariantes para la etapa predeterminada del pipeline.

begin;

alter table public.opportunity_stages
  add constraint opportunity_stages_default_active_check
  check (not is_default or is_active);

alter table public.opportunity_stages
  add constraint opportunity_stages_default_open_check
  check (not is_default or stage_type = 'open');

commit;
