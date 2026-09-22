-- CEO Rentable — Reservas públicas tipo Calendly (MVP)
-- Agenda interna + disponibilidad pública + enlace de reserva

begin;

create table if not exists public.booking_pages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  slug text not null unique,
  title text not null default 'Reserva una cita',
  description text,
  timezone text not null default 'America/Santo_Domingo',
  min_notice_hours integer not null default 2 check (min_notice_hours between 0 and 720),
  max_days_ahead integer not null default 60 check (max_days_ahead between 1 and 365),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_pages_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{2,79}$')
);

create table if not exists public.booking_services (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  booking_page_id uuid not null references public.booking_pages(id) on delete cascade,
  name text not null,
  description text,
  duration_minutes integer not null default 30 check (duration_minutes between 5 and 480),
  price numeric(12,2),
  is_active boolean not null default true,
  sort_order integer not null default 10,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.booking_availability (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  booking_page_id uuid not null references public.booking_pages(id) on delete cascade,
  weekday integer not null check (weekday between 0 and 6),
  start_time time not null default '09:00',
  end_time time not null default '17:00',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_page_id, weekday),
  constraint booking_availability_range check (end_time > start_time)
);

create index if not exists idx_booking_services_page on public.booking_services(booking_page_id, is_active, sort_order);
create index if not exists idx_booking_availability_page on public.booking_availability(booking_page_id, weekday, is_active);

alter table public.appointments add column if not exists client_email text;
alter table public.appointments add column if not exists duration_minutes integer;
alter table public.appointments add column if not exists booking_service_id uuid references public.booking_services(id) on delete set null;
alter table public.appointments add column if not exists booking_page_id uuid references public.booking_pages(id) on delete set null;
alter table public.appointments add column if not exists booking_source text;
create index if not exists idx_appointments_booking_slot on public.appointments(workspace_id, date, time);

alter table public.booking_pages enable row level security;
alter table public.booking_services enable row level security;
alter table public.booking_availability enable row level security;

drop policy if exists booking_pages_select on public.booking_pages;
create policy booking_pages_select on public.booking_pages for select to authenticated
using (public.workspace_has_module_access(workspace_id, 'agenda'));
drop policy if exists booking_pages_insert on public.booking_pages;
create policy booking_pages_insert on public.booking_pages for insert to authenticated
with check (public.workspace_can_write(workspace_id, 'agenda'));
drop policy if exists booking_pages_update on public.booking_pages;
create policy booking_pages_update on public.booking_pages for update to authenticated
using (public.workspace_can_write(workspace_id, 'agenda'))
with check (public.workspace_can_write(workspace_id, 'agenda'));
drop policy if exists booking_pages_delete on public.booking_pages;
create policy booking_pages_delete on public.booking_pages for delete to authenticated
using (public.workspace_can_write(workspace_id, 'agenda'));

drop policy if exists booking_services_select on public.booking_services;
create policy booking_services_select on public.booking_services for select to authenticated
using (public.workspace_has_module_access(workspace_id, 'agenda'));
drop policy if exists booking_services_insert on public.booking_services;
create policy booking_services_insert on public.booking_services for insert to authenticated
with check (public.workspace_can_write(workspace_id, 'agenda'));
drop policy if exists booking_services_update on public.booking_services;
create policy booking_services_update on public.booking_services for update to authenticated
using (public.workspace_can_write(workspace_id, 'agenda'))
with check (public.workspace_can_write(workspace_id, 'agenda'));
drop policy if exists booking_services_delete on public.booking_services;
create policy booking_services_delete on public.booking_services for delete to authenticated
using (public.workspace_can_write(workspace_id, 'agenda'));

drop policy if exists booking_availability_select on public.booking_availability;
create policy booking_availability_select on public.booking_availability for select to authenticated
using (public.workspace_has_module_access(workspace_id, 'agenda'));
drop policy if exists booking_availability_insert on public.booking_availability;
create policy booking_availability_insert on public.booking_availability for insert to authenticated
with check (public.workspace_can_write(workspace_id, 'agenda'));
drop policy if exists booking_availability_update on public.booking_availability;
create policy booking_availability_update on public.booking_availability for update to authenticated
using (public.workspace_can_write(workspace_id, 'agenda'))
with check (public.workspace_can_write(workspace_id, 'agenda'));
drop policy if exists booking_availability_delete on public.booking_availability;
create policy booking_availability_delete on public.booking_availability for delete to authenticated
using (public.workspace_can_write(workspace_id, 'agenda'));

create or replace function public.get_public_booking_page(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'page', jsonb_build_object(
      'id', bp.id,
      'slug', bp.slug,
      'title', bp.title,
      'description', bp.description,
      'timezone', bp.timezone,
      'min_notice_hours', bp.min_notice_hours,
      'max_days_ahead', bp.max_days_ahead,
      'business_name', w.name,
      'logo_url', w.logo_url,
      'brand_primary_color', coalesce(w.brand_primary_color, '#D45387')
    ),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', bs.id,
        'name', bs.name,
        'description', bs.description,
        'duration_minutes', bs.duration_minutes,
        'price', bs.price
      ) order by bs.sort_order, bs.created_at)
      from public.booking_services bs
      where bs.booking_page_id = bp.id and bs.is_active = true
    ), '[]'::jsonb),
    'availability', coalesce((
      select jsonb_agg(jsonb_build_object(
        'weekday', ba.weekday,
        'start_time', to_char(ba.start_time, 'HH24:MI'),
        'end_time', to_char(ba.end_time, 'HH24:MI')
      ) order by ba.weekday)
      from public.booking_availability ba
      where ba.booking_page_id = bp.id and ba.is_active = true
    ), '[]'::jsonb)
  )
  from public.booking_pages bp
  join public.workspaces w on w.id = bp.workspace_id
  where bp.slug = lower(trim(p_slug))
    and bp.is_active = true
  limit 1;
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
  p_notes text default null
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
  v_slot_exists boolean;
begin
  if length(trim(coalesce(p_client_name, ''))) < 2 then
    raise exception 'Nombre requerido.';
  end if;

  select bp.*
  into v_page
  from public.booking_pages bp
  where bp.slug = lower(trim(p_slug))
    and bp.is_active = true
  limit 1;

  if v_page.id is null then raise exception 'Página de reservas no disponible.'; end if;

  select w.owner_user_id
  into v_owner
  from public.workspaces w
  where w.id = v_page.workspace_id;

  select * into v_service
  from public.booking_services
  where id = p_service_id
    and booking_page_id = v_page.id
    and is_active = true;

  if not found then raise exception 'Servicio no disponible.'; end if;

  perform pg_advisory_xact_lock(hashtext(v_page.id::text || ':' || p_date::text || ':' || v_time));

  select exists (
    select 1
    from public.get_public_booking_slots(v_page.slug, v_service.id, p_date) s
    where s.slot_time = v_time
  ) into v_slot_exists;

  if not v_slot_exists then
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

  return v_id;
end;
$$;

revoke all on function public.get_public_booking_page(text) from public;
revoke all on function public.get_public_booking_slots(text,uuid,date) from public;
revoke all on function public.create_public_booking(text,uuid,date,text,text,text,text,text) from public;

grant execute on function public.get_public_booking_page(text) to anon, authenticated;
grant execute on function public.get_public_booking_slots(text,uuid,date) to anon, authenticated;
grant execute on function public.create_public_booking(text,uuid,date,text,text,text,text,text) to anon, authenticated;

commit;
