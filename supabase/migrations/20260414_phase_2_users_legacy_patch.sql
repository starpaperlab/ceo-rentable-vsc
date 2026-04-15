-- ============================================================
-- CEO RENTABLE OS™
-- FASE 2 · PATCH LEGACY PARA public.users
-- Ejecutar en SQL Editor de Supabase (una sola vez)
-- Objetivo: actualizar tabla users existente sin perder datos
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.users add column if not exists phone text;
alter table public.users add column if not exists business_name text;
alter table public.users add column if not exists avatar_url text;
alter table public.users add column if not exists role text;
alter table public.users add column if not exists plan text;
alter table public.users add column if not exists has_access boolean;
alter table public.users add column if not exists onboarding_completed boolean;
alter table public.users add column if not exists luna_access boolean;
alter table public.users add column if not exists automatizaciones_access boolean;
alter table public.users add column if not exists nuevas_funciones_access boolean;
alter table public.users add column if not exists currency text;
alter table public.users add column if not exists timezone text;
alter table public.users add column if not exists stripe_customer_id text;
alter table public.users add column if not exists stripe_session_id text;
alter table public.users add column if not exists last_login_at timestamptz;
alter table public.users add column if not exists updated_at timestamptz;

-- Backfill para usuarias legacy
update public.users set email = lower(trim(email)) where email is not null;
update public.users set role = coalesce(role, 'user');
update public.users set plan = coalesce(plan, 'founder');
update public.users set has_access = coalesce(has_access, true);
update public.users set onboarding_completed = coalesce(onboarding_completed, true);
update public.users set luna_access = coalesce(luna_access, false);
update public.users set automatizaciones_access = coalesce(automatizaciones_access, false);
update public.users set nuevas_funciones_access = coalesce(nuevas_funciones_access, false);
update public.users set currency = coalesce(currency, 'USD');
update public.users set timezone = coalesce(timezone, 'America/Santo_Domingo');
update public.users set updated_at = coalesce(updated_at, timezone('utc', now()));

alter table public.users alter column role set default 'user';
alter table public.users alter column plan set default 'free';
alter table public.users alter column has_access set default false;
alter table public.users alter column onboarding_completed set default false;
alter table public.users alter column luna_access set default false;
alter table public.users alter column automatizaciones_access set default false;
alter table public.users alter column nuevas_funciones_access set default false;
alter table public.users alter column currency set default 'USD';
alter table public.users alter column timezone set default 'America/Santo_Domingo';
alter table public.users alter column updated_at set default timezone('utc', now());

alter table public.users alter column role set not null;
alter table public.users alter column plan set not null;
alter table public.users alter column has_access set not null;
alter table public.users alter column onboarding_completed set not null;
alter table public.users alter column luna_access set not null;
alter table public.users alter column automatizaciones_access set not null;
alter table public.users alter column nuevas_funciones_access set not null;
alter table public.users alter column currency set not null;
alter table public.users alter column timezone set not null;
alter table public.users alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_role_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_role_check check (role in ('admin', 'user'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_plan_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_plan_check check (plan in ('free', 'founder', 'subscription', 'admin'));
  end if;
end $$;

create unique index if not exists idx_users_email_unique on public.users (email);
create unique index if not exists idx_users_stripe_customer_id on public.users (stripe_customer_id) where stripe_customer_id is not null;
create index if not exists idx_users_role on public.users (role);
create index if not exists idx_users_plan on public.users (plan);
create index if not exists idx_users_has_access on public.users (has_access);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
before update on public.users
for each row
execute function public.set_updated_at();

create or replace function public.is_admin(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
      from public.users
     where id = target_user_id
       and role = 'admin'
  );
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (
    id, email, full_name, phone, role, plan, has_access,
    onboarding_completed, currency, timezone, created_at, updated_at
  )
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'phone',
    case when new.raw_user_meta_data ->> 'role' = 'admin' then 'admin' else 'user' end,
    case
      when new.raw_user_meta_data ->> 'role' = 'admin' then 'admin'
      when new.raw_user_meta_data ->> 'plan' in ('founder', 'subscription') then new.raw_user_meta_data ->> 'plan'
      else 'free'
    end,
    case when new.raw_user_meta_data ->> 'role' = 'admin' then true else false end,
    coalesce((new.raw_user_meta_data ->> 'onboarding_completed')::boolean, false),
    coalesce(new.raw_user_meta_data ->> 'currency', 'USD'),
    coalesce(new.raw_user_meta_data ->> 'timezone', 'America/Santo_Domingo'),
    timezone('utc', now()),
    timezone('utc', now())
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(public.users.full_name, excluded.full_name),
      phone = coalesce(public.users.phone, excluded.phone),
      updated_at = timezone('utc', now());

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

-- Crear perfil para auth.users que aun no existe en public.users
insert into public.users (
  id, email, full_name, role, plan, has_access, onboarding_completed, currency, timezone, created_at, updated_at
)
select
  au.id,
  lower(au.email),
  coalesce(au.raw_user_meta_data ->> 'full_name', split_part(au.email, '@', 1)),
  'user',
  'founder',
  true,
  true,
  'USD',
  'America/Santo_Domingo',
  timezone('utc', now()),
  timezone('utc', now())
from auth.users au
where not exists (
  select 1
  from public.users pu
  where pu.id = au.id
     or lower(pu.email) = lower(au.email)
);

alter table public.users enable row level security;

drop policy if exists users_select_own_or_admin on public.users;
drop policy if exists users_insert_own_profile on public.users;
drop policy if exists users_update_own_or_admin on public.users;
drop policy if exists users_delete_admin_only on public.users;

create policy users_select_own_or_admin on public.users
for select
using (id = auth.uid() or public.is_admin());

create policy users_insert_own_profile on public.users
for insert
with check (id = auth.uid() or public.is_admin());

create policy users_update_own_or_admin on public.users
for update
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

create policy users_delete_admin_only on public.users
for delete
using (public.is_admin());

-- Diagnostico rapido (opcional): filas cuyo email existe en auth pero con id distinto.
-- select u.email, u.id as user_id, au.id as auth_id
-- from public.users u
-- join auth.users au on lower(au.email) = lower(u.email)
-- where u.id <> au.id;
