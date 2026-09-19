begin;

alter table public.business_config
  add column if not exists productive_time_pct numeric(5,2) not null default 70,
  add column if not exists overhead_allocation_method text not null default 'adaptive',
  add column if not exists custom_allocation_label text;

alter table public.business_config drop constraint if exists business_config_productive_time_pct_check;
alter table public.business_config add constraint business_config_productive_time_pct_check
  check (productive_time_pct > 0 and productive_time_pct <= 100);

alter table public.business_config drop constraint if exists business_config_overhead_allocation_method_check;
alter table public.business_config add constraint business_config_overhead_allocation_method_check
  check (overhead_allocation_method in ('adaptive','orders','units','clients','services','hours','projects','sales','custom'));

alter table public.business_expenses
  add column if not exists business_use_pct numeric(5,2) not null default 100,
  add column if not exists business_use_source text not null default 'manual';

alter table public.business_expenses drop constraint if exists business_expenses_business_use_pct_check;
alter table public.business_expenses add constraint business_expenses_business_use_pct_check
  check (business_use_pct >= 0 and business_use_pct <= 100);

alter table public.business_expenses drop constraint if exists business_expenses_business_use_source_check;
alter table public.business_expenses add constraint business_expenses_business_use_source_check
  check (business_use_source in ('manual','guided','default'));

update public.business_expenses
set business_use_pct = case usage_scope
  when 'business' then 100
  when 'personal' then 0
  else least(greatest(business_use_pct, 0), 100)
end;

alter table public.business_expenses drop constraint if exists business_expenses_frequency_check;
alter table public.business_expenses add constraint business_expenses_frequency_check
  check (frequency in ('weekly','biweekly','monthly','quarterly','semiannual','annual','one_time'));

alter table public.business_equipment
  add column if not exists business_use_pct numeric(5,2) not null default 100,
  add column if not exists operational_life_months integer,
  add column if not exists monthly_cost_override numeric(14,4);

alter table public.business_equipment drop constraint if exists business_equipment_business_use_pct_check;
alter table public.business_equipment add constraint business_equipment_business_use_pct_check
  check (business_use_pct >= 0 and business_use_pct <= 100);

alter table public.business_equipment drop constraint if exists business_equipment_operational_life_check;
alter table public.business_equipment add constraint business_equipment_operational_life_check
  check (operational_life_months is null or operational_life_months > 0);

alter table public.business_equipment drop constraint if exists business_equipment_monthly_override_check;
alter table public.business_equipment add constraint business_equipment_monthly_override_check
  check (monthly_cost_override is null or monthly_cost_override >= 0);

commit;
