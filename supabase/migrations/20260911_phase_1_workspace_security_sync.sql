-- CEO Rentable 2.0 — Fase 1
-- Sincroniza en el repositorio el cutover de RLS que ya está activo en producción.
-- Hace reproducible un entorno fresco y elimina permisos legacy por user_id.

begin;

create or replace function public.workspace_has_module_access(target_workspace_id uuid, target_module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin(auth.uid()) or exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and (
        wm.role = 'owner'
        or coalesce((wm.module_permissions ->> target_module)::boolean, false)
      )
  );
$$;

create or replace function public.workspace_can_write(target_workspace_id uuid, target_module text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin(auth.uid()) or exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.role <> 'viewer'
      and (
        wm.role = 'owner'
        or coalesce((wm.module_permissions ->> target_module)::boolean, false)
      )
  );
$$;

revoke all on function public.workspace_has_module_access(uuid,text) from public, anon;
revoke all on function public.workspace_can_write(uuid,text) from public, anon;
grant execute on function public.workspace_has_module_access(uuid,text) to authenticated, service_role;
grant execute on function public.workspace_can_write(uuid,text) to authenticated, service_role;

do $$
declare
  t text;
begin
  foreach t in array array['cost_library_items','profitability_cost_lines'] loop
    if to_regclass(format('public.%I', t)) is null then
      continue;
    end if;

    execute format(
      'alter table public.%I add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict',
      t
    );
    execute format(
      'create index if not exists %I on public.%I(workspace_id)',
      'idx_' || t || '_workspace_id',
      t
    );

    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name=t and column_name='user_id'
    ) then
      execute format($sql$
        update public.%1$I x
           set workspace_id = w.id
          from public.workspaces w
         where x.workspace_id is null
           and x.user_id is not null
           and w.owner_user_id = x.user_id
           and w.id = (
             select w2.id
             from public.workspaces w2
             where w2.owner_user_id = x.user_id
             order by w2.created_at asc, w2.id asc
             limit 1
           )
      $sql$, t);
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name=t and column_name='created_by'
    ) then
      execute format($sql$
        update public.%1$I x
           set workspace_id = w.id
          from public.users u
          join public.workspaces w on w.owner_user_id = u.id
         where x.workspace_id is null
           and x.created_by is not null
           and lower(trim(x.created_by)) = lower(trim(u.email))
           and w.id = (
             select w2.id
             from public.workspaces w2
             where w2.owner_user_id = u.id
             order by w2.created_at asc, w2.id asc
             limit 1
           )
      $sql$, t);
    end if;
  end loop;
end $$;

do $$
declare
  rec record;
  p record;
  select_expr text;
  write_expr text;
begin
  for rec in
    select * from (values
      ('alerts','dashboard'),
      ('appointments','agenda'),
      ('clients','clients'),
      ('cost_library_items','cost_library'),
      ('inventory_items','inventory'),
      ('inventory_movements','inventory'),
      ('invoices','billing'),
      ('monthly_records','monthly_control'),
      ('order_items','orders'),
      ('orders','orders'),
      ('product_analysis','profitability'),
      ('products','products'),
      ('profitability_cost_lines','profitability'),
      ('quotes','billing'),
      ('reports','reports')
    ) as x(table_name,module_key)
  loop
    if to_regclass(format('public.%I', rec.table_name)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', rec.table_name);

    for p in
      select policyname
      from pg_policies
      where schemaname='public' and tablename=rec.table_name
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, rec.table_name);
    end loop;

    select_expr := format('public.workspace_has_module_access(workspace_id, %L)', rec.module_key);
    write_expr := format('public.workspace_can_write(workspace_id, %L)', rec.module_key);

    execute format('create policy %I on public.%I for select to authenticated using (%s)',
      rec.table_name || '_workspace_select', rec.table_name, select_expr);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)',
      rec.table_name || '_workspace_insert', rec.table_name, write_expr);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
      rec.table_name || '_workspace_update', rec.table_name, write_expr, write_expr);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)',
      rec.table_name || '_workspace_delete', rec.table_name, write_expr);
  end loop;

  if to_regclass('public.invoice_payments') is not null then
    execute 'alter table public.invoice_payments enable row level security';

    for p in
      select policyname
      from pg_policies
      where schemaname='public' and tablename='invoice_payments'
    loop
      execute format('drop policy if exists %I on public.invoice_payments', p.policyname);
    end loop;

    select_expr := '(public.workspace_has_module_access(workspace_id, ''receivables'') or public.workspace_has_module_access(workspace_id, ''billing''))';
    write_expr := '(public.workspace_can_write(workspace_id, ''receivables'') or public.workspace_can_write(workspace_id, ''billing''))';

    execute format('create policy invoice_payments_workspace_select on public.invoice_payments for select to authenticated using (%s)', select_expr);
    execute format('create policy invoice_payments_workspace_insert on public.invoice_payments for insert to authenticated with check (%s)', write_expr);
    execute format('create policy invoice_payments_workspace_update on public.invoice_payments for update to authenticated using (%s) with check (%s)', write_expr, write_expr);
    execute format('create policy invoice_payments_workspace_delete on public.invoice_payments for delete to authenticated using (%s)', write_expr);
  end if;
end $$;

commit;
