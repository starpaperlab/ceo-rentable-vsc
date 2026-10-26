begin;
-- New columns do not grant public read/update access to diagnostic results or preferences.
alter table public.leads add column if not exists capture_id uuid unique, add column if not exists diagnostic_answers jsonb, add column if not exists diagnostic_result jsonb,
 add column if not exists attribution jsonb not null default '{}'::jsonb, add column if not exists is_test boolean not null default false,
 add column if not exists diagnostic_email_requested boolean not null default false, add column if not exists promotional_consent boolean not null default false,
 add column if not exists unsubscribe_token uuid not null default gen_random_uuid(), add column if not exists journey_user_id uuid references auth.users(id), add column if not exists rate_key text;
create table if not exists public.ceo_commercial_events(
 event_id text primary key, lead_id uuid not null references public.leads(id),kind text not null check(kind in ('consent.updated','page.viewed','checkout.started','diagnostic.completed','registration.completed','trial.started','trial.ended','subscription.cancelled','subscription.paid','email.accepted','email.failed')),
 occurred_at timestamptz not null, data jsonb not null default '{}'::jsonb, is_test boolean not null,created_at timestamptz not null default now()
);
alter table public.ceo_commercial_events drop constraint if exists ceo_commercial_events_kind_check;
alter table public.ceo_commercial_events add constraint ceo_commercial_events_kind_check check(kind in ('consent.updated','page.viewed','checkout.started','diagnostic.completed','registration.completed','trial.started','trial.ended','subscription.cancelled','subscription.paid','email.accepted','email.failed'));
create table if not exists public.ceo_commercial_deliveries(
 id uuid primary key default gen_random_uuid(),event_id text not null references public.ceo_commercial_events(event_id),destination text not null check(destination in ('crm','diagnostic_email')),
 status text not null default 'pending' check(status in ('pending','leased','delivered','failed','skipped')),payload jsonb,provider_id text,
 available_at timestamptz not null default now(),lease_until timestamptz,lease_token uuid,attempts integer not null default 0,last_error_code text,
 created_at timestamptz not null default now(), unique(event_id,destination)
);
create table if not exists public.ceo_commercial_user_facts(event_id text primary key,user_id uuid not null references auth.users(id),kind text not null,occurred_at timestamptz not null,data jsonb not null,is_test boolean not null default false);
create table if not exists public.ceo_trial_sequence(
 lead_id uuid not null references public.leads(id),subscription_id text not null,day integer not null check(day in (0,2,4,7,9)),
 due_at timestamptz not null,status text not null default 'prepared' check(status in ('prepared','cancelled')),purpose text not null check(purpose in ('service','promotional')),
 template_key text not null default 'pending',primary key(subscription_id,day)
);
alter table public.ceo_trial_sequence add column if not exists template_key text not null default 'pending';
do $$declare t text;begin foreach t in array array['ceo_commercial_events','ceo_commercial_deliveries','ceo_trial_sequence','ceo_commercial_user_facts'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant all on public.%I to service_role',t);
 end loop;end$$;
create or replace function public.ceo_enqueue_event(p_lead uuid,p_event text,p_kind text,p_at timestamptz,p_data jsonb default '{}'::jsonb) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare l public.leads;begin
 select * into l from public.leads where id=p_lead and capture_id is not null for update;if l.id is null then raise exception 'Diagnostic required';end if;
 if exists(select 1 from public.ceo_commercial_events where event_id=p_event and (lead_id<>p_lead or kind<>p_kind or data<>p_data)) then raise exception 'Event identity conflict' using errcode='23505';end if;
 insert into public.ceo_commercial_events(event_id,lead_id,kind,occurred_at,data,is_test) values(p_event,p_lead,p_kind,p_at,p_data,l.is_test) on conflict do nothing;
 insert into public.ceo_commercial_deliveries(event_id,destination) values(p_event,'crm') on conflict do nothing;
end$$;
create or replace function public.ceo_capture_diagnostic(p_capture uuid,p_name text,p_email text,p_answers jsonb,p_result jsonb,p_attribution jsonb,p_promotional boolean,p_test boolean,p_rate_key text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare l public.leads;begin
 perform pg_advisory_xact_lock(hashtextextended('capture:'||p_capture,0));
 select * into l from public.leads where capture_id=p_capture;
 if l.id is not null then
  if l.email<>p_email or l.diagnostic_answers<>p_answers or l.is_test<>p_test then raise exception 'Capture identity conflict' using errcode='23505';end if;
  return jsonb_build_object('result',l.diagnostic_result,'email_status','queued');end if;
 perform pg_advisory_xact_lock(hashtextextended('ceo-public-capture-limit',0));
 perform pg_advisory_xact_lock(hashtextextended('capture-rate:'||p_rate_key,0));
 if (select count(*) from public.leads where capture_id is not null and created_at>now()-interval '1 hour' and rate_key=p_rate_key)>=10 or (select count(*) from public.leads where capture_id is not null and created_at>now()-interval '1 day' and lower(email)=lower(p_email))>=3 or (select count(*) from public.leads where capture_id is not null and created_at>now()-interval '1 hour')>=100 then raise exception 'CAPTURE_LIMIT';end if;
 insert into public.leads(name,email,source,status,capture_id,diagnostic_answers,diagnostic_result,attribution,is_test,diagnostic_email_requested,promotional_consent,rate_key,ceo_score,monthly_sales,knows_margin,controls_costs,knows_best_product)
 values(p_name,p_email,'diagnostico','new',p_capture,p_answers,p_result,p_attribution,p_test,true,p_promotional,p_rate_key,(p_result->>'score')::numeric,p_answers->>'monthly_sales',(p_answers->>'knows_margin')::boolean,(p_answers->>'controls_costs')::boolean,(p_answers->>'knows_best_product')::boolean) returning * into l;
 perform public.ceo_enqueue_event(l.id,'diagnostic:'||p_capture,'diagnostic.completed',l.created_at,jsonb_build_object('result',p_result,'form','ceo-diagnostico-v1'));
 insert into public.ceo_commercial_deliveries(event_id,destination) values('diagnostic:'||p_capture,'diagnostic_email');
 return jsonb_build_object('result',p_result,'email_status',case when p_test then 'prepared_test' else 'queued' end);
end$$;
create or replace function public.ceo_link_diagnostic_user(p_capture uuid,p_user uuid,p_email text) returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare l public.leads;f record;account_created timestamptz;begin
 select * into l from public.leads where capture_id=p_capture and lower(email)=lower(p_email) for update;
 if l.id is null or (l.journey_user_id is not null and l.journey_user_id<>p_user) then raise exception 'Owner mismatch' using errcode='42501';end if;
 if not exists(select 1 from auth.users where id=p_user and lower(email)=lower(p_email) and email_confirmed_at is not null) then raise exception 'Verified identity required' using errcode='42501';end if;
 update public.leads set journey_user_id=p_user where id=l.id;
 select created_at into account_created from auth.users where id=p_user;
 if account_created>=l.created_at then perform public.ceo_enqueue_event(l.id,'registration:'||p_capture,'registration.completed',account_created,jsonb_build_object('verified_email',true));end if;
 for f in select * from public.ceo_commercial_user_facts where user_id=p_user and occurred_at>=l.created_at and (not is_test or l.is_test) order by occurred_at loop perform public.ceo_record_commercial_event(p_user,f.event_id,f.kind,f.occurred_at,f.data);end loop;return true;
end$$;
create or replace function public.ceo_record_commercial_event(p_user uuid,p_event text,p_kind text,p_at timestamptz,p_data jsonb) returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare l public.leads;d integer;f public.ceo_commercial_user_facts;begin
 insert into public.ceo_commercial_user_facts(event_id,user_id,kind,occurred_at,data,is_test) values(p_event,p_user,p_kind,p_at,p_data,coalesce((p_data->>'is_test')::boolean,false)) on conflict do nothing;
 select * into f from public.ceo_commercial_user_facts where event_id=p_event;
 if f.user_id<>p_user or f.kind<>p_kind or f.data<>p_data then raise exception 'Event conflict' using errcode='23505';end if;
 if exists(select 1 from public.ceo_commercial_events where event_id=p_event) then return true;end if;
 select * into l from public.leads where journey_user_id=p_user and created_at<=f.occurred_at and capture_id is not null order by created_at desc limit 1 for update;if l.id is null or (f.is_test and not l.is_test) then return false;end if;
 -- Retries use the original provider event timestamp and payload.
 perform public.ceo_enqueue_event(l.id,p_event,p_kind,f.occurred_at,p_data);
 if p_kind='trial.started' then
  foreach d in array array[0,2,4,7,9] loop insert into public.ceo_trial_sequence(lead_id,subscription_id,day,due_at,purpose,template_key,status) values(l.id,p_data->>'subscription_id',d,f.occurred_at+make_interval(days=>d),case when d=0 then 'service' else 'promotional' end,'ceo_trial_day_'||d||'_v1',case when d=0 or l.promotional_consent then 'prepared' else 'cancelled' end) on conflict do nothing;end loop;
 elsif p_kind in ('subscription.paid','subscription.cancelled','trial.ended') then update public.ceo_trial_sequence set status='cancelled' where lead_id=l.id;end if;
 return true;
end$$;
create or replace function public.ceo_claim_delivery(p_destination text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare j public.ceo_commercial_deliveries;e public.ceo_commercial_events;l public.leads;begin
 update public.ceo_commercial_deliveries set status='failed',last_error_code='MAX_ATTEMPTS',lease_token=null,lease_until=null where status='leased' and attempts>=5 and lease_until<now();
 select * into j from public.ceo_commercial_deliveries where destination=p_destination and attempts<5 and available_at<=now() and (status='pending' or (status='leased' and lease_until<now())) order by created_at for update skip locked limit 1;if j.id is null then return null;end if;
 select * into e from public.ceo_commercial_events where event_id=j.event_id;select * into l from public.leads where id=e.lead_id;
 update public.ceo_commercial_deliveries set status='leased',lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes',attempts=attempts+1 where id=j.id returning * into j;
 return jsonb_build_object('job',to_jsonb(j),'event',to_jsonb(e),'lead',jsonb_build_object('capture_id',l.capture_id,'name',l.name,'email',l.email,'created_at',l.created_at,'diagnostic_answers',l.diagnostic_answers,'diagnostic_result',l.diagnostic_result,'attribution',l.attribution,'is_test',l.is_test,'unsubscribe_token',l.unsubscribe_token,'promotional_consent',l.promotional_consent));
end$$;
create or replace function public.ceo_finish_delivery(p_id uuid,p_token uuid,p_status text,p_error text default null,p_provider text default null,p_payload jsonb default null) returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare j public.ceo_commercial_deliveries;e public.ceo_commercial_events;begin
 if p_status not in ('delivered','failed','skipped') or (p_error is not null and p_error !~ '^[A-Z0-9_]{1,64}$') then raise exception 'Safe status required';end if;
 select * into j from public.ceo_commercial_deliveries where id=p_id and status='leased' and lease_token=p_token and lease_until>=now() for update;if j.id is null then return false;end if;
 update public.ceo_commercial_deliveries set status=case when p_status='failed' and attempts<5 then 'pending' else p_status end,available_at=now()+interval '5 minutes',lease_token=null,lease_until=null,last_error_code=p_error,provider_id=p_provider,payload=coalesce(payload,p_payload) where id=j.id;
 if j.destination='diagnostic_email' and p_status='delivered' then
  select * into e from public.ceo_commercial_events where event_id=j.event_id;
  perform public.ceo_enqueue_event(e.lead_id,'email:'||j.id,'email.accepted',now(),jsonb_build_object('provider','resend','provider_id',p_provider));
 end if;
 return true;
end$$;
create or replace function public.ceo_unsubscribe(p_token uuid) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare l public.leads;begin
 for l in update public.leads set promotional_consent=false where unsubscribe_token=p_token returning * loop perform public.ceo_enqueue_event(l.id,'unsubscribe:'||p_token,'consent.updated',now(),jsonb_build_object('promotional_consent',false));end loop;
 update public.ceo_trial_sequence set status='cancelled' where lead_id in(select id from public.leads where unsubscribe_token=p_token) and purpose='promotional';end$$;
do $$declare f record;begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname in ('ceo_enqueue_event','ceo_capture_diagnostic','ceo_link_diagnostic_user','ceo_record_commercial_event','ceo_claim_delivery','ceo_finish_delivery','ceo_unsubscribe') loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;end$$;
-- Keep legacy diagnostic inserts, but never let browser roles forge server identity or attribution.
do $$declare cols text;begin
 select string_agg(quote_ident(column_name),',') into cols from information_schema.columns where table_schema='public' and table_name='leads' and column_name not in ('capture_id','diagnostic_answers','diagnostic_result','attribution','is_test','diagnostic_email_requested','promotional_consent','unsubscribe_token','journey_user_id','rate_key');
 revoke insert,update on public.leads from public,anon,authenticated;
 revoke insert(capture_id,diagnostic_answers,diagnostic_result,attribution,is_test,diagnostic_email_requested,promotional_consent,unsubscribe_token,journey_user_id,rate_key),update(capture_id,diagnostic_answers,diagnostic_result,attribution,is_test,diagnostic_email_requested,promotional_consent,unsubscribe_token,journey_user_id,rate_key) on public.leads from public,anon,authenticated;
 execute 'grant insert('||cols||'),update('||cols||') on public.leads to anon,authenticated';
end$$;
create or replace function public.ceo_prepare_delivery(p_id uuid,p_token uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare result jsonb;begin update public.ceo_commercial_deliveries set payload=coalesce(payload,p_payload) where id=p_id and status='leased' and lease_token=p_token and lease_until>=now() returning payload into result;return result;end$$;
revoke all on function public.ceo_prepare_delivery(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ceo_prepare_delivery(uuid,uuid,jsonb) to service_role;
create or replace function public.ceo_record_visit(p_capture uuid,p_event uuid,p_kind text,p_route text) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare l public.leads;begin
 if p_kind not in ('page.viewed','checkout.started') or p_route not in ('/checkout','/diagnostico','/register','/login') then raise exception 'Visit only' using errcode='23514';end if;
 select * into l from public.leads where capture_id=p_capture for update;if l.id is null then return;end if;
 if exists(select 1 from public.ceo_commercial_events where event_id='visit:'||p_event) then return;end if;
 if (select count(*) from public.ceo_commercial_events where lead_id=l.id and kind in ('page.viewed','checkout.started') and occurred_at>now()-interval '1 hour')>=60 then return;end if;
 perform public.ceo_enqueue_event(l.id,'visit:'||p_event,p_kind,now(),jsonb_build_object('route',p_route,'evidence','browser_observed'));
end$$;
revoke all on function public.ceo_record_visit(uuid,uuid,text,text) from public,anon,authenticated;grant execute on function public.ceo_record_visit(uuid,uuid,text,text) to service_role;
notify pgrst,'reload schema';commit;
