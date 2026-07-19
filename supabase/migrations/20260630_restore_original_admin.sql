-- CEO Rentable OS
-- Restore the original production administrator.
-- Idempotent and intentionally scoped to exactly one known owner account.

do $$
declare
  v_admin_id constant uuid := '08550c1d-f7a5-4a6e-9bdf-38388c135314';
  v_admin_email constant text := 'ceorentable@gmail.com';
  v_target_count integer;
  v_admin_count integer;
begin
  select count(*)
    into v_target_count
    from public.users
   where id = v_admin_id
     and lower(coalesce(email, '')) = v_admin_email;

  if v_target_count <> 1 then
    raise exception
      'restore_original_admin aborted: expected exactly one owner user for id %, email %, found %',
      v_admin_id,
      v_admin_email,
      v_target_count;
  end if;

  update public.users
     set role = 'admin',
         plan = 'admin',
         updated_at = timezone('utc', now())
   where id = v_admin_id
     and lower(coalesce(email, '')) = v_admin_email
     and (
       lower(coalesce(role, '')) is distinct from 'admin'
       or lower(coalesce(plan, '')) is distinct from 'admin'
     );

  select count(*)
    into v_admin_count
    from public.users
   where lower(coalesce(role, '')) = 'admin';

  if v_admin_count <> 1 then
    raise exception
      'restore_original_admin aborted: expected exactly one admin after restore, found %',
      v_admin_count;
  end if;
end
$$;
