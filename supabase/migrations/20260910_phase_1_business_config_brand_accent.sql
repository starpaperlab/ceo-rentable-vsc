-- CEO Rentable 2.0 — Fase 1
-- Completa la personalización visual del negocio en business_config.

alter table if exists public.business_config
  add column if not exists brand_accent_color text default '#111827';

comment on column public.business_config.brand_accent_color is
  'Color secundario/acento del negocio para documentos y superficies personalizables.';
