-- CEO Rentable OS
-- Fix user profile defaults trigger after legacy feature columns were removed.
-- Safe scope: replace function only. No data, roles, plans, RLS, policies, or brand profiles are modified.

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
