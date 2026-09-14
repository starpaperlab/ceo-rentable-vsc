-- Fase 4 hotfix: columnas del catálogo requeridas por Products.jsx.
begin;

alter table public.products
  add column if not exists sku text,
  add column if not exists descripcion text,
  add column if not exists category text,
  add column if not exists service_hours numeric not null default 0;

create index if not exists products_workspace_sku_idx
  on public.products (workspace_id, sku)
  where sku is not null;

commit;
