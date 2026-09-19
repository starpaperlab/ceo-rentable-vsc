begin;

alter table public.business_config
  add column if not exists business_model text,
  add column if not exists industry_codes text[] not null default '{}'::text[],
  add column if not exists custom_industry text,
  add column if not exists workplace_modes text[] not null default '{}'::text[],
  add column if not exists custom_workplace text,
  add column if not exists work_days_per_week numeric(3,1),
  add column if not exists work_hours_per_day numeric(4,1),
  add column if not exists monthly_capacity numeric(12,2),
  add column if not exists monthly_capacity_unknown boolean not null default false,
  add column if not exists personal_income_goal numeric(14,2),
  add column if not exists onboarding_status text not null default 'not_started',
  add column if not exists onboarding_step integer not null default 0,
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists onboarding_version integer not null default 1,
  add column if not exists onboarding_answers jsonb not null default '{}'::jsonb,
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

alter table public.business_config drop constraint if exists business_config_business_model_check;
alter table public.business_config add constraint business_config_business_model_check
  check (business_model is null or business_model in ('products','services','both'));
alter table public.business_config drop constraint if exists business_config_onboarding_status_check;
alter table public.business_config add constraint business_config_onboarding_status_check
  check (onboarding_status in ('not_started','in_progress','completed'));
alter table public.business_config drop constraint if exists business_config_work_days_check;
alter table public.business_config add constraint business_config_work_days_check
  check (work_days_per_week is null or (work_days_per_week >= 0 and work_days_per_week <= 7));
alter table public.business_config drop constraint if exists business_config_work_hours_check;
alter table public.business_config add constraint business_config_work_hours_check
  check (work_hours_per_day is null or (work_hours_per_day >= 0 and work_hours_per_day <= 24));
alter table public.business_config drop constraint if exists business_config_capacity_check;
alter table public.business_config add constraint business_config_capacity_check
  check (monthly_capacity is null or monthly_capacity >= 0);
alter table public.business_config drop constraint if exists business_config_income_goal_check;
alter table public.business_config add constraint business_config_income_goal_check
  check (personal_income_goal is null or personal_income_goal >= 0);

create table if not exists public.business_expenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_by text,
  name text not null,
  category text not null default 'operacion',
  amount numeric(14,2) not null default 0 check (amount >= 0),
  frequency text not null default 'monthly',
  usage_scope text not null default 'business',
  is_subscription boolean not null default false,
  source text not null default 'manual',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint business_expenses_frequency_check check (frequency in ('weekly','monthly','quarterly','semiannual','annual','one_time')),
  constraint business_expenses_usage_scope_check check (usage_scope in ('business','shared','personal'))
);

create table if not exists public.business_materials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_by text,
  name text not null,
  purchase_price numeric(14,2) not null default 0 check (purchase_price >= 0),
  purchase_quantity numeric(14,4) not null default 1 check (purchase_quantity > 0),
  unit text not null default 'unidad',
  custom_unit text,
  source text not null default 'manual',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.business_equipment (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_by text,
  name text not null,
  estimated_price numeric(14,2) not null default 0 check (estimated_price >= 0),
  purchased_on date,
  usage_scope text not null default 'business',
  usage_intensity text not null default 'regular',
  source text not null default 'manual',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint business_equipment_usage_scope_check check (usage_scope in ('business','shared')),
  constraint business_equipment_usage_intensity_check check (usage_intensity in ('low','regular','high'))
);

create index if not exists idx_business_expenses_workspace on public.business_expenses(workspace_id);
create index if not exists idx_business_expenses_workspace_subscription on public.business_expenses(workspace_id, is_subscription);
create index if not exists idx_business_materials_workspace on public.business_materials(workspace_id);
create index if not exists idx_business_equipment_workspace on public.business_equipment(workspace_id);

drop trigger if exists trg_business_expenses_updated_at on public.business_expenses;
create trigger trg_business_expenses_updated_at before update on public.business_expenses
for each row execute function public.set_updated_at();
drop trigger if exists trg_business_materials_updated_at on public.business_materials;
create trigger trg_business_materials_updated_at before update on public.business_materials
for each row execute function public.set_updated_at();
drop trigger if exists trg_business_equipment_updated_at on public.business_equipment;
create trigger trg_business_equipment_updated_at before update on public.business_equipment
for each row execute function public.set_updated_at();

alter table public.business_expenses enable row level security;
alter table public.business_materials enable row level security;
alter table public.business_equipment enable row level security;

revoke all on table public.business_expenses, public.business_materials, public.business_equipment from anon, authenticated;
grant select, insert, update, delete on table public.business_expenses, public.business_materials, public.business_equipment to authenticated;

drop policy if exists business_expenses_select on public.business_expenses;
drop policy if exists business_expenses_insert on public.business_expenses;
drop policy if exists business_expenses_update on public.business_expenses;
drop policy if exists business_expenses_delete on public.business_expenses;
create policy business_expenses_select on public.business_expenses for select to authenticated
using (public.workspace_has_module_access(workspace_id, 'settings'));
create policy business_expenses_insert on public.business_expenses for insert to authenticated
with check (public.workspace_can_write(workspace_id, 'settings') and user_id = (select auth.uid()));
create policy business_expenses_update on public.business_expenses for update to authenticated
using (public.workspace_can_write(workspace_id, 'settings'))
with check (public.workspace_can_write(workspace_id, 'settings') and user_id = (select auth.uid()));
create policy business_expenses_delete on public.business_expenses for delete to authenticated
using (public.workspace_can_write(workspace_id, 'settings'));

drop policy if exists business_materials_select on public.business_materials;
drop policy if exists business_materials_insert on public.business_materials;
drop policy if exists business_materials_update on public.business_materials;
drop policy if exists business_materials_delete on public.business_materials;
create policy business_materials_select on public.business_materials for select to authenticated
using (public.workspace_has_module_access(workspace_id, 'settings'));
create policy business_materials_insert on public.business_materials for insert to authenticated
with check (public.workspace_can_write(workspace_id, 'settings') and user_id = (select auth.uid()));
create policy business_materials_update on public.business_materials for update to authenticated
using (public.workspace_can_write(workspace_id, 'settings'))
with check (public.workspace_can_write(workspace_id, 'settings') and user_id = (select auth.uid()));
create policy business_materials_delete on public.business_materials for delete to authenticated
using (public.workspace_can_write(workspace_id, 'settings'));

drop policy if exists business_equipment_select on public.business_equipment;
drop policy if exists business_equipment_insert on public.business_equipment;
drop policy if exists business_equipment_update on public.business_equipment;
drop policy if exists business_equipment_delete on public.business_equipment;
create policy business_equipment_select on public.business_equipment for select to authenticated
using (public.workspace_has_module_access(workspace_id, 'settings'));
create policy business_equipment_insert on public.business_equipment for insert to authenticated
with check (public.workspace_can_write(workspace_id, 'settings') and user_id = (select auth.uid()));
create policy business_equipment_update on public.business_equipment for update to authenticated
using (public.workspace_can_write(workspace_id, 'settings'))
with check (public.workspace_can_write(workspace_id, 'settings') and user_id = (select auth.uid()));
create policy business_equipment_delete on public.business_equipment for delete to authenticated
using (public.workspace_can_write(workspace_id, 'settings'));

commit;
