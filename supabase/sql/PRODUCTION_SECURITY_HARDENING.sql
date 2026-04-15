-- CEO Rentable OS™
-- HARDENING DE SEGURIDAD Y PERMISOS PRE-PRODUCCIÓN
-- Fecha: 2026-04-15

begin;

create extension if not exists pgcrypto;

-- ============================================================
-- 1) FUNCIÓN ADMIN SEGURA (sin recursión de RLS)
-- ============================================================

drop function if exists public.is_admin(uuid);

create or replace function public.is_admin(target_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
begin
  if target_user_id is null then
    return false;
  end if;

  select exists (
    select 1
    from public.users u
    where u.id = target_user_id
      and lower(coalesce(u.role, 'user')) = 'admin'
  )
  into v_is_admin;

  return coalesce(v_is_admin, false);
end;
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated;

-- ============================================================
-- 2) SEGMENTACIÓN EXPLÍCITA DE USUARIOS
-- ============================================================

alter table public.users add column if not exists access_source text default 'self_signup';
alter table public.users add column if not exists is_lifetime boolean default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_access_source_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_access_source_check
      check (access_source in (
        'self_signup',
        'manual_lifetime',
        'stripe_purchase',
        'manual_payment',
        'admin',
        'legacy'
      ));
  end if;
end $$;

update public.users
set access_source = case
  when lower(coalesce(role, 'user')) = 'admin' then 'admin'
  when lower(coalesce(access_source, '')) in ('manual_lifetime', 'stripe_purchase', 'manual_payment', 'admin', 'self_signup') then lower(access_source)
  when lower(coalesce(plan, 'free')) = 'subscription' then 'stripe_purchase'
  when has_access = true and lower(coalesce(plan, 'free')) = 'founder' then 'manual_lifetime'
  when lower(coalesce(plan, 'free')) = 'admin' then 'admin'
  else 'self_signup'
end
where access_source is null
   or access_source = ''
   or lower(access_source) = 'legacy';

update public.users
set is_lifetime = case
  when lower(coalesce(role, 'user')) = 'admin' then true
  when access_source = 'manual_lifetime' then true
  else false
end
where is_lifetime is null
   or is_lifetime <> case
     when lower(coalesce(role, 'user')) = 'admin' then true
     when access_source = 'manual_lifetime' then true
     else false
   end;

create or replace function public.enforce_user_access_segmentation()
returns trigger
language plpgsql
as $$
begin
  new.role := lower(coalesce(new.role, 'user'));
  new.plan := lower(coalesce(new.plan, 'free'));
  new.access_source := lower(coalesce(new.access_source, 'self_signup'));

  if new.role = 'admin' then
    new.plan := 'admin';
    new.has_access := true;
    new.access_source := 'admin';
    new.is_lifetime := true;
    return new;
  end if;

  if new.access_source = 'manual_lifetime' then
    new.role := 'user';
    new.plan := 'founder';
    new.has_access := true;
    new.is_lifetime := true;
    return new;
  end if;

  if new.access_source in ('stripe_purchase', 'manual_payment') then
    new.role := 'user';
    new.plan := 'subscription';
    new.is_lifetime := false;
    return new;
  end if;

  if new.access_source = 'self_signup' and coalesce(new.has_access, false) = false then
    new.role := 'user';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_users_access_segmentation on public.users;
create trigger trg_users_access_segmentation
before insert or update on public.users
for each row
execute function public.enforce_user_access_segmentation();

-- ============================================================
-- 3) INVITACIONES MANUALES (lifetime user, no admin)
-- ============================================================

alter table public.user_invitations add column if not exists access_source text default 'manual_lifetime';
alter table public.user_invitations add column if not exists is_lifetime boolean default true;

update public.user_invitations
set access_source = coalesce(nullif(lower(access_source), ''), 'manual_lifetime'),
    is_lifetime = coalesce(is_lifetime, true);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_invitations_access_source_check'
      and conrelid = 'public.user_invitations'::regclass
  ) then
    alter table public.user_invitations
      add constraint user_invitations_access_source_check
      check (access_source in ('manual_lifetime', 'manual_payment', 'stripe_purchase', 'self_signup'));
  end if;
end $$;

