-- CEO Rentable — recordatorios automáticos de citas públicas
begin;

alter table public.appointments
  add column if not exists reminder_24h_sent_at timestamptz,
  add column if not exists reminder_2h_sent_at timestamptz,
  add column if not exists reminder_email_last_attempt_at timestamptz,
  add column if not exists reminder_email_error text;

create index if not exists idx_appointments_booking_reminders
  on public.appointments(booking_source, date, status)
  where booking_source = 'public_booking';

create or replace function public.get_due_public_booking_reminders(p_now timestamptz default now())
returns table(
  appointment_id uuid,
  reminder_kind text,
  workspace_id uuid,
  client_name text,
  client_email text,
  service_type text,
  appointment_date date,
  appointment_time text,
  duration_minutes integer,
  timezone text,
  business_name text,
  logo_url text,
  brand_primary_color text,
  appointment_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with candidates as (
    select
      a.id as appointment_id,
      a.workspace_id,
      a.client_name,
      a.client_email,
      a.service_type,
      a.date as appointment_date,
      a.time as appointment_time,
      coalesce(a.duration_minutes, 20) as duration_minutes,
      coalesce(bp.timezone, w.timezone, 'America/Santo_Domingo') as timezone,
      w.name as business_name,
      w.logo_url,
      coalesce(w.brand_primary_color, '#D45387') as brand_primary_color,
      ((a.date + nullif(a.time,'')::time) at time zone coalesce(bp.timezone, w.timezone, 'America/Santo_Domingo')) as appointment_at,
      a.reminder_24h_sent_at,
      a.reminder_2h_sent_at,
      a.reminder_email_last_attempt_at
    from public.appointments a
    join public.workspaces w on w.id = a.workspace_id
    left join public.booking_pages bp on bp.id = a.booking_page_id
    where a.booking_source = 'public_booking'
      and a.client_email is not null
      and trim(a.client_email) <> ''
      and nullif(a.time,'') is not null
      and coalesce(a.status, 'programado') not in ('cancelado','completado')
  )
  select
    c.appointment_id,
    case
      when c.appointment_at <= p_now + interval '2 hours'
           and c.reminder_2h_sent_at is null then '2h'
      when c.appointment_at <= p_now + interval '24 hours'
           and c.reminder_24h_sent_at is null then '24h'
      else null
    end as reminder_kind,
    c.workspace_id,
    c.client_name,
    c.client_email,
    c.service_type,
    c.appointment_date,
    c.appointment_time,
    c.duration_minutes,
    c.timezone,
    c.business_name,
    c.logo_url,
    c.brand_primary_color,
    c.appointment_at
  from candidates c
  where c.appointment_at > p_now
    and c.appointment_at <= p_now + interval '24 hours'
    and (
      (c.appointment_at <= p_now + interval '2 hours' and c.reminder_2h_sent_at is null)
      or
      (c.appointment_at > p_now + interval '2 hours' and c.reminder_24h_sent_at is null)
    )
    and (
      c.reminder_email_last_attempt_at is null
      or c.reminder_email_last_attempt_at <= p_now - interval '10 minutes'
    )
  order by c.appointment_at asc
  limit 100;
$$;

revoke all on function public.get_due_public_booking_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.get_due_public_booking_reminders(timestamptz) to service_role;

commit;
