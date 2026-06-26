-- CEO Rentable OS™
-- Categorías para catálogo comercial e inventario físico.

alter table if exists public.products
  add column if not exists category text;

alter table if exists public.inventory_items
  add column if not exists category text;

alter table if exists public.inventory_items
  add column if not exists product_id uuid references public.products(id) on delete set null;

create index if not exists idx_inventory_items_product_id
  on public.inventory_items(product_id);
