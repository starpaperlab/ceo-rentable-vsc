-- Whop bridge. Requires the existing users/subscriptions and phase-0.1 hardening.
-- No existing tables, memberships or provider data are removed.
begin;
do $$ begin
  if to_regclass('public.users') is null or to_regclass('public.subscriptions') is null
     or to_regprocedure('public.handle_user_profile_defaults()') is null then
    raise exception 'Apply the CEO schema and profile hardening before Whop';
  end if;
end $$;

alter table public.users add column if not exists whop_access_until timestamptz;
alter table public.subscriptions
  add column if not exists trial_start timestamptz,
  add column if not exists trial_end timestamptz,
  add column if not exists next_billing_at timestamptz;

-- Extend existing checks without dropping any previously accepted values.
do $$ declare c record; extra text; begin
  for c in select conname, conrelid, pg_get_expr(conbin,conrelid) expr
    from pg_constraint where contype='c' and conrelid in ('public.users'::regclass,'public.subscriptions'::regclass)
      and conname in ('users_access_source_check','subscriptions_access_source_check','subscriptions_status_check')
  loop
    extra := case when c.conname='subscriptions_status_check'
      then 'payment_provider = ''whop'' and status in (''cancelled'',''payment_failed'',''incomplete'')'
      else 'access_source = ''whop''' end;
    if position('whop' in c.expr)=0 then
      execute format('alter table %s drop constraint %I', c.conrelid::regclass,c.conname);
      execute format('alter table %s add constraint %I check ((%s) or (%s))',c.conrelid::regclass,c.conname,c.expr,extra);
    end if;
  end loop;
end $$;

