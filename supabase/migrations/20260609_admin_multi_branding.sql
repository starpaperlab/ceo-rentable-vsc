-- CEO Rentable OS™
-- Multi-branding admin + branding snapshot persistente para facturas y cotizaciones.
-- Seguro para ejecutar sobre instalaciones existentes.

create table if not exists public.brand_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  created_by text,
  name text not null,
  legal_name text,
  logo_url text,
  brand_color text not null default '#D94F8A',
  font_family text not null default 'Inter',
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
  pdf_preferences jsonb not null default '{}'::jsonb,
  logo_settings jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table if exists public.brand_profiles
  add column if not exists user_id uuid references public.users(id) on delete cascade,
  add column if not exists created_by text,
  add column if not exists name text,
  add column if not exists legal_name text,
  add column if not exists logo_url text,
  add column if not exists brand_color text default '#D94F8A',
  add column if not exists font_family text default 'Inter',
  add column if not exists fiscal_id text,
  add column if not exists address text,
  add column if not exists city_country text,
  add column if not exists contact_name text,
  add column if not exists contact_role text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists whatsapp text,
  add column if not exists instagram text,
  add column if not exists facebook text,
  add column if not exists tiktok text,
  add column if not exists linkedin text,
  add column if not exists website text,
  add column if not exists pdf_preferences jsonb default '{}'::jsonb,
  add column if not exists logo_settings jsonb default '{}'::jsonb,
  add column if not exists is_default boolean default false,
  add column if not exists created_at timestamptz default timezone('utc', now()),
  add column if not exists updated_at timestamptz default timezone('utc', now());

alter table if exists public.invoices
  add column if not exists brand_profile_id uuid references public.brand_profiles(id) on delete set null,
  add column if not exists branding_snapshot jsonb;

alter table if exists public.quotes
  add column if not exists brand_profile_id uuid references public.brand_profiles(id) on delete set null,
  add column if not exists branding_snapshot jsonb;

create index if not exists idx_brand_profiles_user_id on public.brand_profiles(user_id);
create unique index if not exists idx_brand_profiles_default_per_user on public.brand_profiles(user_id) where is_default = true;
create index if not exists idx_invoices_brand_profile_id on public.invoices(brand_profile_id);
create index if not exists idx_quotes_brand_profile_id on public.quotes(brand_profile_id);

alter table public.brand_profiles enable row level security;

do $$
begin
  if not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'brand_profiles'
       and policyname = 'Admins can view own brand profiles'
  ) then
    execute $policy$
      create policy "Admins can view own brand profiles"
      on public.brand_profiles
      for select
      using (public.is_admin(auth.uid()) and user_id = auth.uid())
    $policy$;
  end if;

  if not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'brand_profiles'
       and policyname = 'Admins can insert own brand profiles'
  ) then
    execute $policy$
      create policy "Admins can insert own brand profiles"
      on public.brand_profiles
      for insert
      with check (public.is_admin(auth.uid()) and user_id = auth.uid())
    $policy$;
  end if;

  if not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'brand_profiles'
       and policyname = 'Admins can update own brand profiles'
  ) then
    execute $policy$
      create policy "Admins can update own brand profiles"
      on public.brand_profiles
      for update
      using (public.is_admin(auth.uid()) and user_id = auth.uid())
      with check (public.is_admin(auth.uid()) and user_id = auth.uid())
    $policy$;
  end if;

  if not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'brand_profiles'
       and policyname = 'Admins can delete own brand profiles'
  ) then
    execute $policy$
      create policy "Admins can delete own brand profiles"
      on public.brand_profiles
      for delete
      using (public.is_admin(auth.uid()) and user_id = auth.uid())
    $policy$;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
      from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname = 'sync_owned_record_metadata'
  )
  and not exists (
    select 1
      from pg_trigger
     where tgname = 'trg_brand_profiles_owned_metadata'
       and tgrelid = 'public.brand_profiles'::regclass
  ) then
    execute '
      create trigger trg_brand_profiles_owned_metadata
      before insert or update on public.brand_profiles
      for each row
      execute function public.sync_owned_record_metadata()
    ';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
      from pg_proc
     where pronamespace = 'public'::regnamespace
       and proname = 'set_updated_at'
  )
  and not exists (
    select 1
      from pg_trigger
     where tgname = 'trg_brand_profiles_updated_at'
       and tgrelid = 'public.brand_profiles'::regclass
  ) then
    execute '
      create trigger trg_brand_profiles_updated_at
      before update on public.brand_profiles
      for each row
      execute function public.set_updated_at()
    ';
  end if;
end
$$;

