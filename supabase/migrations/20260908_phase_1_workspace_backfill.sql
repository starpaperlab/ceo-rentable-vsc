-- CEO Rentable 2.0 — Fase 1B
-- Backfill seguro de workspace_id sin eliminar ni reemplazar ownership legacy.
-- Objetivo: conservar 100% del histórico y preparar aislamiento por empresa.

begin;

-- 1) Garantizar un workspace inicial para cada cuenta existente.
insert into public.workspaces (
  name,
  slug,
  owner_user_id,
  country_code,
  currency_code,
  timezone,
  created_at,
  updated_at
)
select
  coalesce(
    nullif(trim(u.business_name), ''),
    nullif(trim(u.full_name), ''),
    nullif(trim(u.email), ''),
    'Mi empresa'
  ) as name,
  'legacy-' || replace(u.id::text, '-', '') as slug,
  u.id,
  null,
  coalesce(nullif(trim(u.currency), ''), 'DOP'),
  coalesce(nullif(trim(u.timezone), ''), 'America/Santo_Domingo'),
  timezone('utc', now()),
  timezone('utc', now())
from public.users u
where not exists (
  select 1
  from public.workspace_members wm
  where wm.user_id = u.id
    and wm.status = 'active'
)
on conflict (slug) do nothing;

-- Toda cuenta propietaria debe quedar como owner de su workspace inicial.
insert into public.workspace_members (workspace_id, user_id, role, status, created_at)
select w.id, w.owner_user_id, 'owner', 'active', timezone('utc', now())
from public.workspaces w
left join public.workspace_members wm
  on wm.workspace_id = w.id
 and wm.user_id = w.owner_user_id
where wm.workspace_id is null
on conflict (workspace_id, user_id) do nothing;

-- 2) Agregar workspace_id de forma aditiva a tablas históricas reales.
-- Si una tabla todavía no existe en un entorno, se omite sin fallar.
do $$
declare
  t text;
  tenant_tables text[] := array[
    'business_config',
    'products',
    'clients',
    'invoices',
    'quotes',
    'appointments',
    'monthly_records',
    'inventory_items',
    'inventory_movements',
    'product_analysis',
    'reports',
    'alerts',
    'orders',
    'order_items',
    'invoice_payments',
    'brand_profiles'
  ];
begin
  foreach t in array tenant_tables loop
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

    -- Regla primaria: el histórico sigue a su user_id actual.
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'user_id'
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

    -- Compatibilidad histórica: registros viejos que solo tengan created_by.
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'created_by'
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

-- 3) Reparación por relación padre-hijo. No modifica datos funcionales.
update public.order_items oi
   set workspace_id = o.workspace_id
  from public.orders o
 where oi.workspace_id is null
   and oi.order_id = o.id
   and o.workspace_id is not null;

update public.invoice_payments p
   set workspace_id = i.workspace_id
  from public.invoices i
 where p.workspace_id is null
   and p.invoice_id = i.id
   and i.workspace_id is not null;

update public.inventory_movements m
   set workspace_id = ii.workspace_id
  from public.inventory_items ii
 where m.workspace_id is null
   and m.inventory_item_id = ii.id
   and ii.workspace_id is not null;

-- 4) Diagnóstico reutilizable. No borra filas y no impone NOT NULL todavía.
create or replace function public.workspace_backfill_status()
returns table(table_name text, total_rows bigint, rows_with_workspace bigint, rows_without_workspace bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  t text;
  tenant_tables text[] := array[
    'business_config','products','clients','invoices','quotes','appointments',
    'monthly_records','inventory_items','inventory_movements','product_analysis',
    'reports','alerts','orders','order_items','invoice_payments','brand_profiles'
  ];
  v_total bigint;
  v_with bigint;
  v_without bigint;
begin
  foreach t in array tenant_tables loop
    if to_regclass(format('public.%I', t)) is null then
      continue;
    end if;

    execute format(
      'select count(*), count(*) filter (where workspace_id is not null), count(*) filter (where workspace_id is null) from public.%I',
      t
    ) into v_total, v_with, v_without;

    table_name := t;
    total_rows := v_total;
    rows_with_workspace := v_with;
    rows_without_workspace := v_without;
    return next;
  end loop;
end;
$$;

revoke all on function public.workspace_backfill_status() from public;
grant execute on function public.workspace_backfill_status() to authenticated;

-- IMPORTANTE:
-- En esta etapa NO se elimina user_id/created_by, NO se cambia el RLS legacy,
-- y NO se fuerza workspace_id NOT NULL. El cambio de autoridad a workspace
-- se hará solo después de validar que rows_without_workspace = 0.

commit;