create table if not exists public.whop_checkout_intents (
  id uuid primary key,
  user_id uuid not null references public.users(id),
  plan_code text not null check (plan_code in ('monthly','annual')),
  whop_plan_id text not null,
  whop_account_id text not null,
  checkout_id text unique,
  membership_id text unique,
  terms_accepted_at timestamptz not null,
  marketing_accepted boolean not null default false,
  country text not null,
  created_at timestamptz not null default now()
);
create index if not exists whop_checkout_intents_user_idx on public.whop_checkout_intents(user_id);
create table if not exists public.whop_memberships (
  membership_id text primary key,
  intent_id uuid not null unique references public.whop_checkout_intents(id),
  user_id uuid not null references public.users(id),
  customer_id text not null,
  plan_code text not null,
  status text not null,
  has_access boolean not null,
  provider_updated_at timestamptz not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_start timestamptz,
  trial_end timestamptz,
  next_billing_at timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists whop_memberships_user_idx on public.whop_memberships(user_id);
create table if not exists public.whop_webhook_events (
  event_id text primary key,
  event_type text not null,
  membership_id text not null,
  processed_at timestamptz not null default now()
);
alter table public.whop_checkout_intents enable row level security;
alter table public.whop_memberships enable row level security;
alter table public.whop_webhook_events enable row level security;
revoke all on public.whop_checkout_intents, public.whop_memberships, public.whop_webhook_events from public, anon, authenticated;
grant all on public.whop_checkout_intents, public.whop_memberships, public.whop_webhook_events to service_role;

-- Existing owner-write policies must never authorize browser writes to Whop billing.
create or replace function public.protect_whop_subscription() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if current_user in ('anon','authenticated') and
     (coalesce(new.payment_provider,'')='whop' or coalesce(old.payment_provider,'')='whop') then
    raise exception 'Whop subscriptions are managed by verified server events only';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists protect_whop_subscription on public.subscriptions;
create trigger protect_whop_subscription before insert or update or delete on public.subscriptions
for each row execute function public.protect_whop_subscription();

create or replace function public.protect_whop_access_until() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if current_user in ('anon','authenticated') then
    if tg_op='INSERT' then new.whop_access_until:=null;
    else new.whop_access_until:=old.whop_access_until; end if;
  end if;
  return new;
end $$;
drop trigger if exists protect_whop_access_until on public.users;
create trigger protect_whop_access_until before insert or update on public.users
for each row execute function public.protect_whop_access_until();

create or replace function public.apply_whop_membership(
  p_event_id text, p_event_type text, p_intent_id uuid, p_snapshot jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  i public.whop_checkout_intents%rowtype;
  m public.whop_memberships%rowtype;
  chosen public.whop_memberships%rowtype;
  changed integer;
  access_ok boolean;
begin
  select * into i from public.whop_checkout_intents where id=p_intent_id for update;
  if not found then raise exception 'Unknown checkout intent'; end if;
  perform pg_advisory_xact_lock(hashtextextended(i.user_id::text,0));
  if i.whop_plan_id is distinct from p_snapshot->>'plan_id'
     or i.plan_code is distinct from p_snapshot->>'plan_code'
     or i.whop_account_id is distinct from p_snapshot->>'account_id'
     or coalesce(p_snapshot->>'customer_id','')=''
     or coalesce(p_snapshot->>'membership_id','')=''
     or (i.membership_id is not null and i.membership_id <> p_snapshot->>'membership_id') then
    raise exception 'Whop intent binding mismatch';
  end if;
  if p_event_id is null or p_event_id='' or p_snapshot->>'status' not in
    ('active','trialing','cancelled','expired','payment_failed','incomplete') then
    raise exception 'Invalid event or membership state';
  end if;
  insert into public.whop_webhook_events(event_id,event_type,membership_id)
    values(p_event_id,p_event_type,p_snapshot->>'membership_id') on conflict do nothing;
  get diagnostics changed = row_count;
  if changed=0 then return jsonb_build_object('status','duplicate'); end if;
  select * into m from public.whop_memberships where membership_id=p_snapshot->>'membership_id';
  if found and (m.user_id<>i.user_id or m.customer_id<>p_snapshot->>'customer_id' or m.intent_id<>i.id) then
    raise exception 'Membership ownership cannot change';
  end if;
  if found and m.provider_updated_at > (p_snapshot->>'updated_at')::timestamptz then
    return jsonb_build_object('status','stale');
  end if;
  update public.whop_checkout_intents set membership_id=p_snapshot->>'membership_id' where id=i.id;
  insert into public.whop_memberships (
    membership_id,intent_id,user_id,customer_id,plan_code,status,has_access,provider_updated_at,
    current_period_start,current_period_end,trial_start,trial_end,next_billing_at,cancel_at_period_end,canceled_at
  ) values (
    p_snapshot->>'membership_id',i.id,i.user_id,p_snapshot->>'customer_id',i.plan_code,p_snapshot->>'status',
    coalesce((p_snapshot->>'access')::boolean,false),(p_snapshot->>'updated_at')::timestamptz,
    (p_snapshot->>'period_start')::timestamptz,(p_snapshot->>'period_end')::timestamptz,
    (p_snapshot->>'trial_start')::timestamptz,(p_snapshot->>'trial_end')::timestamptz,
    (p_snapshot->>'next_billing_at')::timestamptz,coalesce((p_snapshot->>'cancel_at_period_end')::boolean,false),
    (p_snapshot->>'canceled_at')::timestamptz
  ) on conflict(membership_id) do update set
    status=excluded.status,has_access=excluded.has_access,provider_updated_at=excluded.provider_updated_at,
    current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,
    trial_start=coalesce(whop_memberships.trial_start,excluded.trial_start),
    trial_end=coalesce(whop_memberships.trial_end,excluded.trial_end),next_billing_at=excluded.next_billing_at,
    cancel_at_period_end=excluded.cancel_at_period_end,canceled_at=excluded.canceled_at,updated_at=now();
  -- A cancellation from an old membership cannot revoke a newer valid membership.
  select * into chosen from public.whop_memberships where user_id=i.user_id
    order by (has_access and current_period_end>now()) desc,provider_updated_at desc,membership_id limit 1;
  access_ok:=chosen.has_access and chosen.current_period_end>now();
  -- Preserve historical/manual/PayPal grants acquired independently of this checkout.
  if exists(select 1 from public.users where id=i.user_id and has_access and payment_provider is distinct from 'whop') then
    return jsonb_build_object('status','preserved_existing_access');
  end if;
  insert into public.subscriptions (
    user_id,plan,plan_code,status,is_lifetime,access_source,payment_provider,provider_customer_id,provider_subscription_id,
    current_period_start,current_period_end,trial_start,trial_end,next_billing_at,cancel_at_period_end,canceled_at,metadata,updated_at
  ) values (
    i.user_id,'subscription',chosen.plan_code,chosen.status,false,'whop','whop',chosen.customer_id,chosen.membership_id,
    chosen.current_period_start,chosen.current_period_end,chosen.trial_start,chosen.trial_end,chosen.next_billing_at,
    chosen.cancel_at_period_end,chosen.canceled_at,jsonb_build_object('whop_event_id',p_event_id),now()
  ) on conflict(user_id) do update set
    plan=excluded.plan,plan_code=excluded.plan_code,status=excluded.status,is_lifetime=false,
    access_source='whop',payment_provider='whop',provider_customer_id=excluded.provider_customer_id,
    provider_subscription_id=excluded.provider_subscription_id,current_period_start=excluded.current_period_start,
    current_period_end=excluded.current_period_end,trial_start=excluded.trial_start,trial_end=excluded.trial_end,
    next_billing_at=excluded.next_billing_at,cancel_at_period_end=excluded.cancel_at_period_end,
    canceled_at=excluded.canceled_at,metadata=subscriptions.metadata||excluded.metadata,updated_at=now();
  update public.users set has_access=coalesce(access_ok,false),access_status=case when access_ok then 'active' else 'inactive' end,
    plan='subscription',is_lifetime=false,payment_provider='whop',access_source='whop',provider_customer_id=chosen.customer_id,
    whop_access_until=chosen.current_period_end,updated_at=now() where id=i.user_id;
  return jsonb_build_object('status','processed');
end $$;
revoke all on function public.apply_whop_membership(text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.apply_whop_membership(text,text,uuid,jsonb) to service_role;

create or replace function public.whop_checkout_ready() returns boolean
language sql security definer set search_path=public,pg_temp as $$
  select to_regprocedure('public.apply_whop_membership(text,text,uuid,jsonb)') is not null;
$$;
revoke all on function public.whop_checkout_ready() from public,anon,authenticated;
grant execute on function public.whop_checkout_ready() to service_role;
commit;
