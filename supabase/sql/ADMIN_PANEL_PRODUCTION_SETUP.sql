-- CEO Rentable OS™
-- ADMIN PANEL + EMAILS (PRODUCCION)
-- Ejecutar completo en Supabase SQL Editor

create extension if not exists pgcrypto;

-- ============================================================
-- HELPERS DE SEGURIDAD
-- ============================================================

create or replace function public.is_current_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  return exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and lower(coalesce(u.role, 'user')) = 'admin'
  );
end;
$$;

revoke all on function public.is_current_admin() from public;
grant execute on function public.is_current_admin() to authenticated;

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
    role = coalesce(v_invitation.role, role, 'user'),
    plan = coalesce(v_invitation.plan, plan, 'free'),
    has_access = coalesce(v_invitation.has_access, has_access, true),
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
      'has_access', v_invitation.has_access
    ),
    timezone('utc', now())
  );

  return jsonb_build_object(
    'applied', true,
    'role', v_invitation.role,
    'plan', v_invitation.plan,
    'has_access', v_invitation.has_access
  );
end;
$$;

revoke all on function public.apply_pending_invitation() from public;
grant execute on function public.apply_pending_invitation() to authenticated;

-- ============================================================
-- TABLAS ADMIN / EMAIL
-- ============================================================

create table if not exists public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text,
  role text default 'user',
  plan text default 'free',
  has_access boolean default true,
  invited_by uuid,
  invitation_token text not null default encode(gen_random_bytes(24), 'hex'),
  invitation_link text,
  status text not null default 'pending',
  sent_count integer not null default 1,
  last_sent_at timestamptz default timezone('utc', now()),
  expires_at timestamptz default (timezone('utc', now()) + interval '7 days'),
  accepted_at timestamptz,
  accepted_user_id uuid,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

alter table public.user_invitations alter column email set not null;
alter table public.user_invitations add column if not exists full_name text;
alter table public.user_invitations add column if not exists role text default 'user';
alter table public.user_invitations add column if not exists plan text default 'free';
alter table public.user_invitations add column if not exists has_access boolean default true;
alter table public.user_invitations add column if not exists invited_by uuid;
alter table public.user_invitations add column if not exists invitation_token text default encode(gen_random_bytes(24), 'hex');
alter table public.user_invitations add column if not exists invitation_link text;
alter table public.user_invitations add column if not exists status text default 'pending';
alter table public.user_invitations add column if not exists sent_count integer default 1;
alter table public.user_invitations add column if not exists last_sent_at timestamptz default timezone('utc', now());
alter table public.user_invitations add column if not exists expires_at timestamptz default (timezone('utc', now()) + interval '7 days');
alter table public.user_invitations add column if not exists accepted_at timestamptz;
alter table public.user_invitations add column if not exists accepted_user_id uuid;
alter table public.user_invitations add column if not exists created_at timestamptz default timezone('utc', now());
alter table public.user_invitations add column if not exists updated_at timestamptz default timezone('utc', now());

create unique index if not exists user_invitations_email_unique on public.user_invitations (lower(email));
create unique index if not exists user_invitations_token_unique on public.user_invitations (invitation_token);
create index if not exists user_invitations_status_idx on public.user_invitations (status);

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  subject text not null,
  body text,
  html_body text,
  text_content text,
  html_content text,
  editor_json text,
  variables jsonb default '[]'::jsonb,
  is_active boolean default true,
  active boolean default true,
  created_by uuid,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

alter table public.email_templates add column if not exists body text;
alter table public.email_templates add column if not exists html_body text;
alter table public.email_templates add column if not exists text_content text;
alter table public.email_templates add column if not exists html_content text;
alter table public.email_templates add column if not exists editor_json text;
alter table public.email_templates add column if not exists variables jsonb default '[]'::jsonb;
alter table public.email_templates add column if not exists is_active boolean default true;
alter table public.email_templates add column if not exists active boolean default true;
alter table public.email_templates add column if not exists created_by uuid;
alter table public.email_templates add column if not exists created_at timestamptz default timezone('utc', now());
alter table public.email_templates add column if not exists updated_at timestamptz default timezone('utc', now());

