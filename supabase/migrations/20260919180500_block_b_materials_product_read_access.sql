begin;
drop policy if exists business_materials_select on public.business_materials;
create policy business_materials_select on public.business_materials
for select to authenticated
using (
  public.workspace_has_module_access(workspace_id, 'settings')
  or public.workspace_has_module_access(workspace_id, 'products')
);
commit;
