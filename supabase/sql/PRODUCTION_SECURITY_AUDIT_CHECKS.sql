-- CEO Rentable OS™
-- CHECKS DE AUDITORÍA PRE-PRODUCCIÓN (roles, segmentación, aislamiento)
-- Ejecutar después de PRODUCTION_SECURITY_HARDENING.sql

-- 1) Usuarios con combinaciones inseguras o inconsistentes
select
  id,
  email,
  role,
  plan,
  has_access,
  coalesce(to_jsonb(u) ->> 'access_source', '(missing)') as access_source,
  coalesce((to_jsonb(u) ->> 'is_lifetime')::boolean, false) as is_lifetime
from public.users u
where
  (role = 'admin' and coalesce(to_jsonb(u) ->> 'access_source', 'legacy') <> 'admin')
  or (
    coalesce(to_jsonb(u) ->> 'access_source', '') = 'manual_lifetime'
    and (
      role <> 'user'
      or plan <> 'founder'
      or coalesce((to_jsonb(u) ->> 'is_lifetime')::boolean, false) is distinct from true
    )
  )
  or (
    coalesce(to_jsonb(u) ->> 'access_source', '') in ('stripe_purchase', 'manual_payment')
    and (
      role <> 'user'
      or plan <> 'subscription'
      or coalesce((to_jsonb(u) ->> 'is_lifetime')::boolean, false) is distinct from false
    )
  );

-- 2) Registros huérfanos por tabla crítica (debe devolver 0 en cada tabla)
select 'products' as table_name, count(*) as null_user_id from public.products where user_id is null
union all
select 'clients', count(*) from public.clients where user_id is null
union all
select 'monthly_records', count(*) from public.monthly_records where user_id is null
union all
select 'appointments', count(*) from public.appointments where user_id is null
union all
select 'invoices', count(*) from public.invoices where user_id is null
union all
select 'quotes', count(*) from public.quotes where user_id is null
union all
select 'inventory_items', count(*) from public.inventory_items where user_id is null
union all
select 'inventory_movements', count(*) from public.inventory_movements where user_id is null
union all
select 'business_config', count(*) from public.business_config where user_id is null
union all
select 'product_analysis', count(*) from public.product_analysis where user_id is null
union all
select 'reports', count(*) from public.reports where user_id is null
union all
select 'alerts', count(*) from public.alerts where user_id is null
union all
select 'transactions', count(*) from public.transactions where user_id is null
union all
select 'subscriptions', count(*) from public.subscriptions where user_id is null;

-- 3) Estado RLS en tablas críticas (todas true)
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'users',
    'products',
    'clients',
    'monthly_records',
    'appointments',
    'invoices',
    'quotes',
    'inventory_items',
    'inventory_movements',
    'business_config',
    'product_analysis',
    'reports',
    'alerts',
    'transactions',
    'subscriptions',
    'user_invitations',
    'email_templates',
    'email_campaigns',
    'email_logs',
    'audit_logs'
  )
order by c.relname;

-- 4) Políticas activas por tabla crítica (verificación rápida)
select
  schemaname,
  tablename,
  policyname,
  cmd as command,
  permissive,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'users',
    'products',
    'clients',
    'monthly_records',
    'appointments',
    'invoices',
    'quotes',
    'inventory_items',
    'inventory_movements',
    'business_config',
    'product_analysis',
    'reports',
    'alerts',
    'transactions',
    'subscriptions',
    'user_invitations',
    'email_templates',
    'email_campaigns',
    'email_logs',
    'audit_logs'
  )
order by tablename, policyname;