create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid,
  template_id uuid,
  name text not null,
  description text,
  target_plan text,
  target_segment text,
  custom_variables jsonb default '{}'::jsonb,
  status text default 'draft',
  recipients_count integer default 0,
  sent_count integer default 0,
  failed_count integer default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

alter table public.email_campaigns add column if not exists admin_id uuid;
alter table public.email_campaigns add column if not exists template_id uuid;
alter table public.email_campaigns add column if not exists name text;
alter table public.email_campaigns add column if not exists description text;
alter table public.email_campaigns add column if not exists target_plan text;
alter table public.email_campaigns add column if not exists target_segment text;
alter table public.email_campaigns add column if not exists custom_variables jsonb default '{}'::jsonb;
alter table public.email_campaigns add column if not exists status text default 'draft';
alter table public.email_campaigns add column if not exists recipients_count integer default 0;
alter table public.email_campaigns add column if not exists sent_count integer default 0;
alter table public.email_campaigns add column if not exists failed_count integer default 0;
alter table public.email_campaigns add column if not exists started_at timestamptz;
alter table public.email_campaigns add column if not exists completed_at timestamptz;
alter table public.email_campaigns add column if not exists created_at timestamptz default timezone('utc', now());
alter table public.email_campaigns add column if not exists updated_at timestamptz default timezone('utc', now());

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  template_id uuid,
  campaign_id uuid,
  type text default 'other',
  to_email text,
  recipient_email text,
  recipient_name text,
  email text,
  name text,
  subject text,
  status text default 'pending',
  error_message text,
  provider_message_id text,
  metadata jsonb default '{}'::jsonb,
  sent_at timestamptz,
  timestamp timestamptz default timezone('utc', now()),
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

alter table public.email_logs add column if not exists user_id uuid;
alter table public.email_logs add column if not exists template_id uuid;
alter table public.email_logs add column if not exists campaign_id uuid;
alter table public.email_logs add column if not exists type text default 'other';
alter table public.email_logs add column if not exists to_email text;
alter table public.email_logs add column if not exists recipient_email text;
alter table public.email_logs add column if not exists recipient_name text;
alter table public.email_logs add column if not exists email text;
alter table public.email_logs add column if not exists name text;
alter table public.email_logs add column if not exists subject text;
alter table public.email_logs add column if not exists status text default 'pending';
alter table public.email_logs add column if not exists error_message text;
alter table public.email_logs add column if not exists provider_message_id text;
alter table public.email_logs add column if not exists metadata jsonb default '{}'::jsonb;
alter table public.email_logs add column if not exists sent_at timestamptz;
alter table public.email_logs add column if not exists timestamp timestamptz default timezone('utc', now());
alter table public.email_logs add column if not exists created_at timestamptz default timezone('utc', now());
alter table public.email_logs add column if not exists updated_at timestamptz default timezone('utc', now());

create index if not exists email_logs_status_idx on public.email_logs (status);
create index if not exists email_logs_timestamp_idx on public.email_logs (timestamp desc);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid,
  action text not null,
  target_user_id uuid,
  details jsonb default '{}'::jsonb,
  created_at timestamptz default timezone('utc', now())
);

alter table public.audit_logs add column if not exists admin_id uuid;
alter table public.audit_logs add column if not exists action text;
alter table public.audit_logs add column if not exists target_user_id uuid;
alter table public.audit_logs add column if not exists details jsonb default '{}'::jsonb;
alter table public.audit_logs add column if not exists created_at timestamptz default timezone('utc', now());

-- ============================================================
-- NORMALIZACION CAMPOS COMPATIBLES (ACTIVE/IS_ACTIVE, ETC.)
-- ============================================================

create or replace function public.normalize_email_template_fields()
returns trigger
language plpgsql
as $$
begin
  new.active := coalesce(new.active, new.is_active, true);
  new.is_active := coalesce(new.is_active, new.active, true);
  new.html_body := coalesce(new.html_body, new.html_content, '');
  new.html_content := coalesce(new.html_content, new.html_body, '');
  new.body := coalesce(new.body, new.text_content, '');
  new.text_content := coalesce(new.text_content, new.body, '');
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_email_templates_normalize on public.email_templates;
create trigger trg_email_templates_normalize
before insert or update on public.email_templates
for each row execute function public.normalize_email_template_fields();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_user_invitations_updated_at on public.user_invitations;
create trigger trg_user_invitations_updated_at
before update on public.user_invitations
for each row execute function public.touch_updated_at();