update public.brand_profiles
   set name = coalesce(nullif(trim(name), ''), 'Marca sin nombre'),
       brand_color = coalesce(nullif(trim(brand_color), ''), '#D94F8A'),
       font_family = coalesce(nullif(trim(font_family), ''), 'Inter'),
       pdf_preferences = coalesce(pdf_preferences, '{}'::jsonb),
       logo_settings = coalesce(logo_settings, '{}'::jsonb)
 where name is null
    or trim(name) = ''
    or brand_color is null
    or trim(brand_color) = ''
    or font_family is null
    or trim(font_family) = ''
    or pdf_preferences is null
    or logo_settings is null;

update public.invoices
   set branding_snapshot = jsonb_strip_nulls(jsonb_build_object(
     'brand_profile_id', brand_profile_id,
     'company_name', company_name,
     'legal_name', fiscal_name,
     'logo_url', logo_url,
     'rnc', fiscal_id,
     'fiscal_name', fiscal_name,
     'fiscal_id', fiscal_id,
     'fiscal_address', coalesce(fiscal_address, address),
     'address', coalesce(address, fiscal_address),
     'city_country', city_country,
     'contact_name', contact_name,
     'contact_role', contact_title,
     'contact_title', contact_title,
     'contact_email', contact_email,
     'contact_phone', phone_primary,
     'contact_phone_secondary', phone_secondary,
     'brand_color', brand_color,
     'font_family', font_family,
     'social_links', jsonb_build_object(
       'instagram', instagram_url,
       'facebook', facebook_url,
       'tiktok', tiktok_url,
       'linkedin', linkedin_url,
       'website', website_url,
       'whatsapp', whatsapp_url
     ),
     'document_preferences', jsonb_build_object(
       'doc_show_socials', doc_show_socials,
       'doc_show_fiscal_id', doc_show_fiscal_id,
       'doc_show_address', doc_show_address,
       'doc_show_contact', doc_show_contact,
       'doc_show_signature', doc_show_signature
     ),
     'pdf_preferences', jsonb_build_object(
       'doc_show_socials', doc_show_socials,
       'doc_show_fiscal_id', doc_show_fiscal_id,
       'doc_show_address', doc_show_address,
       'doc_show_contact', doc_show_contact,
       'doc_show_signature', doc_show_signature
     ),
     'logo_settings', jsonb_build_object(
       'logo_size', logo_size,
       'logo_width', logo_width,
       'logo_position', logo_position
     )
   ))
 where branding_snapshot is null
   and (
     company_name is not null
     or logo_url is not null
     or brand_color is not null
     or fiscal_name is not null
     or fiscal_id is not null
     or address is not null
     or contact_name is not null
   );

update public.quotes
   set branding_snapshot = jsonb_strip_nulls(jsonb_build_object(
     'brand_profile_id', brand_profile_id,
     'company_name', company_name,
     'legal_name', fiscal_name,
     'logo_url', logo_url,
     'rnc', fiscal_id,
     'fiscal_name', fiscal_name,
     'fiscal_id', fiscal_id,
     'fiscal_address', coalesce(fiscal_address, address),
     'address', coalesce(address, fiscal_address),
     'city_country', city_country,
     'contact_name', contact_name,
     'contact_role', contact_title,
     'contact_title', contact_title,
     'contact_email', contact_email,
     'contact_phone', phone_primary,
     'contact_phone_secondary', phone_secondary,
     'brand_color', brand_color,
     'font_family', font_family,
     'social_links', jsonb_build_object(
       'instagram', instagram_url,
       'facebook', facebook_url,
       'tiktok', tiktok_url,
       'linkedin', linkedin_url,
       'website', website_url,
       'whatsapp', whatsapp_url
     ),
     'document_preferences', jsonb_build_object(
       'doc_show_socials', doc_show_socials,
       'doc_show_fiscal_id', doc_show_fiscal_id,
       'doc_show_address', doc_show_address,
       'doc_show_contact', doc_show_contact,
       'doc_show_signature', doc_show_signature
     ),
     'pdf_preferences', jsonb_build_object(
       'doc_show_socials', doc_show_socials,
       'doc_show_fiscal_id', doc_show_fiscal_id,
       'doc_show_address', doc_show_address,
       'doc_show_contact', doc_show_contact,
       'doc_show_signature', doc_show_signature
     ),
     'logo_settings', jsonb_build_object(
       'logo_size', logo_size,
       'logo_width', logo_width,
       'logo_position', logo_position
     )
   ))
 where branding_snapshot is null
   and (
     company_name is not null
     or logo_url is not null
     or brand_color is not null
     or fiscal_name is not null
     or fiscal_id is not null
     or address is not null
     or contact_name is not null
   );
