-- CEO Rentable OS™ — Fase 5 / Bloque E
-- Evita ocultar oportunidades al desactivar una etapa que todavía las contiene.

begin;

create or replace function public.protect_opportunity_stage_deactivation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.is_active and not new.is_active and exists (
    select 1 from public.opportunities where stage_id = old.id
  ) then
    raise exception 'No puedes desactivar una etapa que todavía contiene oportunidades.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_opportunity_stage_deactivation on public.opportunity_stages;
create trigger trg_protect_opportunity_stage_deactivation
before update of is_active on public.opportunity_stages
for each row execute function public.protect_opportunity_stage_deactivation();

revoke all on function public.protect_opportunity_stage_deactivation() from public, anon, authenticated;

commit;
