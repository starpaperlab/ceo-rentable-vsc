-- CEO Rentable OS™
-- Bandera de activacion para items de inventario vinculados al catalogo maestro.

alter table if exists public.inventory_items
  add column if not exists is_active boolean not null default true;

create index if not exists idx_inventory_items_product_active
  on public.inventory_items(product_id, is_active);
