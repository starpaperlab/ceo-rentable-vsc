-- CEO Rentable — bloqueo temporal de horarios públicos
begin;

create table if not exists public.booking_slot_holds (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  booking_page_id uuid not null references public.booking_pages(id) on delete cascade,
  booking_service_id uuid not null references public.booking_services(id) on delete cascade,
  booking_date date not null,
  booking_time time not null,
  duration_minutes integer not null check (duration_minutes between 5 and 480),
  hold_token uuid not null unique default gen_random_uuid(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_booking_slot_holds_active
  on public.booking_slot_holds(booking_page_id, booking_date, booking_time, expires_at);

alter table public.booking_slot_holds enable row level security;

create or replace function public.hold_public_booking_slot(
  p_slug text,
  p_service_id uuid,
  p_date date,
  p_time text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page public.booking_pages%rowtype;
  v_service public.booking_services%rowtype;
  v_time time := trim(p_time)::time;
  v_token uuid := gen_random_uuid();
begin
  select * into v_page
  from public.booking_pages
  where slug = lower(trim(p_slug)) and is_active = true
  limit 1;

  if not found then raise exception 'Página de reservas no disponible.'; end if;

  select * into v_service
  from public.booking_services
  where id = p_service_id
    and booking_page_id = v_page.id
    and is_active = true
  limit 1;

  if not found then raise exception 'Servicio no disponible.'; end if;

  perform pg_advisory_xact_lock(hashtext(v_page.id::text || ':' || p_date::text || ':' || p_time));

  delete from public.booking_slot_holds
  where expires_at <= now();

  if exists (
    select 1
    from public.appointments a
    where a.workspace_id = v_page.workspace_id
      and a.date = p_date
      and coalesce(a.status, 'programado') <> 'cancelado'
      and nullif(a.time, '') is not null
      and (nullif(a.time, '')::time) < (v_time + make_interval(mins => v_service.duration_minutes))::time
      and ((nullif(a.time, '')::time) + make_interval(mins => coalesce(a.duration_minutes, v_service.duration_minutes)))::time > v_time
  ) then
    raise exception 'Ese horario ya no está disponible.';
  end if;

  if exists (
    select 1
    from public.booking_slot_holds h
    where h.booking_page_id = v_page.id
      and h.booking_date = p_date
      and h.expires_at > now()
      and h.booking_time < (v_time + make_interval(mins => v_service.duration_minutes))::time
      and (h.booking_time + make_interval(mins => h.duration_minutes))::time > v_time
  ) then
    raise exception 'Ese horario acaba de ser seleccionado por otra persona.';
  end if;

  insert into public.booking_slot_holds (
    workspace_id, booking_page_id, booking_service_id,
    booking_date, booking_time, duration_minutes, hold_token, expires_at
  ) values (
    v_page.workspace_id, v_page.id, v_service.id,
    p_date, v_time, v_service.duration_minutes, v_token, now() + interval '7 minutes'
  );

  return v_token;
end;
$$;

create or replace function public.release_public_booking_hold(p_hold_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.booking_slot_holds where hold_token = p_hold_token;
  return found;
end;
$$;

create or replace function public.get_public_booking_slots(
  p_slug text,
  p_service_id uuid,
  p_date date
)
returns table(slot_time text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_page public.booking_pages%rowtype;
  v_service public.booking_services%rowtype;
  v_weekday integer;
begin
  select * into v_page
  from public.booking_pages
  where slug = lower(trim(p_slug)) and is_active = true;

  if not found then return; end if;

  select * into v_service
  from public.booking_services
  where id = p_service_id
    and booking_page_id = v_page.id
    and is_active = true;

  if not found then return; end if;

  if p_date < (now() at time zone v_page.timezone)::date
     or p_date > ((now() at time zone v_page.timezone)::date + v_page.max_days_ahead) then
    return;
  end if;

  v_weekday := extract(dow from p_date)::integer;

  return query
  with ranges as (
    select ba.start_time, ba.end_time
    from public.booking_availability ba
    where ba.booking_page_id = v_page.id
      and ba.weekday = v_weekday
      and ba.is_active = true
  ),
  slots as (
    select gs::time as candidate
    from ranges r
    cross join lateral generate_series(
      (p_date + r.start_time)::timestamp,
      (p_date + r.end_time - make_interval(mins => v_service.duration_minutes))::timestamp,
      make_interval(mins => v_service.duration_minutes)
    ) gs
  )
  select to_char(s.candidate, 'HH24:MI')
  from slots s
  where ((p_date + s.candidate)::timestamp at time zone v_page.timezone)
        >= now() + make_interval(hours => v_page.min_notice_hours)
    and not exists (
      select 1
      from public.appointments a
      where a.workspace_id = v_page.workspace_id
        and a.date = p_date
        and coalesce(a.status, 'programado') <> 'cancelado'
        and nullif(a.time, '') is not null
        and (nullif(a.time, '')::time) < (s.candidate + make_interval(mins => v_service.duration_minutes))::time
        and ((nullif(a.time, '')::time) + make_interval(mins => coalesce(a.duration_minutes, v_service.duration_minutes)))::time > s.candidate
    )
    and not exists (
      select 1
      from public.booking_slot_holds h
      where h.booking_page_id = v_page.id
        and h.booking_date = p_date
        and h.expires_at > now()
        and h.booking_time < (s.candidate + make_interval(mins => v_service.duration_minutes))::time
        and (h.booking_time + make_interval(mins => h.duration_minutes))::time > s.candidate
    )
  order by s.candidate;
end;
$$;

create or replace function public.create_public_booking(
  p_slug text,
  p_service_id uuid,
  p_date date,
  p_time text,
  p_client_name text,
  p_client_email text default null,
  p_client_phone text default null,
  p_notes text default null,
  p_hold_token uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page public.booking_pages%rowtype;
  v_service public.booking_services%rowtype;
  v_owner uuid;
  v_time text := trim(p_time);
  v_id uuid;
begin
  if length(trim(coalesce(p_client_name, ''))) < 2 then
    raise exception 'Nombre requerido.';
  end if;

  select * into v_page
  from public.booking_pages
  where slug = lower(trim(p_slug))
    and is_active = true
  limit 1;

  if v_page.id is null then raise exception 'Página de reservas no disponible.'; end if;

  select owner_user_id into v_owner
  from public.workspaces
  where id = v_page.workspace_id;

  select * into v_service
  from public.booking_services
  where id = p_service_id
    and booking_page_id = v_page.id
    and is_active = true;

  if not found then raise exception 'Servicio no disponible.'; end if;

  perform pg_advisory_xact_lock(hashtext(v_page.id::text || ':' || p_date::text || ':' || v_time));

  delete from public.booking_slot_holds where expires_at <= now();

  if p_hold_token is not null then
    if not exists (
      select 1 from public.booking_slot_holds h
      where h.hold_token = p_hold_token
        and h.booking_page_id = v_page.id
        and h.booking_service_id = v_service.id
        and h.booking_date = p_date
        and to_char(h.booking_time,'HH24:MI') = v_time
        and h.expires_at > now()
    ) then
      raise exception 'Tu selección expiró. Elige nuevamente el horario.';
    end if;
  end if;

  if exists (
    select 1
    from public.appointments a
    where a.workspace_id = v_page.workspace_id
      and a.date = p_date
      and coalesce(a.status, 'programado') <> 'cancelado'
      and nullif(a.time, '') is not null
      and (nullif(a.time, '')::time) < ((v_time::time) + make_interval(mins => v_service.duration_minutes))::time
      and ((nullif(a.time, '')::time) + make_interval(mins => coalesce(a.duration_minutes, v_service.duration_minutes)))::time > (v_time::time)
  ) then
    raise exception 'Ese horario ya no está disponible.';
  end if;

  insert into public.appointments (
    workspace_id,
    user_id,
    created_by,
    client_name,
    client_email,
    client_phone,
    service_type,
    date,
    time,
    price,
    status,
    notes,
    duration_minutes,
    booking_service_id,
    booking_page_id,
    booking_source
  ) values (
    v_page.workspace_id,
    v_owner,
    null,
    trim(p_client_name),
    nullif(trim(coalesce(p_client_email, '')), ''),
    nullif(trim(coalesce(p_client_phone, '')), ''),
    v_service.name,
    p_date,
    v_time,
    coalesce(v_service.price, 0),
    'confirmado',
    nullif(trim(coalesce(p_notes, '')), ''),
    v_service.duration_minutes,
    v_service.id,
    v_page.id,
    'public_booking'
  )
  returning id into v_id;

  if p_hold_token is not null then
    delete from public.booking_slot_holds where hold_token = p_hold_token;
  end if;

  return v_id;
end;
$$;

revoke all on function public.hold_public_booking_slot(text,uuid,date,text) from public;
revoke all on function public.release_public_booking_hold(uuid) from public;
grant execute on function public.hold_public_booking_slot(text,uuid,date,text) to anon, authenticated;
grant execute on function public.release_public_booking_hold(uuid) to anon, authenticated;

grant execute on function public.create_public_booking(text,uuid,date,text,text,text,text,text,uuid) to anon, authenticated;

commit;
