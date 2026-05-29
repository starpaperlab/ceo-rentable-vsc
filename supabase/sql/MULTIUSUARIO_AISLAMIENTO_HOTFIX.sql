-- CEO Rentable OS™
-- Hotfix de aislamiento multiusuario (branding + módulos operativos)
-- Ejecutar en Supabase SQL Editor (producción) con usuario admin.

begin;

-- 1) Tablas críticas de operación por usuaria
DO $$
DECLARE
  t text;
  has_table boolean;
  tables text[] := array[
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
    'alerts'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    select to_regclass(format('public.%I', t)) is not null into has_table;
    if not has_table then
      continue;
    end if;

    execute format('alter table if exists public.%I add column if not exists user_id uuid', t);
    execute format('alter table if exists public.%I add column if not exists created_by text', t);

    execute format('update public.%I set created_by = lower(created_by) where created_by is not null and created_by <> lower(created_by)', t);

    execute format(
      'update public.%I x set user_id = u.id from public.users u where x.user_id is null and x.created_by is not null and lower(x.created_by) = lower(u.email)',
      t
    );

    execute format(
      'update public.%I x set created_by = lower(u.email) from public.users u where (x.created_by is null or x.created_by = '''') and x.user_id = u.id',
      t
    );

    execute format('create index if not exists idx_%I_user_id_isolation on public.%I(user_id)', t, t);
    execute format('create index if not exists idx_%I_created_by_isolation on public.%I(created_by)', t, t);

    execute format('alter table public.%I enable row level security', t);

    -- Limpiar políticas anteriores para evitar combinaciones inseguras
    execute format('drop policy if exists %I_owner_select on public.%I', t, t);
    execute format('drop policy if exists %I_owner_insert on public.%I', t, t);
    execute format('drop policy if exists %I_owner_update on public.%I', t, t);
    execute format('drop policy if exists %I_owner_delete on public.%I', t, t);

    -- Políticas estrictas por user_id (admin con bypass controlado)
    execute format(
      'create policy %I_owner_select on public.%I for select using (user_id = auth.uid() or public.is_admin(auth.uid()))',
      t, t
    );

    execute format(
      'create policy %I_owner_insert on public.%I for insert with check (user_id = auth.uid() or public.is_admin(auth.uid()))',
      t, t
    );

    execute format(
      'create policy %I_owner_update on public.%I for update using (user_id = auth.uid() or public.is_admin(auth.uid())) with check (user_id = auth.uid() or public.is_admin(auth.uid()))',
      t, t
    );

    execute format(
      'create policy %I_owner_delete on public.%I for delete using (user_id = auth.uid() or public.is_admin(auth.uid()))',
      t, t
    );
  END LOOP;
END
$$;

-- 2) Branding: 1 sola configuración por usuaria
-- Resolver duplicados dejando el registro más reciente por user_id.
DO $$
BEGIN
  if to_regclass('public.business_config') is not null then
    with ranked as (
      select
        id,
        user_id,
        row_number() over (
          partition by user_id
          order by updated_at desc nulls last, created_at desc nulls last, id desc
        ) as rn
      from public.business_config
      where user_id is not null
    )
    delete from public.business_config b
    using ranked r
    where b.id = r.id
      and r.rn > 1;

    create unique index if not exists idx_business_config_user_unique
      on public.business_config(user_id)
      where user_id is not null;
  end if;
END
$$;

commit;

-- 3) Diagnóstico rápido post-hotfix
-- Deben devolver 0 en null_user_id para tablas críticas.
create or replace function public._count_null_user_id_if_exists(target_table text)
returns bigint
language plpgsql
as $$
declare
  v_count bigint;
begin
  if to_regclass(format('public.%I', target_table)) is null then
    return null;
  end if;

  execute format('select count(*) from public.%I where user_id is null', target_table)
    into v_count;
  return v_count;
end;
$$;

with tables(table_name) as (
  values
    ('business_config'),
    ('products'),
    ('clients'),
    ('invoices'),
    ('quotes'),
    ('appointments'),
    ('monthly_records'),
    ('inventory_items'),
    ('inventory_movements'),
    ('product_analysis'),
    ('reports'),
    ('alerts')
)
select
  table_name,
  public._count_null_user_id_if_exists(table_name) as null_user_id
from tables;

drop function if exists public._count_null_user_id_if_exists(text);
