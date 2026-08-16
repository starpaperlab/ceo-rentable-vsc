-- CEO Rentable OS(TM)
-- Phase 0.1: formalize invitations and enforce atomic, single-use claims.
--
-- This migration does not delete invitation records.  Existing rows are kept;
-- NOT VALID constraints protect new writes without rejecting legacy rows that
-- may require later administrative review.

begin;

create extension if not exists pgcrypto;

create table if not exists public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text,
  role text not null default 'user',
  plan text default 'free',
  has_access boolean default true,
  access_source text default 'manual_lifetime',
  is_lifetime boolean default true,
  invited_by uuid,
  invitation_token text not null default encode(gen_random_bytes(24), 'hex'),
  invitation_link text,
  status text not null default 'pending',
  sent_count integer not null default 1,
  last_sent_at timestamptz default timezone('utc', now()),
  expires_at timestamptz default (timezone('utc', now()) + interval '7 days'),
  processing_at timestamptz,
  accepted_at timestamptz,
  accepted_user_id uuid,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

alter table public.user_invitations add column if not exists full_name text;
alter table public.user_invitations add column if not exists role text default 'user';
alter table public.user_invitations add column if not exists plan text default 'free';
alter table public.user_invitations add column if not exists has_access boolean default true;
alter table public.user_invitations add column if not exists access_source text default 'manual_lifetime';
alter table public.user_invitations add column if not exists is_lifetime boolean default true;
alter table public.user_invitations add column if not exists invited_by uuid;
alter table public.user_invitations add column if not exists invitation_token text default encode(gen_random_bytes(24), 'hex');
alter table public.user_invitations add column if not exists invitation_link text;
alter table public.user_invitations add column if not exists status text default 'pending';
alter table public.user_invitations add column if not exists sent_count integer default 1;
alter table public.user_invitations add column if not exists last_sent_at timestamptz default timezone('utc', now());
alter table public.user_invitations add column if not exists expires_at timestamptz default (timezone('utc', now()) + interval '7 days');
alter table public.user_invitations add column if not exists processing_at timestamptz;
alter table public.user_invitations add column if not exists accepted_at timestamptz;
alter table public.user_invitations add column if not exists accepted_user_id uuid;
alter table public.user_invitations add column if not exists created_at timestamptz default timezone('utc', now());
alter table public.user_invitations add column if not exists updated_at timestamptz default timezone('utc', now());

create unique index if not exists user_invitations_email_unique
  on public.user_invitations (lower(email));
create unique index if not exists user_invitations_token_unique
  on public.user_invitations (invitation_token)
  where invitation_token is not null;
create index if not exists user_invitations_status_idx
  on public.user_invitations (status);
create index if not exists user_invitations_expiry_idx
  on public.user_invitations (expires_at);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_invitations_status_phase_0_1_check'
      and conrelid = 'public.user_invitations'::regclass
  ) then
    alter table public.user_invitations
      add constraint user_invitations_status_phase_0_1_check
      check (status in ('pending', 'processing', 'accepted', 'revoked'))
      not valid;
  end if;

end
$$;

alter table public.user_invitations enable row level security;

drop policy if exists user_invitations_admin_all on public.user_invitations;
drop policy if exists user_invitations_select on public.user_invitations;
drop policy if exists user_invitations_insert on public.user_invitations;
drop policy if exists user_invitations_update on public.user_invitations;
drop policy if exists user_invitations_delete on public.user_invitations;

create policy user_invitations_admin_all
on public.user_invitations
for all
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

revoke all on table public.user_invitations from anon;
grant select, insert, update, delete on table public.user_invitations to authenticated;