drop trigger if exists trg_email_campaigns_updated_at on public.email_campaigns;
create trigger trg_email_campaigns_updated_at
before update on public.email_campaigns
for each row execute function public.touch_updated_at();

drop trigger if exists trg_email_logs_updated_at on public.email_logs;
create trigger trg_email_logs_updated_at
before update on public.email_logs
for each row execute function public.touch_updated_at();

-- ============================================================
-- RLS
-- ============================================================

alter table public.users enable row level security;
drop policy if exists users_select_own_or_admin on public.users;
drop policy if exists users_insert_own_profile on public.users;
drop policy if exists users_update_own_or_admin on public.users;
drop policy if exists users_delete_admin_only on public.users;

create policy users_select_own_or_admin on public.users
for select
using (id = auth.uid() or public.is_current_admin());

create policy users_insert_own_profile on public.users
for insert
with check (id = auth.uid() or public.is_current_admin());

create policy users_update_own_or_admin on public.users
for update
using (id = auth.uid() or public.is_current_admin())
with check (id = auth.uid() or public.is_current_admin());

create policy users_delete_admin_only on public.users
for delete
using (public.is_current_admin());

alter table public.user_invitations enable row level security;
drop policy if exists user_invitations_admin_all on public.user_invitations;
create policy user_invitations_admin_all on public.user_invitations
for all
using (public.is_current_admin())
with check (public.is_current_admin());

alter table public.email_templates enable row level security;
drop policy if exists email_templates_admin_all on public.email_templates;
create policy email_templates_admin_all on public.email_templates
for all
using (public.is_current_admin())
with check (public.is_current_admin());

alter table public.email_campaigns enable row level security;
drop policy if exists email_campaigns_admin_all on public.email_campaigns;
create policy email_campaigns_admin_all on public.email_campaigns
for all
using (public.is_current_admin())
with check (public.is_current_admin());

alter table public.email_logs enable row level security;
drop policy if exists email_logs_admin_all on public.email_logs;
create policy email_logs_admin_all on public.email_logs
for all
using (public.is_current_admin())
with check (public.is_current_admin());

alter table public.audit_logs enable row level security;
drop policy if exists audit_logs_admin_all on public.audit_logs;
create policy audit_logs_admin_all on public.audit_logs
for all
using (public.is_current_admin())
with check (public.is_current_admin());

grant select, insert, update, delete on public.user_invitations to authenticated;
grant select, insert, update, delete on public.email_templates to authenticated;
grant select, insert, update, delete on public.email_campaigns to authenticated;
grant select, insert, update, delete on public.email_logs to authenticated;
grant select, insert, update, delete on public.audit_logs to authenticated;

-- ============================================================
-- TEMPLATES BASE
-- ============================================================

