-- CEO Rentable OS™
-- Backfill de ownership para registros legacy guardados solo por email o solo por user_id
-- Fecha: 2026-04-15

do $$
declare
  t text;
  core_tables text[] := array[
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
  foreach t in array core_tables loop
    -- Normalizar created_by a minúsculas
    execute format('update public.%I set created_by = lower(created_by) where created_by is not null and created_by <> lower(created_by)', t);

    -- Completar user_id desde email
    execute format(
      'update public.%I x set user_id = u.id from public.users u where x.user_id is null and x.created_by is not null and lower(x.created_by) = lower(u.email)',
      t
    );

    -- Completar created_by desde user_id
    execute format(
      'update public.%I x set created_by = lower(u.email) from public.users u where (x.created_by is null or x.created_by = '''') and x.user_id is not null and x.user_id = u.id',
      t
    );

    -- Índices para consultas por owner
    execute format('create index if not exists idx_%I_user_id on public.%I (user_id)', t, t);
    execute format('create index if not exists idx_%I_created_by on public.%I (created_by)', t, t);
  end loop;
end $$;
