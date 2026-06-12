-- CEO Rentable OS™
-- Fase critica: bloqueo real de acceso.
-- Agrega public.users.access_status (active | pending_payment | blocked | cancelled)
-- y endurece handle_user_profile_defaults() para que:
--   * role = 'admin' siempre quede con plan = 'admin', has_access = true, access_status = 'active'
--   * usuarios no-admin no puedan autoeditar role/plan/has_access/access_status/access_source/is_lifetime
-- Migracion aditiva: no elimina columnas, tablas ni datos.

-- 1) Nueva columna (nullable primero para poder hacer backfill por fila existente)
alter table public.users
  add column if not exists access_status text;

update public.users
   set access_status = case when has_access = true then 'active' else 'pending_payment' end
 where access_status is null;

alter table public.users
  alter column access_status set not null,
  alter column access_status set default 'pending_payment';

alter table public.users drop constraint if exists users_access_status_check;
alter table public.users
  add constraint users_access_status_check
  check (access_status in ('active', 'pending_payment', 'blocked', 'cancelled'));

create index if not exists idx_users_access_status on public.users(access_status);

-- 2) Endurecer trigger de defaults/seguridad de public.users
create or replace function public.handle_user_profile_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.email = lower(trim(new.email));

  if tg_op = 'INSERT' then
    if auth.uid() is not null and not public.is_admin() and new.id <> auth.uid() then
      raise exception 'No puedes crear perfiles para otra usuaria.';
    end if;

    if auth.uid() is not null and not public.is_admin() then
      new.role = 'user';
      new.plan = 'free';
      new.has_access = false;
      new.access_status = 'pending_payment';
      new.luna_access = false;
      new.automatizaciones_access = false;
      new.nuevas_funciones_access = false;
    end if;
  end if;

  if tg_op = 'UPDATE' and auth.uid() is not null and not public.is_admin() then
    new.id = old.id;
    new.email = old.email;
    new.role = old.role;
    new.plan = old.plan;
    new.has_access = old.has_access;
    new.access_status = old.access_status;
    new.access_source = old.access_source;
    new.is_lifetime = old.is_lifetime;
    new.luna_access = old.luna_access;
    new.automatizaciones_access = old.automatizaciones_access;
    new.nuevas_funciones_access = old.nuevas_funciones_access;
    new.stripe_customer_id = old.stripe_customer_id;
    new.stripe_session_id = old.stripe_session_id;
  end if;

  if new.role = 'admin' then
    new.has_access = true;
    new.plan = 'admin';
    new.access_status = 'active';
  end if;

  if new.created_at is null then
    new.created_at = timezone('utc', now());
  end if;

  new.updated_at = timezone('utc', now());
  return new;
end;
$$;