create or replace function public.apply_pending_invitation()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_invitation record;
begin
  if auth.uid() is null then
    return jsonb_build_object('applied', false, 'reason', 'not_authenticated');
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email = '' then
    return jsonb_build_object('applied', false, 'reason', 'missing_email');
  end if;

  select *
  into v_invitation
  from public.user_invitations i
  where lower(i.email) = v_email
    and i.status = 'pending'
    and (i.expires_at is null or i.expires_at > timezone('utc', now()))
  order by i.updated_at desc nulls last
  limit 1;

  if not found then
    return jsonb_build_object('applied', false, 'reason', 'no_pending_invitation');
  end if;

  update public.users
  set
    role = case
      when coalesce(v_invitation.access_source, 'manual_lifetime') = 'manual_lifetime' then 'user'
      else coalesce(v_invitation.role, role, 'user')
    end,
    plan = case
      when coalesce(v_invitation.access_source, 'manual_lifetime') = 'manual_lifetime' then 'founder'
      when coalesce(v_invitation.access_source, '') in ('stripe_purchase', 'manual_payment') then 'subscription'
      else coalesce(v_invitation.plan, plan, 'free')
    end,
    has_access = coalesce(v_invitation.has_access, has_access, true),
    access_source = coalesce(v_invitation.access_source, access_source, 'manual_lifetime'),
    is_lifetime = coalesce(v_invitation.is_lifetime, is_lifetime, true),
    full_name = coalesce(nullif(full_name, ''), nullif(v_invitation.full_name, '')),
    updated_at = timezone('utc', now())
  where id = auth.uid();

  update public.user_invitations
  set
    status = 'accepted',
    accepted_at = timezone('utc', now()),
    accepted_user_id = auth.uid(),
    updated_at = timezone('utc', now())
  where id = v_invitation.id;

  insert into public.audit_logs (admin_id, action, target_user_id, details, created_at)
  values (
    v_invitation.invited_by,
    'invitation_accepted',
    auth.uid(),
    jsonb_build_object(
      'email', v_email,
      'invitation_id', v_invitation.id,
      'role', v_invitation.role,
      'plan', v_invitation.plan,
      'access_source', v_invitation.access_source,
      'is_lifetime', v_invitation.is_lifetime,
      'has_access', v_invitation.has_access
    ),
    timezone('utc', now())
  );

  return jsonb_build_object(
    'applied', true,
    'role', v_invitation.role,
    'plan', v_invitation.plan,
    'access_source', v_invitation.access_source,
    'is_lifetime', v_invitation.is_lifetime,
    'has_access', v_invitation.has_access
  );
end;
$$;

revoke all on function public.apply_pending_invitation() from public;
grant execute on function public.apply_pending_invitation() to authenticated;

-- ============================================================
-- 4) RLS ESTRICTO POR user_id EN TABLAS CRÍTICAS
-- ============================================================

do $$
declare
  t text;
  has_null_user_id boolean;
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
    'product_analysis',
    'reports',
    'alerts',
    'transactions',
    'subscriptions'
  ];
begin
  foreach t in array owner_tables loop
    if to_regclass(format('public.%I', t)) is null then
      continue;
    end if;

    execute format('alter table public.%I add column if not exists user_id uuid', t);
    execute format('alter table public.%I add column if not exists created_by text', t);
    execute format('update public.%I set created_by = lower(created_by) where created_by is not null and created_by <> lower(created_by)', t);
    execute format(
      'update public.%I x set user_id = u.id from public.users u where x.user_id is null and x.created_by is not null and lower(x.created_by) = lower(u.email)',
      t
    );
    execute format(
      'update public.%I x set created_by = lower(u.email) from public.users u where (x.created_by is null or x.created_by = '''') and x.user_id = u.id',
      t
    );

    execute format('select exists(select 1 from public.%I where user_id is null)', t) into has_null_user_id;
    if not has_null_user_id then
      execute format('alter table public.%I alter column user_id set not null', t);
    end if;

    execute format('create index if not exists idx_%I_user_id_hardened on public.%I (user_id)', t, t);

    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I_owner_select on public.%I', t, t);
    execute format('drop policy if exists %I_owner_insert on public.%I', t, t);
    execute format('drop policy if exists %I_owner_update on public.%I', t, t);
    execute format('drop policy if exists %I_owner_delete on public.%I', t, t);

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
  end loop;
end $$;

-- ============================================================
-- 5) USERS RLS (separación real admin vs user)
-- ============================================================

alter table public.users enable row level security;

drop policy if exists users_select_own_or_admin on public.users;
drop policy if exists users_insert_own_or_admin on public.users;
drop policy if exists users_update_own_or_admin on public.users;
drop policy if exists users_delete_admin_only on public.users;

create policy users_select_own_or_admin on public.users
for select
using (id = auth.uid() or public.is_admin(auth.uid()));

create policy users_insert_own_or_admin on public.users
for insert
with check (id = auth.uid() or public.is_admin(auth.uid()));

create policy users_update_own_or_admin on public.users
for update
using (id = auth.uid() or public.is_admin(auth.uid()))
with check (id = auth.uid() or public.is_admin(auth.uid()));

create policy users_delete_admin_only on public.users
for delete
using (public.is_admin(auth.uid()));

commit;
