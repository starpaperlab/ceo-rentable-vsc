begin;

update public.business_config bc
set onboarding_status = 'completed',
    onboarding_completed_at = coalesce(bc.onboarding_completed_at, bc.updated_at, timezone('utc', now())),
    onboarding_step = greatest(coalesce(bc.onboarding_step, 0), 8),
    onboarding_answers = coalesce(bc.onboarding_answers, '{}'::jsonb) || '{"legacy_completed": true}'::jsonb,
    updated_at = timezone('utc', now())
from public.workspaces w
join public.users u on u.id = w.owner_user_id
where bc.workspace_id = w.id
  and u.onboarding_completed = true
  and bc.onboarding_status = 'not_started';

drop policy if exists business_expenses_insert on public.business_expenses;
drop policy if exists business_expenses_update on public.business_expenses;
create policy business_expenses_insert on public.business_expenses for insert to authenticated
with check (public.workspace_can_write(workspace_id, 'settings'));
create policy business_expenses_update on public.business_expenses for update to authenticated
using (public.workspace_can_write(workspace_id, 'settings'))
with check (public.workspace_can_write(workspace_id, 'settings'));

drop policy if exists business_materials_insert on public.business_materials;
drop policy if exists business_materials_update on public.business_materials;
create policy business_materials_insert on public.business_materials for insert to authenticated
with check (public.workspace_can_write(workspace_id, 'settings'));
create policy business_materials_update on public.business_materials for update to authenticated
using (public.workspace_can_write(workspace_id, 'settings'))
with check (public.workspace_can_write(workspace_id, 'settings'));

drop policy if exists business_equipment_insert on public.business_equipment;
drop policy if exists business_equipment_update on public.business_equipment;
create policy business_equipment_insert on public.business_equipment for insert to authenticated
with check (public.workspace_can_write(workspace_id, 'settings'));
create policy business_equipment_update on public.business_equipment for update to authenticated
using (public.workspace_can_write(workspace_id, 'settings'))
with check (public.workspace_can_write(workspace_id, 'settings'));

commit;
