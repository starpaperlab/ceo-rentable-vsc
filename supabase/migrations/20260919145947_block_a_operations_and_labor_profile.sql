begin;
alter table public.business_config
  add column if not exists operation_mode text,
  add column if not exists labor_mode text,
  add column if not exists team_size integer;

alter table public.business_config
  drop constraint if exists business_config_labor_mode_check;
alter table public.business_config
  add constraint business_config_labor_mode_check
  check (labor_mode is null or labor_mode in ('solo','team','contractors','mixed'));

alter table public.business_config
  drop constraint if exists business_config_team_size_check;
alter table public.business_config
  add constraint business_config_team_size_check
  check (team_size is null or team_size >= 1);
commit;
