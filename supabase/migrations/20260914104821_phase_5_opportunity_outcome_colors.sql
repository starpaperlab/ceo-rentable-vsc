-- CEO Rentable OS™ — Fase 5 / Bloque F
-- Semántica visual obligatoria para cierres de oportunidad.

begin;

alter table public.opportunity_stages
  add constraint opportunity_stages_outcome_color_check
  check (
    (stage_type = 'won' and color = 'success')
    or (stage_type = 'lost' and color = 'danger')
    or stage_type = 'open'
  );

commit;
