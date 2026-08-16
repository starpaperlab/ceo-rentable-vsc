-- CEO Rentable OS(TM)
-- Phase 0.1: canonical admin authority and strict owner RLS.
--
-- Security goals:
--   * public.users.role is the only administrative authority.
--   * NULL ownership never grants access.
--   * authenticated users cannot assign or transfer rows to another user_id.
--   * legacy rows are preserved; deterministic created_by matches are backfilled.

begin;

-- Canonical helper used by RLS and profile-protection triggers.  Keep the
-- existing defaulted signature so historical callers may use either
-- is_admin() or is_admin(auth.uid()) without a redundant overload.
create or replace function public.is_admin(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    target_user_id is not null
    and exists (
      select 1
      from public.users u
      where u.id = target_user_id
        and lower(coalesce(u.role, 'user')) = 'admin'
    ),
    false
  );
$$;

-- Compatibility for policies installed by ADMIN_PANEL_PRODUCTION_SETUP.sql.
-- It delegates to the same canonical source and never inspects JWT metadata.
create or replace function public.is_current_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_admin(auth.uid());
$$;

revoke all on function public.is_admin(uuid) from public;
revoke all on function public.is_current_admin() from public;
revoke all on function public.is_admin(uuid) from anon, authenticated;
revoke all on function public.is_current_admin() from anon, authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.is_current_admin() to authenticated;

-- A normal user may update their profile row, but never its authoritative
-- identity, commercial access, provider identity, or administrative fields.
create or replace function public.handle_user_profile_defaults()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.email := lower(trim(new.email));

  if tg_op = 'INSERT' then
    if auth.uid() is not null
       and not public.is_admin(auth.uid())
       and new.id <> auth.uid() then
      raise exception 'No puedes crear perfiles para otra usuaria.';
    end if;

    if auth.uid() is not null and not public.is_admin(auth.uid()) then
      new.role := 'user';
      new.plan := 'free';
      new.has_access := false;
      new.access_status := 'pending_payment';
      new.access_source := 'self_signup';
      new.is_lifetime := false;
      new.payment_provider := null;
      new.provider_customer_id := null;
    end if;
  end if;

  if tg_op = 'UPDATE'
     and auth.uid() is not null
     and not public.is_admin(auth.uid()) then
    new.id := old.id;
    new.email := old.email;
    new.role := old.role;
    new.plan := old.plan;
    new.has_access := old.has_access;
    new.access_status := old.access_status;
    new.access_source := old.access_source;
    new.is_lifetime := old.is_lifetime;
    new.payment_provider := old.payment_provider;
    new.provider_customer_id := old.provider_customer_id;
  end if;

  if lower(coalesce(new.role, 'user')) = 'admin' then
    new.role := 'admin';
    new.plan := 'admin';
    new.has_access := true;
    new.access_status := 'active';
  end if;

  if new.created_at is null then
    new.created_at := timezone('utc', now());
  end if;

  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

-- Auth signup metadata is user-controlled.  Never copy role, plan, access, or
-- provider identifiers from raw_user_meta_data into the authoritative profile.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.users (
    id,
    email,
    full_name,
    phone,
    role,
    plan,
    has_access,
    access_status,
    access_source,
    is_lifetime,
    onboarding_completed,
    currency,
    timezone,
    created_at,
    updated_at
  )
  values (
    new.id,
    lower(trim(new.email)),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(new.email, '@', 1)
    ),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    'user',
    'free',
    false,
    'pending_payment',
    'self_signup',
    false,
    lower(coalesce(new.raw_user_meta_data ->> 'onboarding_completed', 'false')) in ('true', '1'),
    coalesce(nullif(new.raw_user_meta_data ->> 'currency', ''), 'USD'),
    coalesce(nullif(new.raw_user_meta_data ->> 'timezone', ''), 'America/Santo_Domingo'),
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

drop trigger if exists trg_users_defaults on public.users;
create trigger trg_users_defaults
before insert or update on public.users
for each row
execute function public.handle_user_profile_defaults();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_auth_user();

-- Recreate the profile policies so a JWT user_metadata claim can never act as
-- administrative authority.  The trigger above protects privileged columns
-- when a user updates their own row.
alter table public.users enable row level security;

drop policy if exists users_select_own_or_admin on public.users;
drop policy if exists users_insert_own_profile on public.users;
drop policy if exists users_insert_own_or_admin on public.users;
drop policy if exists users_update_own_or_admin on public.users;
drop policy if exists users_delete_admin_only on public.users;

create policy users_select_own_or_admin
on public.users
for select
using (id = auth.uid() or public.is_admin(auth.uid()));

create policy users_insert_own_profile
on public.users
for insert
with check (id = auth.uid() or public.is_admin(auth.uid()));

create policy users_update_own_or_admin
on public.users
for update
using (id = auth.uid() or public.is_admin(auth.uid()))
with check (id = auth.uid() or public.is_admin(auth.uid()));

create policy users_delete_admin_only
on public.users
for delete
using (public.is_admin(auth.uid()));

-- Repair only the ten policies weakened by 20260415_guardado_hotfix.sql.
-- Existing rows with no deterministic owner remain untouched and become
-- invisible to non-admin users.  Per-table counts are emitted as NOTICEs when
-- this migration is eventually executed.
do $$
declare
  t text;
  backfilled_count bigint;
  unresolved_count bigint;
  owner_tables text[] := array[
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
  foreach t in array owner_tables loop
    if to_regclass(format('public.%I', t)) is null then
      raise notice 'Phase 0.1 RLS: table public.% does not exist; skipped.', t;
      continue;
    end if;

    execute format(
      'update public.%I x
          set user_id = u.id
         from public.users u
        where x.user_id is null
          and nullif(trim(x.created_by), '''') is not null
          and lower(trim(x.created_by)) = lower(trim(u.email))',
      t
    );
    get diagnostics backfilled_count = row_count;

    execute format(
      'select count(*) from public.%I where user_id is null',
      t
    ) into unresolved_count;

    raise notice
      'Phase 0.1 RLS: public.% backfilled=%, unresolved_preserved=%',
      t,
      backfilled_count,
      unresolved_count;

    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I_owner_select on public.%I', t, t);
    execute format('drop policy if exists %I_owner_insert on public.%I', t, t);
    execute format('drop policy if exists %I_owner_update on public.%I', t, t);
    execute format('drop policy if exists %I_owner_delete on public.%I', t, t);

    execute format(
      'create policy %I_owner_select on public.%I
         for select
         using (user_id = auth.uid() or public.is_admin(auth.uid()))',
      t,
      t
    );

    execute format(
      'create policy %I_owner_insert on public.%I
         for insert
         with check (user_id = auth.uid() or public.is_admin(auth.uid()))',
      t,
      t
    );

    execute format(
      'create policy %I_owner_update on public.%I
         for update
         using (user_id = auth.uid() or public.is_admin(auth.uid()))
         with check (user_id = auth.uid() or public.is_admin(auth.uid()))',
      t,
      t
    );

    execute format(
      'create policy %I_owner_delete on public.%I
         for delete
         using (user_id = auth.uid() or public.is_admin(auth.uid()))',
      t,
      t
    );
  end loop;
end
$$;

commit;
