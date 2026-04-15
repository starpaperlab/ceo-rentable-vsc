-- CEO Rentable OS™
-- HOTFIX: Recursión infinita en RLS de users + 500 en tablas relacionadas
-- Ejecutar completo en Supabase SQL Editor

-- 1) Helper de rol basado en JWT (NO consulta tablas -> evita recursión)
create or replace function public.jwt_role()
returns text
language sql
stable
as $$
  select lower(coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role',
    'user'
  ));
$$;

-- Compatibilidad con funciones antiguas usadas por otras policies
create or replace function public.is_admin(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
as $$
  select public.jwt_role() = 'admin';
$$;

-- 2) Policy segura para users (sin subquery a users)
alter table if exists public.users enable row level security;

drop policy if exists users_select_own_or_admin on public.users;
drop policy if exists users_insert_own_profile on public.users;
drop policy if exists users_update_own_or_admin on public.users;
drop policy if exists users_delete_admin_only on public.users;

create policy users_select_own_or_admin on public.users
for select
using (
  id = auth.uid()
  or public.jwt_role() = 'admin'
);

create policy users_insert_own_profile on public.users
for insert
with check (
  id = auth.uid()
  or public.jwt_role() = 'admin'
);

create policy users_update_own_or_admin on public.users
for update
using (
  id = auth.uid()
  or public.jwt_role() = 'admin'
)
with check (
  id = auth.uid()
  or public.jwt_role() = 'admin'
);

create policy users_delete_admin_only on public.users
for delete
using (public.jwt_role() = 'admin');

-- 3) Re-crear policies owner en tablas de negocio evitando dependencia circular a users
do $$
declare
  t text;
  cond_select text;
  cond_write text;
  has_user_id boolean;
  has_created_by boolean;
  tables text[] := array[
    'products',
    'clients',
    'monthly_records',
    'appointments',
    'invoices',
    'quotes',
    'inventory_items',
    'inventory_movements',
    'business_config',
    'product_analysis'
  ];
begin
  foreach t in array tables loop
    if exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = t
    ) then
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = t and column_name = 'user_id'
      ) into has_user_id;

      select exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = t and column_name = 'created_by'
      ) into has_created_by;

      cond_select := '(public.jwt_role() = ''admin'')';
      cond_write := '(public.jwt_role() = ''admin'')';

      if has_user_id then
        cond_select := cond_select || ' or user_id = auth.uid()';
        cond_write := cond_write || ' or coalesce(user_id = auth.uid(), true)';
      end if;

      if has_created_by then
        cond_select := cond_select || ' or lower(coalesce(created_by, '''')) = lower(coalesce(auth.jwt() ->> ''email'', ''''))';
        cond_write := cond_write || ' or lower(coalesce(created_by, '''')) = lower(coalesce(auth.jwt() ->> ''email'', ''''))';
      end if;

      execute format('alter table public.%I enable row level security', t);

      execute format('drop policy if exists %I_owner_select on public.%I', t, t);
      execute format('drop policy if exists %I_owner_insert on public.%I', t, t);
      execute format('drop policy if exists %I_owner_update on public.%I', t, t);
      execute format('drop policy if exists %I_owner_delete on public.%I', t, t);

      execute format(
        'create policy %1$I_owner_select on public.%1$I for select using (%2$s)',
        t,
        cond_select
      );

      execute format(
        'create policy %1$I_owner_insert on public.%1$I for insert with check (%2$s)',
        t,
        cond_write
      );

      execute format(
        'create policy %1$I_owner_update on public.%1$I for update using (%2$s) with check (%3$s)',
        t,
        cond_select,
        cond_write
      );

      execute format(
        'create policy %1$I_owner_delete on public.%1$I for delete using (%2$s)',
        t,
        cond_select
      );
    end if;
  end loop;
end $$;
