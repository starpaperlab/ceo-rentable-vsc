begin;

alter table public.product_cost_components add column if not exists workspace_id uuid;
alter table public.product_bundle_items add column if not exists workspace_id uuid;

update public.product_cost_components c
set workspace_id = p.workspace_id
from public.products p
where p.id = c.product_id and c.workspace_id is null;

update public.product_bundle_items b
set workspace_id = p.workspace_id
from public.products p
where p.id = b.bundle_product_id and b.workspace_id is null;

alter table public.product_cost_components alter column workspace_id set not null;
alter table public.product_bundle_items alter column workspace_id set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='product_cost_components_workspace_id_fkey') then
    alter table public.product_cost_components
      add constraint product_cost_components_workspace_id_fkey
      foreign key (workspace_id) references public.workspaces(id) on delete restrict;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='product_bundle_items_workspace_id_fkey') then
    alter table public.product_bundle_items
      add constraint product_bundle_items_workspace_id_fkey
      foreign key (workspace_id) references public.workspaces(id) on delete restrict;
  end if;
end $$;

create index if not exists idx_product_cost_components_workspace on public.product_cost_components(workspace_id);
create index if not exists idx_product_bundle_items_workspace on public.product_bundle_items(workspace_id);

drop policy if exists product_cost_components_owner_select on public.product_cost_components;
drop policy if exists product_cost_components_owner_insert on public.product_cost_components;
drop policy if exists product_cost_components_owner_update on public.product_cost_components;
drop policy if exists product_cost_components_owner_delete on public.product_cost_components;
drop policy if exists product_cost_components_workspace_select on public.product_cost_components;
drop policy if exists product_cost_components_workspace_insert on public.product_cost_components;
drop policy if exists product_cost_components_workspace_update on public.product_cost_components;
drop policy if exists product_cost_components_workspace_delete on public.product_cost_components;

create policy product_cost_components_workspace_select on public.product_cost_components for select to authenticated
using (public.workspace_has_module_access(workspace_id, 'products'));
create policy product_cost_components_workspace_insert on public.product_cost_components for insert to authenticated
with check (
  public.workspace_can_write(workspace_id, 'products')
  and exists (
    select 1 from public.products p
    where p.id = product_id and p.workspace_id = workspace_id and p.user_id = user_id
  )
);
create policy product_cost_components_workspace_update on public.product_cost_components for update to authenticated
using (public.workspace_can_write(workspace_id, 'products'))
with check (
  public.workspace_can_write(workspace_id, 'products')
  and exists (
    select 1 from public.products p
    where p.id = product_id and p.workspace_id = workspace_id and p.user_id = user_id
  )
);
create policy product_cost_components_workspace_delete on public.product_cost_components for delete to authenticated
using (public.workspace_can_write(workspace_id, 'products'));

drop policy if exists product_bundle_items_owner_select on public.product_bundle_items;
drop policy if exists product_bundle_items_owner_insert on public.product_bundle_items;
drop policy if exists product_bundle_items_owner_update on public.product_bundle_items;
drop policy if exists product_bundle_items_owner_delete on public.product_bundle_items;
drop policy if exists product_bundle_items_workspace_select on public.product_bundle_items;
drop policy if exists product_bundle_items_workspace_insert on public.product_bundle_items;
drop policy if exists product_bundle_items_workspace_update on public.product_bundle_items;
drop policy if exists product_bundle_items_workspace_delete on public.product_bundle_items;

create policy product_bundle_items_workspace_select on public.product_bundle_items for select to authenticated
using (public.workspace_has_module_access(workspace_id, 'products'));
create policy product_bundle_items_workspace_insert on public.product_bundle_items for insert to authenticated
with check (
  public.workspace_can_write(workspace_id, 'products')
  and exists (
    select 1 from public.products p
    where p.id = bundle_product_id and p.workspace_id = workspace_id and p.user_id = user_id
  )
  and exists (
    select 1 from public.products p
    where p.id = component_product_id and p.workspace_id = workspace_id and p.user_id = user_id
  )
);
create policy product_bundle_items_workspace_update on public.product_bundle_items for update to authenticated
using (public.workspace_can_write(workspace_id, 'products'))
with check (
  public.workspace_can_write(workspace_id, 'products')
  and exists (
    select 1 from public.products p
    where p.id = bundle_product_id and p.workspace_id = workspace_id and p.user_id = user_id
  )
  and exists (
    select 1 from public.products p
    where p.id = component_product_id and p.workspace_id = workspace_id and p.user_id = user_id
  )
);
create policy product_bundle_items_workspace_delete on public.product_bundle_items for delete to authenticated
using (public.workspace_can_write(workspace_id, 'products'));

commit;