-- Only the service role may claim an invitation.  UPDATE ... WHERE status =
-- 'pending' is the atomic compare-and-set that prevents concurrent consumers
-- from both succeeding.
create or replace function public.claim_user_invitation(
  p_token text,
  p_email text,
  p_accepted_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invitation public.user_invitations%rowtype;
begin
  if nullif(trim(coalesce(p_token, '')), '') is null
     or nullif(trim(coalesce(p_email, '')), '') is null then
    return null;
  end if;

  update public.user_invitations i
     set status = 'processing',
         processing_at = timezone('utc', now()),
         accepted_user_id = p_accepted_user_id,
         accepted_at = null,
         updated_at = timezone('utc', now())
   where i.invitation_token = trim(p_token)
     and lower(trim(i.email)) = lower(trim(p_email))
     and i.status = 'pending'
     and lower(coalesce(i.role, 'user')) = 'user'
     and i.expires_at is not null
     and i.expires_at > timezone('utc', now())
  returning i.* into v_invitation;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_invitation.id,
    'email', lower(trim(v_invitation.email)),
    'full_name', v_invitation.full_name,
    'role', 'user',
    'plan', case
      when lower(trim(coalesce(v_invitation.plan, ''))) in (
        'free', 'founder', 'founder_lifetime', 'monthly', 'subscription'
      ) then lower(trim(v_invitation.plan))
      else 'free'
    end,
    'has_access', coalesce(v_invitation.has_access, false),
    'access_source', coalesce(nullif(trim(v_invitation.access_source), ''), 'manual_lifetime'),
    'is_lifetime', coalesce(v_invitation.is_lifetime, false),
    'invited_by', v_invitation.invited_by,
    'expires_at', v_invitation.expires_at
  );
end;
$$;

create or replace function public.finalize_user_invitation(
  p_invitation_id uuid,
  p_accepted_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated_count integer;
begin
  if p_invitation_id is null or p_accepted_user_id is null then
    return false;
  end if;

  update public.user_invitations
     set status = 'accepted',
         accepted_user_id = p_accepted_user_id,
         accepted_at = timezone('utc', now()),
         processing_at = null,
         updated_at = timezone('utc', now())
   where id = p_invitation_id
     and status = 'processing'
     and (accepted_user_id is null or accepted_user_id = p_accepted_user_id);

  get diagnostics v_updated_count = row_count;
  return v_updated_count = 1;
end;
$$;

-- A claim may be released only before it has been attached to an Auth user.
-- This permits retry after a transient createUser failure without making an
-- accepted invitation reusable.
create or replace function public.release_user_invitation_claim(
  p_invitation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated_count integer;
begin
  if p_invitation_id is null then
    return false;
  end if;

  update public.user_invitations
     set status = 'pending',
         processing_at = null,
         updated_at = timezone('utc', now())
   where id = p_invitation_id
     and status = 'processing'
     and accepted_user_id is null
     and accepted_at is null;

  get diagnostics v_updated_count = row_count;
  return v_updated_count = 1;
end;
$$;

revoke all on function public.claim_user_invitation(text, text, uuid) from public;
revoke all on function public.finalize_user_invitation(uuid, uuid) from public;
revoke all on function public.release_user_invitation_claim(uuid) from public;
revoke all on function public.claim_user_invitation(text, text, uuid) from anon, authenticated;
revoke all on function public.finalize_user_invitation(uuid, uuid) from anon, authenticated;
revoke all on function public.release_user_invitation_claim(uuid) from anon, authenticated;
grant execute on function public.claim_user_invitation(text, text, uuid) to service_role;
grant execute on function public.finalize_user_invitation(uuid, uuid) to service_role;
grant execute on function public.release_user_invitation_claim(uuid) to service_role;

-- Historical clients try these RPCs directly.  Keep compatible fail-closed
-- stubs so all privileged acceptance now goes through the server handler.
create or replace function public.apply_invitation_token(
  p_token text,
  p_email text
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'applied', false,
    'reason', 'server_authorization_required'
  );
$$;

create or replace function public.apply_pending_invitation()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'applied', false,
    'reason', 'invitation_token_required'
  );
$$;

revoke all on function public.apply_invitation_token(text, text) from public;
revoke all on function public.apply_pending_invitation() from public;
grant execute on function public.apply_invitation_token(text, text) to authenticated;
grant execute on function public.apply_pending_invitation() to authenticated;

commit;
