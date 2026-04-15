-- Diagnóstico rápido de guardado (Supabase SQL Editor)
-- Ejecuta este script para validar estructura y RLS.

-- 1) Tablas críticas
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'users','products','clients','monthly_records','appointments',
    'invoices','quotes','inventory_items','inventory_movements',
    'business_config','product_analysis','subscriptions','transactions','reportes'
  )
order by table_name;

-- 2) Columnas de ownership por tabla
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'products','clients','monthly_records','appointments',
    'invoices','quotes','inventory_items','inventory_movements',
    'business_config','product_analysis'
  )
  and column_name in ('user_id','created_by','created_at','updated_at')
order by table_name, column_name;

-- 3) RLS habilitado
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in (
    'products','clients','monthly_records','appointments',
    'invoices','quotes','inventory_items','inventory_movements',
    'business_config','product_analysis','users'
  )
order by relname;

-- 4) Policies por tabla
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'products','clients','monthly_records','appointments',
    'invoices','quotes','inventory_items','inventory_movements',
    'business_config','product_analysis','users'
  )
order by tablename, cmd, policyname;

-- 5) Huella de datos potencialmente "invisibles" por ownership mixto
-- Si aquí aparecen filas con solo created_by o solo user_id, conviene ejecutar el backfill.
select 'products' as table_name,
       count(*) filter (where user_id is null and coalesce(created_by,'') <> '') as only_email,
       count(*) filter (where user_id is not null and coalesce(created_by,'') = '') as only_user_id
from public.products
union all
select 'clients',
       count(*) filter (where user_id is null and coalesce(created_by,'') <> ''),
       count(*) filter (where user_id is not null and coalesce(created_by,'') = '')
from public.clients
union all
select 'invoices',
       count(*) filter (where user_id is null and coalesce(created_by,'') <> ''),
       count(*) filter (where user_id is not null and coalesce(created_by,'') = '')
from public.invoices
union all
select 'quotes',
       count(*) filter (where user_id is null and coalesce(created_by,'') <> ''),
       count(*) filter (where user_id is not null and coalesce(created_by,'') = '')
from public.quotes
union all
select 'appointments',
       count(*) filter (where user_id is null and coalesce(created_by,'') <> ''),
       count(*) filter (where user_id is not null and coalesce(created_by,'') = '')
from public.appointments
union all
select 'monthly_records',
       count(*) filter (where user_id is null and coalesce(created_by,'') <> ''),
       count(*) filter (where user_id is not null and coalesce(created_by,'') = '')
from public.monthly_records
union all
select 'inventory_items',
       count(*) filter (where user_id is null and coalesce(created_by,'') <> ''),
       count(*) filter (where user_id is not null and coalesce(created_by,'') = '')
from public.inventory_items
union all
select 'inventory_movements',
       count(*) filter (where user_id is null and coalesce(created_by,'') <> ''),
       count(*) filter (where user_id is not null and coalesce(created_by,'') = '')
from public.inventory_movements
union all
select 'business_config',
       count(*) filter (where user_id is null and coalesce(created_by,'') <> ''),
       count(*) filter (where user_id is not null and coalesce(created_by,'') = '')
from public.business_config
union all
select 'product_analysis',
       count(*) filter (where user_id is null and coalesce(created_by,'') <> ''),
       count(*) filter (where user_id is not null and coalesce(created_by,'') = '')
from public.product_analysis
order by table_name;
