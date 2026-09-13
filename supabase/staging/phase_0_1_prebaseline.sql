-- CEO Rentable OS(TM)
-- STAGING/TEST ONLY: production schema baseline immediately before Phase 0.1.
-- Generated from read-only PostgreSQL catalogs. Contains no production rows.
-- Do not run against production.
--
-- Authorized future target:
--   staging project ref: qaifenjzvhxydmhjgnfw
-- Explicitly forbidden target:
--   production project ref: szxcwkgenmlbajnkfluk

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

set local search_path = public, extensions, auth, pg_catalog;

-- Tables (columns, types, defaults and nullability).

create table public.users (
  id uuid default uuid_generate_v4() not null,
  email text,
  full_name text,
  created_at timestamp without time zone default now(),
  phone text,
  role text default 'user'::text,
  plan text default 'free'::text,
  has_access boolean default true,
  onboarding_completed boolean default true,
  currency text default 'USD'::text,
  timezone text default 'America/Santo_Domingo'::text,
  last_login_at timestamp with time zone,
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  access_source text default 'self_signup'::text,
  is_lifetime boolean default false,
  payment_provider text,
  provider_customer_id text,
  access_status text default 'pending_payment'::text not null
);

create table public.audit_logs (
  id uuid default gen_random_uuid() not null,
  admin_id uuid,
  action text not null,
  target_user_id uuid,
  details jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table public.brand_profiles (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  created_by text,
  name text not null,
  legal_name text,
  logo_url text,
  brand_color text default '#D94F8A'::text not null,
  font_family text default 'Inter'::text not null,
  fiscal_id text,
  address text,
  city_country text,
  contact_name text,
  contact_role text,
  contact_email text,
  contact_phone text,
  whatsapp text,
  instagram text,
  facebook text,
  tiktok text,
  linkedin text,
  website text,
  pdf_preferences jsonb default '{}'::jsonb not null,
  logo_settings jsonb default '{}'::jsonb not null,
  is_default boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.brand_profile_members (
  id uuid default gen_random_uuid() not null,
  brand_profile_id uuid not null,
  user_id uuid not null,
  role text default 'member'::text not null,
  created_by uuid,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.products (
  id uuid default uuid_generate_v4() not null,
  user_id uuid not null,
  name text,
  sale_price numeric,
  costo_unitario numeric,
  margin_pct numeric,
  created_at timestamp without time zone default now(),
  product_type text,
  status text,
  created_by text,
  current_stock numeric(12,2) default 0,
  min_stock_alert numeric(12,2) default 0,
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  brand_profile_id uuid
);

create table public.clients (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  created_by text,
  name text not null,
  email text,
  phone text,
  status text default 'new'::text,
  total_billed numeric(12,2) default 0,
  notes text,
  created_date timestamp with time zone default timezone('utc'::text, now()),
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  brand_profile_id uuid
);

create table public.monthly_records (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  created_by text,
  month text not null,
  income numeric(12,2) default 0,
  expenses numeric(12,2) default 0,
  profit numeric(12,2) default 0,
  margin_pct numeric(8,2) default 0,
  is_closed boolean default false,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  brand_profile_id uuid
);

create table public.appointments (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  created_by text,
  client_name text not null,
  client_phone text,
  service_type text not null,
  date date,
  "time" text,
  price numeric(12,2) default 0,
  status text default 'programado'::text,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

create table public.inventory_items (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  created_by text,
  product_name text,
  product_type text default 'fisico'::text,
  descripcion text,
  sku text,
  costo_unitario numeric(12,2) default 0,
  sale_price numeric(12,2) default 0,
  current_stock numeric(12,2) default 0,
  min_stock_alert numeric(12,2) default 0,
  unit text default 'unidad'::text,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  brand_profile_id uuid
);

create table public.inventory_movements (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  created_by text,
  inventory_item_id uuid,
  product_name text,
  invoice_number text,
  type text,
  quantity numeric(12,2) default 0,
  reason text,
  date date default CURRENT_DATE,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  brand_profile_id uuid
);

create table public.business_config (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  created_by text,
  business_name text,
  logo_url text,
  brand_color text default '#D94F8A'::text,
  font_family text default 'Inter'::text,
  fiscal_name text,
  fiscal_id text,
  fiscal_address text,
  currency text default 'USD'::text,
  quarterly_goal numeric(12,2) default 0,
  target_margin_pct numeric(8,2) default 40,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  logo_size text default 'medium'::text not null,
  logo_width numeric(8,2) default 24 not null,
  contact_name text,
  contact_title text,
  contact_email text,
  phone_primary text,
  phone_secondary text,
  address text,
  city_country text,
  instagram_url text,
  facebook_url text,
  tiktok_url text,
  linkedin_url text,
  website_url text,
  whatsapp_url text,
  logo_position text default 'left'::text not null,
  doc_show_socials boolean default true not null,
  doc_show_fiscal_id boolean default true not null,
  doc_show_address boolean default true not null,
  doc_show_contact boolean default true not null,
  doc_show_signature boolean default false not null
);

create table public.product_analysis (
  id uuid default uuid_generate_v4() not null,
  user_id uuid,
  name text,
  sale_price numeric,
  cost numeric,
  margin_pct numeric,
  product_type text,
  status text,
  created_at timestamp without time zone default now(),
  created_by text,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

create table public.invoices (
  id uuid default uuid_generate_v4() not null,
  user_id uuid not null,
  total_ingresos numeric,
  total_costos numeric,
  created_at timestamp without time zone default now(),
  created_by text,
  invoice_number text,
  date date default CURRENT_DATE,
  due_date date,
  client_id uuid,
  client_name text,
  client_email text,
  client_phone text,
  line_items jsonb default '[]'::jsonb,
  subtotal numeric(12,2) default 0,
  tax_enabled boolean default false,
  tax_pct numeric(5,2) default 0,
  tax_amount numeric(12,2) default 0,
  total_final numeric(12,2) default 0,
  status text default 'pending'::text,
  notes text,
  company_name text,
  logo_url text,
  brand_color text default '#D45387'::text,
  font_family text default 'Inter'::text,
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  additional_charges jsonb default '[]'::jsonb not null,
  additional_charges_total numeric(12,2) default 0 not null,
  subtotal_before_tax numeric(12,2) default 0 not null,
  logo_size text,
  logo_width numeric(8,2),
  fiscal_name text,
  fiscal_id text,
  fiscal_address text,
  contact_name text,
  contact_title text,
  contact_email text,
  phone_primary text,
  phone_secondary text,
  address text,
  city_country text,
  instagram_url text,
  facebook_url text,
  tiktok_url text,
  linkedin_url text,
  website_url text,
  whatsapp_url text,
  logo_position text,
  doc_show_socials boolean,
  doc_show_fiscal_id boolean,
  doc_show_address boolean,
  doc_show_contact boolean,
  doc_show_signature boolean,
  brand_profile_id uuid,
  branding_snapshot jsonb,
  visual_attachments jsonb default '[]'::jsonb not null,
  commercial_attachments_layout text default 'premium'::text not null,
  order_id uuid
);

create table public.orders (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  created_by text,
  order_number text not null,
  date date default CURRENT_DATE not null,
  client_id uuid not null,
  client_name text,
  client_email text,
  client_phone text,
  contact_channel text,
  delivery_method text,
  personalization text,
  bank_account text,
  subtotal numeric(12,2) default 0 not null,
  discount_amount numeric(12,2) default 0 not null,
  shipping_amount numeric(12,2) default 0 not null,
  total_final numeric(12,2) default 0 not null,
  operational_status text default 'draft'::text not null,
  generated_invoice_id uuid,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  theme text,
  custom_name text,
  custom_text text,
  requested_colors text,
  event_date date,
  client_instructions text,
  whatsapp_original_message text,
  internal_notes text,
  important_notes boolean default false not null,
  delivery_address text,
  shipping_carrier text,
  tracking_number text,
  estimated_delivery_date date,
  commitment_date date,
  logistics_notes text,
  brand_profile_id uuid
);

create table public.quotes (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  created_by text,
  quote_number text,
  date date default CURRENT_DATE,
  due_date date,
  client_id uuid,
  client_name text,
  client_email text,
  client_phone text,
  line_items jsonb default '[]'::jsonb,
  subtotal numeric(12,2) default 0,
  tax_enabled boolean default false,
  tax_pct numeric(5,2) default 0,
  tax_amount numeric(12,2) default 0,
  total_final numeric(12,2) default 0,
  status text default 'pending'::text,
  notes text,
  company_name text,
  logo_url text,
  brand_color text default '#D45387'::text,
  font_family text default 'Inter'::text,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  additional_charges jsonb default '[]'::jsonb not null,
  additional_charges_total numeric(12,2) default 0 not null,
  subtotal_before_tax numeric(12,2) default 0 not null,
  logo_size text,
  logo_width numeric(8,2),
  fiscal_name text,
  fiscal_id text,
  fiscal_address text,
  contact_name text,
  contact_title text,
  contact_email text,
  phone_primary text,
  phone_secondary text,
  address text,
  city_country text,
  instagram_url text,
  facebook_url text,
  tiktok_url text,
  linkedin_url text,
  website_url text,
  whatsapp_url text,
  logo_position text,
  doc_show_socials boolean,
  doc_show_fiscal_id boolean,
  doc_show_address boolean,
  doc_show_contact boolean,
  doc_show_signature boolean,
  brand_profile_id uuid,
  branding_snapshot jsonb,
  visual_attachments jsonb default '[]'::jsonb not null,
  commercial_attachments_layout text default 'premium'::text not null
);

create table public.user_invitations (
  id uuid default gen_random_uuid() not null,
  email text not null,
  full_name text,
  role text default 'user'::text,
  plan text default 'free'::text,
  has_access boolean default true,
  invited_by uuid,
  invitation_token text default encode(gen_random_bytes(24), 'hex'::text) not null,
  invitation_link text,
  status text default 'pending'::text not null,
  sent_count integer default 1 not null,
  last_sent_at timestamp with time zone default timezone('utc'::text, now()),
  expires_at timestamp with time zone default (timezone('utc'::text, now()) + '7 days'::interval),
  accepted_at timestamp with time zone,
  accepted_user_id uuid,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  access_source text default 'manual_lifetime'::text,
  is_lifetime boolean default true
);

-- Constraints (PK, UNIQUE, CHECK and FK).

alter table public.appointments add constraint appointments_pkey PRIMARY KEY (id);

alter table public.audit_logs add constraint audit_logs_pkey PRIMARY KEY (id);

alter table public.brand_profile_members add constraint brand_profile_members_brand_user_unique UNIQUE (brand_profile_id, user_id);

alter table public.brand_profile_members add constraint brand_profile_members_pkey PRIMARY KEY (id);

alter table public.brand_profile_members add constraint brand_profile_members_role_check CHECK (role = ANY (ARRAY['owner'::text, 'manager'::text, 'member'::text, 'viewer'::text]));

alter table public.brand_profiles add constraint brand_profiles_pkey PRIMARY KEY (id);

alter table public.business_config add constraint business_config_pkey PRIMARY KEY (id);

alter table public.clients add constraint clients_pkey PRIMARY KEY (id);

alter table public.inventory_items add constraint inventory_items_pkey PRIMARY KEY (id);

alter table public.inventory_movements add constraint inventory_movements_pkey PRIMARY KEY (id);

alter table public.invoices add constraint invoices_pkey PRIMARY KEY (id);

alter table public.invoices add constraint invoices_status_check CHECK (status = ANY (ARRAY['pending'::text, 'partial'::text, 'paid'::text, 'canceled'::text, 'overdue'::text]));

alter table public.monthly_records add constraint monthly_records_pkey PRIMARY KEY (id);

alter table public.orders add constraint orders_operational_status_check CHECK (operational_status = ANY (ARRAY['draft'::text, 'pending'::text, 'confirmed'::text, 'in_production'::text, 'ready_for_delivery'::text, 'delivered'::text, 'canceled'::text]));

alter table public.orders add constraint orders_pkey PRIMARY KEY (id);

alter table public.product_analysis add constraint product_analysis_pkey PRIMARY KEY (id);

alter table public.products add constraint products_pkey PRIMARY KEY (id);

alter table public.quotes add constraint quotes_pkey PRIMARY KEY (id);

alter table public.user_invitations add constraint user_invitations_access_source_check CHECK (access_source = ANY (ARRAY['manual_lifetime'::text, 'manual_payment'::text, 'stripe_purchase'::text, 'self_signup'::text]));

alter table public.user_invitations add constraint user_invitations_pkey PRIMARY KEY (id);

alter table public.users add constraint users_access_source_check CHECK (access_source IS NULL OR (access_source = ANY (ARRAY['self_signup'::text, 'manual_lifetime'::text, 'stripe_purchase'::text, 'manual_payment'::text, 'paypal'::text, 'paypal_payment'::text, 'paypal_subscription'::text, 'admin'::text, 'legacy'::text])));

alter table public.users add constraint users_access_status_check CHECK (access_status = ANY (ARRAY['active'::text, 'pending_payment'::text, 'blocked'::text, 'cancelled'::text]));

alter table public.users add constraint users_email_key UNIQUE (email);

alter table public.users add constraint users_pkey PRIMARY KEY (id);

alter table public.users add constraint users_plan_check CHECK (plan = ANY (ARRAY['free'::text, 'founder'::text, 'subscription'::text, 'founder_lifetime'::text, 'monthly'::text, 'admin'::text]));

alter table public.brand_profile_members add constraint brand_profile_members_brand_profile_id_fkey FOREIGN KEY (brand_profile_id) REFERENCES brand_profiles(id) ON DELETE CASCADE;

alter table public.brand_profile_members add constraint brand_profile_members_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

alter table public.brand_profile_members add constraint brand_profile_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

alter table public.brand_profiles add constraint brand_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

alter table public.clients add constraint clients_brand_profile_id_fkey FOREIGN KEY (brand_profile_id) REFERENCES brand_profiles(id) ON DELETE SET NULL;

alter table public.inventory_items add constraint inventory_items_brand_profile_id_fkey FOREIGN KEY (brand_profile_id) REFERENCES brand_profiles(id) ON DELETE SET NULL;

alter table public.inventory_movements add constraint inventory_movements_brand_profile_id_fkey FOREIGN KEY (brand_profile_id) REFERENCES brand_profiles(id) ON DELETE SET NULL;

alter table public.invoices add constraint invoices_brand_profile_id_fkey FOREIGN KEY (brand_profile_id) REFERENCES brand_profiles(id) ON DELETE SET NULL;

alter table public.invoices add constraint invoices_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;

alter table public.monthly_records add constraint monthly_records_brand_profile_id_fkey FOREIGN KEY (brand_profile_id) REFERENCES brand_profiles(id) ON DELETE SET NULL;

alter table public.orders add constraint orders_brand_profile_id_fkey FOREIGN KEY (brand_profile_id) REFERENCES brand_profiles(id) ON DELETE SET NULL;

alter table public.orders add constraint orders_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT;

alter table public.orders add constraint orders_generated_invoice_id_fkey FOREIGN KEY (generated_invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;

alter table public.orders add constraint orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

alter table public.products add constraint products_brand_profile_id_fkey FOREIGN KEY (brand_profile_id) REFERENCES brand_profiles(id) ON DELETE SET NULL;

alter table public.quotes add constraint quotes_brand_profile_id_fkey FOREIGN KEY (brand_profile_id) REFERENCES brand_profiles(id) ON DELETE SET NULL;

-- Standalone indexes. Constraint-backed indexes are created by constraints.

CREATE INDEX idx_appointments_created_by ON public.appointments USING btree (created_by);

CREATE INDEX idx_appointments_created_by_isolation ON public.appointments USING btree (created_by);

CREATE INDEX idx_appointments_user_id ON public.appointments USING btree (user_id);

CREATE INDEX idx_appointments_user_id_hardened ON public.appointments USING btree (user_id);

CREATE INDEX idx_appointments_user_id_isolation ON public.appointments USING btree (user_id);

CREATE INDEX idx_brand_profile_members_brand_id ON public.brand_profile_members USING btree (brand_profile_id);

CREATE INDEX idx_brand_profile_members_user_id ON public.brand_profile_members USING btree (user_id);

CREATE UNIQUE INDEX idx_brand_profiles_default_per_user ON public.brand_profiles USING btree (user_id) WHERE (is_default = true);

CREATE INDEX idx_brand_profiles_user_id ON public.brand_profiles USING btree (user_id);

CREATE INDEX idx_business_config_created_by ON public.business_config USING btree (created_by);

CREATE INDEX idx_business_config_created_by_isolation ON public.business_config USING btree (created_by);

CREATE INDEX idx_business_config_user_id ON public.business_config USING btree (user_id);

CREATE INDEX idx_business_config_user_id_hardened ON public.business_config USING btree (user_id);

CREATE INDEX idx_business_config_user_id_isolation ON public.business_config USING btree (user_id);

CREATE UNIQUE INDEX idx_business_config_user_unique ON public.business_config USING btree (user_id) WHERE (user_id IS NOT NULL);

CREATE INDEX idx_clients_brand_profile_id ON public.clients USING btree (brand_profile_id);

CREATE INDEX idx_clients_created_by ON public.clients USING btree (created_by);

CREATE INDEX idx_clients_created_by_isolation ON public.clients USING btree (created_by);

CREATE INDEX idx_clients_user_id ON public.clients USING btree (user_id);

CREATE INDEX idx_clients_user_id_hardened ON public.clients USING btree (user_id);

CREATE INDEX idx_clients_user_id_isolation ON public.clients USING btree (user_id);

CREATE INDEX idx_inventory_items_brand_profile_id ON public.inventory_items USING btree (brand_profile_id);

CREATE INDEX idx_inventory_items_created_by ON public.inventory_items USING btree (created_by);

CREATE INDEX idx_inventory_items_created_by_isolation ON public.inventory_items USING btree (created_by);

CREATE INDEX idx_inventory_items_user_id ON public.inventory_items USING btree (user_id);

CREATE INDEX idx_inventory_items_user_id_hardened ON public.inventory_items USING btree (user_id);

CREATE INDEX idx_inventory_items_user_id_isolation ON public.inventory_items USING btree (user_id);

CREATE INDEX idx_inventory_movements_brand_profile_id ON public.inventory_movements USING btree (brand_profile_id);

CREATE INDEX idx_inventory_movements_created_by ON public.inventory_movements USING btree (created_by);

CREATE INDEX idx_inventory_movements_created_by_isolation ON public.inventory_movements USING btree (created_by);

CREATE INDEX idx_inventory_movements_user_id ON public.inventory_movements USING btree (user_id);

CREATE INDEX idx_inventory_movements_user_id_hardened ON public.inventory_movements USING btree (user_id);

CREATE INDEX idx_inventory_movements_user_id_isolation ON public.inventory_movements USING btree (user_id);

CREATE INDEX idx_invoices_brand_profile_id ON public.invoices USING btree (brand_profile_id);

CREATE INDEX idx_invoices_created_by ON public.invoices USING btree (created_by);

CREATE INDEX idx_invoices_created_by_isolation ON public.invoices USING btree (created_by);

CREATE INDEX idx_invoices_order_id ON public.invoices USING btree (order_id);

CREATE INDEX idx_invoices_user_id ON public.invoices USING btree (user_id);

CREATE INDEX idx_invoices_user_id_hardened ON public.invoices USING btree (user_id);

CREATE INDEX idx_invoices_user_id_isolation ON public.invoices USING btree (user_id);

CREATE UNIQUE INDEX idx_invoices_user_number ON public.invoices USING btree (user_id, invoice_number);

CREATE INDEX idx_monthly_records_brand_profile_id ON public.monthly_records USING btree (brand_profile_id);

CREATE INDEX idx_monthly_records_created_by ON public.monthly_records USING btree (created_by);

CREATE INDEX idx_monthly_records_created_by_isolation ON public.monthly_records USING btree (created_by);

CREATE INDEX idx_monthly_records_user_id ON public.monthly_records USING btree (user_id);

CREATE INDEX idx_monthly_records_user_id_hardened ON public.monthly_records USING btree (user_id);

CREATE INDEX idx_monthly_records_user_id_isolation ON public.monthly_records USING btree (user_id);

CREATE UNIQUE INDEX idx_monthly_records_user_month ON public.monthly_records USING btree (user_id, month);

CREATE INDEX idx_orders_brand_profile_id ON public.orders USING btree (brand_profile_id);

CREATE INDEX idx_orders_client_id ON public.orders USING btree (client_id);

CREATE INDEX idx_orders_commitment_date ON public.orders USING btree (commitment_date);

CREATE INDEX idx_orders_estimated_delivery_date ON public.orders USING btree (estimated_delivery_date);

CREATE INDEX idx_orders_generated_invoice_id ON public.orders USING btree (generated_invoice_id);

CREATE INDEX idx_orders_user_id ON public.orders USING btree (user_id);

CREATE UNIQUE INDEX idx_orders_user_number ON public.orders USING btree (user_id, order_number);

CREATE INDEX idx_product_analysis_created_by ON public.product_analysis USING btree (created_by);

CREATE INDEX idx_product_analysis_created_by_isolation ON public.product_analysis USING btree (created_by);

CREATE INDEX idx_product_analysis_user_id ON public.product_analysis USING btree (user_id);

CREATE INDEX idx_product_analysis_user_id_hardened ON public.product_analysis USING btree (user_id);

CREATE INDEX idx_product_analysis_user_id_isolation ON public.product_analysis USING btree (user_id);

CREATE INDEX idx_products_brand_profile_id ON public.products USING btree (brand_profile_id);

CREATE INDEX idx_products_created_by ON public.products USING btree (created_by);

CREATE INDEX idx_products_created_by_isolation ON public.products USING btree (created_by);

CREATE INDEX idx_products_user_id ON public.products USING btree (user_id);

CREATE INDEX idx_products_user_id_hardened ON public.products USING btree (user_id);

CREATE INDEX idx_products_user_id_isolation ON public.products USING btree (user_id);

CREATE INDEX idx_quotes_brand_profile_id ON public.quotes USING btree (brand_profile_id);

CREATE INDEX idx_quotes_created_by ON public.quotes USING btree (created_by);

CREATE INDEX idx_quotes_created_by_isolation ON public.quotes USING btree (created_by);

CREATE INDEX idx_quotes_user_id ON public.quotes USING btree (user_id);

CREATE INDEX idx_quotes_user_id_hardened ON public.quotes USING btree (user_id);

CREATE INDEX idx_quotes_user_id_isolation ON public.quotes USING btree (user_id);

CREATE UNIQUE INDEX idx_quotes_user_number ON public.quotes USING btree (user_id, quote_number);

CREATE UNIQUE INDEX user_invitations_email_unique ON public.user_invitations USING btree (lower(email));

CREATE INDEX user_invitations_status_idx ON public.user_invitations USING btree (status);

CREATE UNIQUE INDEX user_invitations_token_unique ON public.user_invitations USING btree (invitation_token);

CREATE INDEX idx_users_access_status ON public.users USING btree (access_status);

CREATE INDEX idx_users_has_access ON public.users USING btree (has_access);

CREATE INDEX idx_users_payment_provider ON public.users USING btree (payment_provider);

CREATE INDEX idx_users_paypal_current_plan ON public.users USING btree (plan, payment_provider, has_access) WHERE (payment_provider = 'paypal'::text);

CREATE INDEX idx_users_plan ON public.users USING btree (plan);

CREATE INDEX idx_users_role ON public.users USING btree (role);

-- Pre-Phase 0.1 functions. DML below exists only inside function bodies and
-- is not executed while this baseline is applied.

CREATE OR REPLACE FUNCTION public.is_admin(target_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(
    select 1
      from public.users
     where id = target_user_id
       and role = 'admin'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_current_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_owned_record_metadata()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.user_id is null then
    new.user_id = auth.uid();
  end if;

  if new.created_by is null and new.user_id is not null then
    select email
      into new.created_by
      from public.users
     where id = new.user_id;
  end if;

  if new.created_at is null then
    new.created_at = timezone('utc', now());
  end if;

  new.updated_at = timezone('utc', now());
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_user_access_segmentation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.role := lower(coalesce(new.role, 'user'));
  new.plan := lower(coalesce(new.plan, 'free'));
  new.access_source := lower(coalesce(new.access_source, 'self_signup'));

  if new.role = 'admin' then
    new.plan := 'admin';
    new.has_access := true;
    new.access_source := 'admin';
    new.is_lifetime := true;
    return new;
  end if;

  if new.access_source = 'manual_lifetime' then
    new.role := 'user';
    new.plan := 'founder';
    new.has_access := true;
    new.is_lifetime := true;
    return new;
  end if;

  if new.access_source in ('stripe_purchase', 'manual_payment') then
    new.role := 'user';
    new.plan := 'subscription';
    new.is_lifetime := false;
    return new;
  end if;

  if new.access_source = 'self_signup' and coalesce(new.has_access, false) = false then
    new.role := 'user';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_user_profile_defaults()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.users (
    id,
    email,
    full_name,
    phone,
    role,
    plan,
    has_access,
    onboarding_completed,
    currency,
    timezone,
    created_at,
    updated_at
  )
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'phone',
    case
      when new.raw_user_meta_data ->> 'role' = 'admin' then 'admin'
      else 'user'
    end,
    case
      when new.raw_user_meta_data ->> 'role' = 'admin' then 'admin'
      when new.raw_user_meta_data ->> 'plan' in ('founder', 'subscription') then new.raw_user_meta_data ->> 'plan'
      else 'free'
    end,
    case
      when new.raw_user_meta_data ->> 'role' = 'admin' then true
      else coalesce((new.raw_user_meta_data ->> 'has_access')::boolean, false)
    end,
    coalesce((new.raw_user_meta_data ->> 'onboarding_completed')::boolean, false),
    coalesce(new.raw_user_meta_data ->> 'currency', 'USD'),
    coalesce(new.raw_user_meta_data ->> 'timezone', 'America/Santo_Domingo'),
    timezone('utc', now()),
    timezone('utc', now())
  )
  on conflict (id) do update
     set email = excluded.email,
         full_name = coalesce(public.users.full_name, excluded.full_name),
         phone = coalesce(public.users.phone, excluded.phone),
         updated_at = timezone('utc', now());

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_pending_invitation()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    role = case
      when coalesce(v_invitation.access_source, 'manual_lifetime') = 'manual_lifetime' then 'user'
      else coalesce(v_invitation.role, role, 'user')
    end,
    plan = case
      when coalesce(v_invitation.access_source, 'manual_lifetime') = 'manual_lifetime' then 'founder'
      when coalesce(v_invitation.access_source, '') in ('stripe_purchase', 'manual_payment') then 'subscription'
      else coalesce(v_invitation.plan, plan, 'free')
    end,
    has_access = coalesce(v_invitation.has_access, has_access, true),
    access_source = coalesce(v_invitation.access_source, access_source, 'manual_lifetime'),
    is_lifetime = coalesce(v_invitation.is_lifetime, is_lifetime, true),
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
      'access_source', v_invitation.access_source,
      'is_lifetime', v_invitation.is_lifetime,
      'has_access', v_invitation.has_access
    ),
    timezone('utc', now())
  );

  return jsonb_build_object(
    'applied', true,
    'role', v_invitation.role,
    'plan', v_invitation.plan,
    'access_source', v_invitation.access_source,
    'is_lifetime', v_invitation.is_lifetime,
    'has_access', v_invitation.has_access
  );
end;
$function$
;

-- Function privileges present before Phase 0.1.

grant execute on function public.apply_pending_invitation() to public;

grant execute on function public.enforce_user_access_segmentation() to public;

grant execute on function public.handle_new_auth_user() to public;

grant execute on function public.handle_user_profile_defaults() to public;

grant execute on function public.is_admin(uuid) to public;

grant execute on function public.is_current_admin() to public;

grant execute on function public.set_updated_at() to public;

grant execute on function public.sync_owned_record_metadata() to public;

grant execute on function public.touch_updated_at() to public;

-- Row-level security state.

alter table public.appointments enable row level security;

alter table public.audit_logs enable row level security;

alter table public.brand_profile_members enable row level security;

alter table public.brand_profiles enable row level security;

alter table public.business_config enable row level security;

alter table public.clients enable row level security;

alter table public.inventory_items enable row level security;

alter table public.inventory_movements enable row level security;

alter table public.invoices enable row level security;

alter table public.monthly_records enable row level security;

alter table public.orders enable row level security;

alter table public.product_analysis enable row level security;

alter table public.products enable row level security;

alter table public.quotes enable row level security;

alter table public.user_invitations enable row level security;

alter table public.users enable row level security;

-- Pre-Phase 0.1 policies.

create policy appointments_owner_delete on public.appointments as permissive for delete to public
  using (((user_id = auth.uid()) OR is_admin()));

create policy appointments_owner_insert on public.appointments as permissive for insert to public
  with check (((user_id = auth.uid()) OR is_admin()));

create policy appointments_owner_select on public.appointments as permissive for select to public
  using (((user_id = auth.uid()) OR is_admin()));

create policy appointments_owner_update on public.appointments as permissive for update to public
  using (((user_id = auth.uid()) OR is_admin()))
  with check (((user_id = auth.uid()) OR is_admin()));

create policy audit_logs_admin_all on public.audit_logs as permissive for all to public
  using (is_current_admin())
  with check (is_current_admin());

create policy audit_logs_admin_delete on public.audit_logs as permissive for delete to public
  using (is_admin());

create policy audit_logs_admin_insert on public.audit_logs as permissive for insert to public
  with check (((admin_id = auth.uid()) OR is_admin()));

create policy audit_logs_admin_select on public.audit_logs as permissive for select to public
  using (((admin_id = auth.uid()) OR is_admin()));

create policy brand_profile_members_delete_admin on public.brand_profile_members as permissive for delete to public
  using (is_admin());

create policy brand_profile_members_insert_admin on public.brand_profile_members as permissive for insert to public
  with check (is_admin());

create policy brand_profile_members_select on public.brand_profile_members as permissive for select to public
  using (((user_id = auth.uid()) OR is_admin()));

create policy brand_profile_members_update_admin on public.brand_profile_members as permissive for update to public
  using (is_admin())
  with check (is_admin());

create policy "Admins can delete own brand profiles" on public.brand_profiles as permissive for delete to public
  using ((is_admin(auth.uid()) AND (user_id = auth.uid())));

create policy "Admins can insert own brand profiles" on public.brand_profiles as permissive for insert to public
  with check ((is_admin(auth.uid()) AND (user_id = auth.uid())));

create policy "Admins can update own brand profiles" on public.brand_profiles as permissive for update to public
  using ((is_admin(auth.uid()) AND (user_id = auth.uid())))
  with check ((is_admin(auth.uid()) AND (user_id = auth.uid())));

create policy "Admins can view own brand profiles" on public.brand_profiles as permissive for select to public
  using ((is_admin(auth.uid()) AND (user_id = auth.uid())));

create policy "Assigned users can view brand profiles" on public.brand_profiles as permissive for select to public
  using ((EXISTS ( SELECT 1
   FROM brand_profile_members bpm
  WHERE ((bpm.brand_profile_id = brand_profiles.id) AND (bpm.user_id = auth.uid())))));

create policy business_config_owner_delete on public.business_config as permissive for delete to public
  using (((user_id = auth.uid()) OR is_admin()));

create policy business_config_owner_insert on public.business_config as permissive for insert to public
  with check (((user_id = auth.uid()) OR is_admin()));

create policy business_config_owner_select on public.business_config as permissive for select to public
  using (((user_id = auth.uid()) OR is_admin()));

create policy business_config_owner_update on public.business_config as permissive for update to public
  using (((user_id = auth.uid()) OR is_admin()))
  with check (((user_id = auth.uid()) OR is_admin()));

create policy clients_owner_delete on public.clients as permissive for delete to public
  using (((user_id = auth.uid()) OR is_admin()));

create policy clients_owner_insert on public.clients as permissive for insert to public
  with check (((user_id = auth.uid()) OR is_admin()));

create policy clients_owner_select on public.clients as permissive for select to public
  using (((user_id = auth.uid()) OR is_admin()));

create policy clients_owner_update on public.clients as permissive for update to public
  using (((user_id = auth.uid()) OR is_admin()))
  with check (((user_id = auth.uid()) OR is_admin()));

create policy inventory_items_owner_delete on public.inventory_items as permissive for delete to public
  using (((user_id = auth.uid()) OR is_admin()));

create policy inventory_items_owner_insert on public.inventory_items as permissive for insert to public
  with check (((user_id = auth.uid()) OR is_admin()));

create policy inventory_items_owner_select on public.inventory_items as permissive for select to public
  using (((user_id = auth.uid()) OR is_admin()));

create policy inventory_items_owner_update on public.inventory_items as permissive for update to public
  using (((user_id = auth.uid()) OR is_admin()))
  with check (((user_id = auth.uid()) OR is_admin()));

create policy inventory_movements_owner_delete on public.inventory_movements as permissive for delete to public
  using (((user_id = auth.uid()) OR is_admin()));

create policy inventory_movements_owner_insert on public.inventory_movements as permissive for insert to public
  with check (((user_id = auth.uid()) OR is_admin()));

create policy inventory_movements_owner_select on public.inventory_movements as permissive for select to public
  using (((user_id = auth.uid()) OR is_admin()));

create policy inventory_movements_owner_update on public.inventory_movements as permissive for update to public
  using (((user_id = auth.uid()) OR is_admin()))
  with check (((user_id = auth.uid()) OR is_admin()));

create policy "Users can insert their invoices" on public.invoices as permissive for insert to public
  with check ((auth.uid() = user_id));

create policy "Users can see their invoices" on public.invoices as permissive for select to public
  using ((auth.uid() = user_id));

create policy invoices_owner_delete on public.invoices as permissive for delete to public
  using (((user_id = auth.uid()) OR is_admin()));

create policy invoices_owner_insert on public.invoices as permissive for insert to public
  with check (((user_id = auth.uid()) OR is_admin()));

create policy invoices_owner_select on public.invoices as permissive for select to public
  using (((user_id = auth.uid()) OR is_admin()));

create policy invoices_owner_update on public.invoices as permissive for update to public
  using (((user_id = auth.uid()) OR is_admin()))
  with check (((user_id = auth.uid()) OR is_admin()));

create policy monthly_records_owner_delete on public.monthly_records as permissive for delete to public
  using (((user_id = auth.uid()) OR is_admin()));

create policy monthly_records_owner_insert on public.monthly_records as permissive for insert to public
  with check (((user_id = auth.uid()) OR is_admin()));

create policy monthly_records_owner_select on public.monthly_records as permissive for select to public
  using (((user_id = auth.uid()) OR is_admin()));

create policy monthly_records_owner_update on public.monthly_records as permissive for update to public
  using (((user_id = auth.uid()) OR is_admin()))
  with check (((user_id = auth.uid()) OR is_admin()));

create policy orders_owner_delete on public.orders as permissive for delete to public
  using (((user_id = auth.uid()) OR is_admin()));

create policy orders_owner_insert on public.orders as permissive for insert to public
  with check (((user_id = auth.uid()) OR is_admin()));

create policy orders_owner_select on public.orders as permissive for select to public
  using (((user_id = auth.uid()) OR is_admin()));

create policy orders_owner_update on public.orders as permissive for update to public
  using (((user_id = auth.uid()) OR is_admin()))
  with check (((user_id = auth.uid()) OR is_admin()));

create policy product_analysis_owner_delete on public.product_analysis as permissive for delete to public
  using (((user_id = auth.uid()) OR is_admin()));

create policy product_analysis_owner_insert on public.product_analysis as permissive for insert to public
  with check (((user_id = auth.uid()) OR is_admin()));

create policy product_analysis_owner_select on public.product_analysis as permissive for select to public
  using (((user_id = auth.uid()) OR is_admin()));

create policy product_analysis_owner_update on public.product_analysis as permissive for update to public
  using (((user_id = auth.uid()) OR is_admin()))
  with check (((user_id = auth.uid()) OR is_admin()));

create policy "Users can insert their products" on public.products as permissive for insert to public
  with check ((auth.uid() = user_id));

create policy "Users can see their products" on public.products as permissive for select to public
  using ((auth.uid() = user_id));

create policy products_owner_delete on public.products as permissive for delete to public
  using (((user_id = auth.uid()) OR is_admin()));

create policy products_owner_insert on public.products as permissive for insert to public
  with check (((user_id = auth.uid()) OR is_admin()));

create policy products_owner_select on public.products as permissive for select to public
  using (((user_id = auth.uid()) OR is_admin()));

create policy products_owner_update on public.products as permissive for update to public
  using (((user_id = auth.uid()) OR is_admin()))
  with check (((user_id = auth.uid()) OR is_admin()));

create policy quotes_owner_delete on public.quotes as permissive for delete to public
  using (((user_id = auth.uid()) OR is_admin()));

create policy quotes_owner_insert on public.quotes as permissive for insert to public
  with check (((user_id = auth.uid()) OR is_admin()));

create policy quotes_owner_select on public.quotes as permissive for select to public
  using (((user_id = auth.uid()) OR is_admin()));

create policy quotes_owner_update on public.quotes as permissive for update to public
  using (((user_id = auth.uid()) OR is_admin()))
  with check (((user_id = auth.uid()) OR is_admin()));

create policy user_invitations_admin_all on public.user_invitations as permissive for all to public
  using (is_current_admin())
  with check (is_current_admin());

create policy users_delete_admin_only on public.users as permissive for delete to public
  using (is_admin());

create policy users_insert_own_or_admin on public.users as permissive for insert to public
  with check (((id = auth.uid()) OR is_admin(auth.uid())));

create policy users_insert_own_profile on public.users as permissive for insert to public
  with check (((id = auth.uid()) OR is_admin()));

create policy users_select_own_or_admin on public.users as permissive for select to public
  using (((id = auth.uid()) OR is_admin()));

create policy users_update_own_or_admin on public.users as permissive for update to public
  using (((id = auth.uid()) OR is_admin()))
  with check (((id = auth.uid()) OR is_admin()));

-- Table privileges required by the API roles; RLS remains authoritative.

revoke all on table public.appointments from public;
grant all privileges on table public.appointments to anon, authenticated, service_role;

revoke all on table public.audit_logs from public;
grant all privileges on table public.audit_logs to anon, authenticated, service_role;

revoke all on table public.brand_profile_members from public;
grant all privileges on table public.brand_profile_members to anon, authenticated, service_role;

revoke all on table public.brand_profiles from public;
grant all privileges on table public.brand_profiles to anon, authenticated, service_role;

revoke all on table public.business_config from public;
grant all privileges on table public.business_config to anon, authenticated, service_role;

revoke all on table public.clients from public;
grant all privileges on table public.clients to anon, authenticated, service_role;

revoke all on table public.inventory_items from public;
grant all privileges on table public.inventory_items to anon, authenticated, service_role;

revoke all on table public.inventory_movements from public;
grant all privileges on table public.inventory_movements to anon, authenticated, service_role;

revoke all on table public.invoices from public;
grant all privileges on table public.invoices to anon, authenticated, service_role;

revoke all on table public.monthly_records from public;
grant all privileges on table public.monthly_records to anon, authenticated, service_role;

revoke all on table public.orders from public;
grant all privileges on table public.orders to anon, authenticated, service_role;

revoke all on table public.product_analysis from public;
grant all privileges on table public.product_analysis to anon, authenticated, service_role;

revoke all on table public.products from public;
grant all privileges on table public.products to anon, authenticated, service_role;

revoke all on table public.quotes from public;
grant all privileges on table public.quotes to anon, authenticated, service_role;

revoke all on table public.user_invitations from public;
grant all privileges on table public.user_invitations to anon, authenticated, service_role;

revoke all on table public.users from public;
grant all privileges on table public.users to anon, authenticated, service_role;

-- Pre-Phase 0.1 triggers, including auth.users.

CREATE TRIGGER trg_appointments_metadata BEFORE INSERT OR UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION sync_owned_record_metadata();

CREATE TRIGGER trg_appointments_owner_meta BEFORE INSERT OR UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION sync_owned_record_metadata();

CREATE TRIGGER trg_audit_logs_updated_at BEFORE UPDATE ON audit_logs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_brand_profile_members_updated_at BEFORE UPDATE ON brand_profile_members FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_brand_profiles_owned_metadata BEFORE INSERT OR UPDATE ON brand_profiles FOR EACH ROW EXECUTE FUNCTION sync_owned_record_metadata();

CREATE TRIGGER trg_brand_profiles_updated_at BEFORE UPDATE ON brand_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_business_config_metadata BEFORE INSERT OR UPDATE ON business_config FOR EACH ROW EXECUTE FUNCTION sync_owned_record_metadata();

CREATE TRIGGER trg_business_config_owner_meta BEFORE INSERT OR UPDATE ON business_config FOR EACH ROW EXECUTE FUNCTION sync_owned_record_metadata();

CREATE TRIGGER trg_clients_metadata BEFORE INSERT OR UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION sync_owned_record_metadata();

CREATE TRIGGER trg_clients_owner_meta BEFORE INSERT OR UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION sync_owned_record_metadata();

CREATE TRIGGER trg_inventory_items_metadata BEFORE INSERT OR UPDATE ON inventory_items FOR EACH ROW EXECUTE FUNCTION sync_owned_record_metadata();

CREATE TRIGGER trg_inventory_items_owner_meta BEFORE INSERT OR UPDATE ON inventory_items FOR EACH ROW EXECUTE FUNCTION sync_owned_record_metadata();

CREATE TRIGGER trg_inventory_movements_metadata BEFORE INSERT OR UPDATE ON inventory_movements FOR EACH ROW EXECUTE FUNCTION sync_owned_record_metadata();

CREATE TRIGGER trg_inventory_movements_owner_meta BEFORE INSERT OR UPDATE ON inventory_movements FOR EACH ROW EXECUTE FUNCTION sync_owned_record_metadata();

CREATE TRIGGER trg_invoices_metadata BEFORE INSERT OR UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION sync_owned_record_metadata();

CREATE TRIGGER trg_invoices_owner_meta BEFORE INSERT OR UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION sync_owned_record_metadata();

CREATE TRIGGER trg_monthly_records_metadata BEFORE INSERT OR UPDATE ON monthly_records FOR EACH ROW EXECUTE FUNCTION sync_owned_record_metadata();

CREATE TRIGGER trg_monthly_records_owner_meta BEFORE INSERT OR UPDATE ON monthly_records FOR EACH ROW EXECUTE FUNCTION sync_owned_record_metadata();

CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_product_analysis_metadata BEFORE INSERT OR UPDATE ON product_analysis FOR EACH ROW EXECUTE FUNCTION sync_owned_record_metadata();

CREATE TRIGGER trg_product_analysis_owner_meta BEFORE INSERT OR UPDATE ON product_analysis FOR EACH ROW EXECUTE FUNCTION sync_owned_record_metadata();

CREATE TRIGGER trg_products_metadata BEFORE INSERT OR UPDATE ON products FOR EACH ROW EXECUTE FUNCTION sync_owned_record_metadata();

CREATE TRIGGER trg_products_owner_meta BEFORE INSERT OR UPDATE ON products FOR EACH ROW EXECUTE FUNCTION sync_owned_record_metadata();

CREATE TRIGGER trg_quotes_metadata BEFORE INSERT OR UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION sync_owned_record_metadata();

CREATE TRIGGER trg_quotes_owner_meta BEFORE INSERT OR UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION sync_owned_record_metadata();

CREATE TRIGGER trg_user_invitations_updated_at BEFORE UPDATE ON user_invitations FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_users_access_segmentation BEFORE INSERT OR UPDATE ON users FOR EACH ROW EXECUTE FUNCTION enforce_user_access_segmentation();

CREATE TRIGGER trg_users_defaults BEFORE INSERT OR UPDATE ON users FOR EACH ROW EXECUTE FUNCTION handle_user_profile_defaults();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

commit;
