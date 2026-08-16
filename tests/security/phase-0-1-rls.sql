-- Phase 0.1 RLS/invitation integration test.
-- Run ONLY on a disposable/local Supabase database after both Phase 0.1
-- migrations. Every fixture is rolled back. Never run on production without
-- separate authorization.

begin;

create temporary table phase_0_1_fixture (
  user_a uuid,
  user_b uuid,
  client_a uuid,
  client_b uuid,
  invitation_id uuid
) on commit drop;

do $$
declare
  v_user_a uuid;
  v_user_b uuid;
  v_client_a uuid;
  v_client_b uuid;
  v_invitation_id uuid;
begin
  select id into v_user_a
  from public.users
  where lower(coalesce(role, 'user')) <> 'admin'
  order by created_at
  limit 1;

  select id into v_user_b
  from public.users
  where lower(coalesce(role, 'user')) <> 'admin'
    and id <> v_user_a
  order by created_at
  limit 1;

  if v_user_a is null or v_user_b is null then
    raise exception 'Phase 0.1 integration test requires two existing non-admin fixture users.';
  end if;

  insert into public.clients (user_id, name)
  values (v_user_a, 'PHASE_0_1_CLIENT_A')
  returning id into v_client_a;

  insert into public.clients (user_id, name)
  values (v_user_b, 'PHASE_0_1_CLIENT_B')
  returning id into v_client_b;

  insert into public.user_invitations (
    email,
    role,
    plan,
    invitation_token,
    status,
    expires_at
  )
  values (
    'phase-0-1-invite@example.invalid',
    'user',
    'founder',
    'phase-0-1-single-use-token',
    'pending',
    timezone('utc', now()) + interval '1 hour'
  )
  returning id into v_invitation_id;

  insert into phase_0_1_fixture
  values (v_user_a, v_user_b, v_client_a, v_client_b, v_invitation_id);
end
$$;

set local role authenticated;

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', user_a,
    'role', 'authenticated',
    'user_metadata', jsonb_build_object('role', 'admin')
  )::text,
  true
)
from phase_0_1_fixture;

select set_config('request.jwt.claim.sub', user_a::text, true)
from phase_0_1_fixture;

do $$
declare
  v_fixture phase_0_1_fixture%rowtype;
  v_count integer;
  v_role text;
begin
  select * into v_fixture from phase_0_1_fixture;

  select count(*) into v_count
  from public.clients
  where id = v_fixture.client_a;
  if v_count <> 1 then
    raise exception 'FAIL A: Usuario A cannot read Cliente A.';
  end if;

  select count(*) into v_count
  from public.clients
  where id = v_fixture.client_b;
  if v_count <> 0 then
    raise exception 'FAIL B: Usuario A can read Cliente B.';
  end if;

  update public.clients
  set notes = 'forbidden update'
  where id = v_fixture.client_b;
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'FAIL C: Usuario A modified Cliente B.';
  end if;

  delete from public.clients where id = v_fixture.client_b;
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'FAIL D: Usuario A deleted Cliente B.';
  end if;

  begin
    insert into public.clients (user_id, name)
    values (v_fixture.user_b, 'FORBIDDEN_OWNER_INSERT');
    raise exception 'FAIL E: Usuario A inserted a Cliente owned by Usuario B.';
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.clients
    set user_id = v_fixture.user_b
    where id = v_fixture.client_a;
    raise exception 'FAIL F: Usuario A transferred Cliente A to Usuario B.';
  exception
    when insufficient_privilege then null;
  end;

  update public.users
  set role = 'admin', plan = 'admin', has_access = true
  where id = v_fixture.user_a;

  select role into v_role from public.users where id = v_fixture.user_a;
  if lower(coalesce(v_role, '')) <> 'user' then
    raise exception 'FAIL G: Usuario A escalated its role to admin.';
  end if;

  if public.is_admin(v_fixture.user_a) then
    raise exception 'FAIL H: user_metadata.role granted admin authority.';
  end if;
end
$$;

reset role;
set local role service_role;

do $$
declare
  v_fixture phase_0_1_fixture%rowtype;
  v_first jsonb;
  v_second jsonb;
  v_finalized boolean;
begin
  select * into v_fixture from phase_0_1_fixture;

  select public.claim_user_invitation(
    'phase-0-1-single-use-token',
    'phase-0-1-invite@example.invalid',
    v_fixture.user_a
  ) into v_first;

  select public.claim_user_invitation(
    'phase-0-1-single-use-token',
    'phase-0-1-invite@example.invalid',
    v_fixture.user_a
  ) into v_second;

  if v_first is null or v_second is not null then
    raise exception 'FAIL I: invitation claim is not single-use.';
  end if;

  select public.finalize_user_invitation(v_fixture.invitation_id, v_fixture.user_a)
  into v_finalized;
  if not v_finalized then
    raise exception 'FAIL J: invitation did not finalize.';
  end if;

  select public.claim_user_invitation(
    'phase-0-1-single-use-token',
    'phase-0-1-invite@example.invalid',
    v_fixture.user_a
  ) into v_second;
  if v_second is not null then
    raise exception 'FAIL K: accepted invitation was reusable.';
  end if;
end
$$;

reset role;
rollback;
