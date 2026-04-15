-- CEO Rentable OS™
-- Hotfix de guardado para proyectos con esquema mixto (legacy + fase 2)
-- Fecha: 2026-04-15

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key,
  email text unique,
  full_name text,
  role text default 'user',
  plan text default 'free',
  has_access boolean default true,
  onboarding_completed boolean default true,
  currency text default 'USD',
  timezone text default 'America/Santo_Domingo',
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

-- ============================================================
-- Helpers
-- ============================================================

create or replace function public.current_email()
returns text
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and coalesce(u.role, 'user') = 'admin'
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.sync_owned_record_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = tg_table_name
      and column_name = 'user_id'
  ) then
    if new.user_id is null and auth.uid() is not null then
      new.user_id = auth.uid();
    end if;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = tg_table_name
      and column_name = 'created_by'
  ) then
    if coalesce(new.created_by, '') = '' then
      new.created_by = public.current_email();
    end if;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = tg_table_name
      and column_name = 'updated_at'
  ) then
    new.updated_at = timezone('utc', now());
  end if;

  return new;
end;
$$;

-- ============================================================
-- Users table sync
-- ============================================================

insert into public.users (
  id,
  email,
  full_name,
  role,
  plan,
  has_access,
  onboarding_completed,
  currency,
  timezone,
  created_at,
  updated_at
)
select
  au.id,
  lower(au.email),
  coalesce(au.raw_user_meta_data ->> 'full_name', split_part(au.email, '@', 1)),
  coalesce(nullif(au.raw_user_meta_data ->> 'role', ''), 'user'),
  coalesce(nullif(au.raw_user_meta_data ->> 'plan', ''), 'free'),
  coalesce((au.raw_user_meta_data ->> 'has_access')::boolean, true),
  coalesce((au.raw_user_meta_data ->> 'onboarding_completed')::boolean, true),
  coalesce(nullif(au.raw_user_meta_data ->> 'currency', ''), 'USD'),
  coalesce(nullif(au.raw_user_meta_data ->> 'timezone', ''), 'America/Santo_Domingo'),
  timezone('utc', now()),
  timezone('utc', now())
from auth.users au
on conflict (id) do update
set
  email = excluded.email,
  full_name = coalesce(public.users.full_name, excluded.full_name),
  updated_at = timezone('utc', now());

-- ============================================================
-- Core tables: owner columns + triggers + RLS
-- ============================================================

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
    execute format('alter table if exists public.%I add column if not exists user_id uuid', t);
    execute format('alter table if exists public.%I add column if not exists created_by text', t);
    execute format('alter table if exists public.%I add column if not exists created_at timestamptz default timezone(''utc'', now())', t);
    execute format('alter table if exists public.%I add column if not exists updated_at timestamptz default timezone(''utc'', now())', t);

    execute format('update public.%I set user_id = auth.uid() where user_id is null and auth.uid() is not null', t);
    execute format('update public.%I set created_by = public.current_email() where coalesce(created_by, '''') = ''''', t);

    execute format('drop trigger if exists trg_%I_owner_meta on public.%I', t, t);
    execute format(
      'create trigger trg_%I_owner_meta before insert or update on public.%I for each row execute function public.sync_owned_record_metadata()',
      t,
      t
    );

    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I_owner_select on public.%I', t, t);
    execute format(
      'create policy %I_owner_select on public.%I for select using (coalesce(user_id = auth.uid(), false) or coalesce(created_by = public.current_email(), false) or public.is_admin())',
      t,
      t
    );

    execute format('drop policy if exists %I_owner_insert on public.%I', t, t);
    execute format(
      'create policy %I_owner_insert on public.%I for insert with check (coalesce(user_id = auth.uid(), true) or coalesce(created_by = public.current_email(), true) or public.is_admin())',
      t,
      t
    );

    execute format('drop policy if exists %I_owner_update on public.%I', t, t);
    execute format(
      'create policy %I_owner_update on public.%I for update using (coalesce(user_id = auth.uid(), false) or coalesce(created_by = public.current_email(), false) or public.is_admin()) with check (coalesce(user_id = auth.uid(), true) or coalesce(created_by = public.current_email(), true) or public.is_admin())',
      t,
      t
    );

    execute format('drop policy if exists %I_owner_delete on public.%I', t, t);
    execute format(
      'create policy %I_owner_delete on public.%I for delete using (coalesce(user_id = auth.uid(), false) or coalesce(created_by = public.current_email(), false) or public.is_admin())',
      t,
      t
    );
  end loop;
end $$;

-- ============================================================
-- Storage uploads bucket for logos
-- ============================================================

insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do nothing;

drop policy if exists uploads_public_read on storage.objects;
create policy uploads_public_read on storage.objects
for select
using (bucket_id = 'uploads');

drop policy if exists uploads_authenticated_insert on storage.objects;
create policy uploads_authenticated_insert on storage.objects
for insert
to authenticated
with check (bucket_id = 'uploads');

drop policy if exists uploads_owner_update on storage.objects;
create policy uploads_owner_update on storage.objects
for update
to authenticated
using (bucket_id = 'uploads' and (owner = auth.uid() or public.is_admin()))
with check (bucket_id = 'uploads' and (owner = auth.uid() or public.is_admin()));

drop policy if exists uploads_owner_delete on storage.objects;
create policy uploads_owner_delete on storage.objects
for delete
to authenticated
using (bucket_id = 'uploads' and (owner = auth.uid() or public.is_admin()));