insert into public.email_templates (name, subject, body, html_body, variables, is_active, active)
values
  (
    'promo_especial',
    '🔥 Oferta especial — {{promo_title}}',
    'Hola {{name}}, hoy tienes {{promo_title}} por {{promo_price}}. {{promo_description}} Vence: {{expiry_date}}',
    '<p>Hola <strong>{{name}}</strong>,</p><p>Activa tu oferta: <strong>{{promo_title}}</strong> por <strong>{{promo_price}}</strong>.</p><p>{{promo_description}}</p><p>Válida hasta {{expiry_date}}.</p><p><a href="{{cta_url}}">{{cta_text}}</a></p>',
    '["name","promo_title","promo_price","promo_description","expiry_date","cta_text","cta_url"]'::jsonb,
    true,
    true
  ),
  (
    'newsletter_general',
    '{{subject_line}}',
    'Hola {{name}}, {{headline}}. {{body_text}}',
    '<p>Hola <strong>{{name}}</strong>,</p><h3>{{headline}}</h3><p>{{body_text}}</p><p><a href="{{cta_url}}">{{cta_text}}</a></p>',
    '["name","subject_line","headline","body_text","cta_text","cta_url"]'::jsonb,
    true,
    true
  ),
  (
    'reminder_onboarding',
    'Empieza en menos de 5 minutos ⏱️',
    'Hola {{name}}, activa tu cuenta y entra a tu panel: {{login_link}}',
    '<p>Hola <strong>{{name}}</strong>,</p><p>Tu cuenta está casi lista. Completa tu onboarding.</p><p><a href="{{login_link}}">Ir al Dashboard</a></p>',
    '["name","login_link"]'::jsonb,
    true,
    true
  ),
  (
    'payment_confirmed',
    'Pago confirmado — Tu acceso está listo 💳',
    'Hola {{name}}, recibimos tu pago por {{amount}}. Ya puedes usar todas las funciones.',
    '<p>Hola <strong>{{name}}</strong>,</p><p>Recibimos tu pago por <strong>{{amount}}</strong>. Tu acceso está activo.</p><p><a href="{{login_link}}">Entrar al sistema</a></p>',
    '["name","amount","login_link"]'::jsonb,
    true,
    true
  ),
  (
    'welcome_email',
    'Tu acceso a CEO Rentable OS™ ya está activo 🚀',
    'Bienvenida {{name}}. Tu acceso está activo. Dashboard, rentabilidad, facturación y más ya están disponibles.',
    '<p>Bienvenida <strong>{{name}}</strong>,</p><p>Tu acceso a CEO Rentable OS™ ya está activo.</p><ul><li>Dashboard financiero completo</li><li>Análisis de rentabilidad</li><li>Facturación y cotizaciones</li><li>Gestión de clientes e inventario</li></ul><p><a href="{{login_link}}">Ir al Dashboard</a></p>',
    '["name","login_link"]'::jsonb,
    true,
    true
  ),
  (
    'welcome',
    'Bienvenida a CEO Rentable OS™',
    'Hola {{name}}, tu acceso esta listo. Inicia sesion y comienza a usar CEO Rentable OS.',
    '<p>Hola <strong>{{name}}</strong>,</p><p>Tu acceso esta listo. Inicia sesion y comienza a usar CEO Rentable OS.</p>',
    '["name","email"]'::jsonb,
    true,
    true
  ),
  (
    'invitation-access',
    'Invitacion a CEO Rentable OS™',
    'Hola {{name}}, te invitamos a CEO Rentable OS. Entra aqui: {{invite_link}}',
    '<div style="font-family:Inter,Arial,sans-serif;background:#F7F3EE;padding:20px;color:#1f1f1f;"><div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #f0e6dd;border-radius:14px;overflow:hidden;"><div style="background:#fdf4f8;padding:20px;border-bottom:1px solid #f5d8e5;text-align:center;"><img src="https://app.ceorentable.com/brand/isotipo.png" alt="CEO Rentable OS" style="width:56px;height:56px;object-fit:contain;display:block;margin:0 auto 8px;" /><h2 style="margin:0;color:#D45387;font-size:18px;letter-spacing:0.04em;">CEO RENTABLE OS™</h2></div><div style="padding:22px;"><h3 style="margin:0 0 10px 0;font-size:32px;line-height:1.1;">Bienvenida, {{name}}! 🎉</h3><p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;">Ya tienes una invitación activa para entrar a <strong>CEO Rentable OS™</strong>.</p><div style="background:#fdf4f8;border-left:4px solid #D45387;border-radius:8px;padding:12px 14px;margin-bottom:18px;font-size:14px;">✅ Dashboard financiero completo<br/>✅ Análisis de rentabilidad<br/>✅ Facturación y cotizaciones<br/>✅ Gestión de clientes e inventario</div><a href="{{invite_link}}" style="display:inline-block;background:#D45387;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600;">Aceptar invitación →</a></div></div></div>',
    '["name","email","invite_link"]'::jsonb,
    true,
    true
  ),
  (
    'access-granted',
    'Tu acceso fue activado',
    'Hola {{name}}, ya tienes acceso activo en CEO Rentable OS.',
    '<p>Hola <strong>{{name}}</strong>,</p><p>Ya tienes acceso activo en CEO Rentable OS.</p>',
    '["name","email"]'::jsonb,
    true,
    true
  )
on conflict (name) do update
set
  subject = excluded.subject,
  body = excluded.body,
  html_body = excluded.html_body,
  variables = excluded.variables,
  is_active = true,
  active = true,
  updated_at = timezone('utc', now());
