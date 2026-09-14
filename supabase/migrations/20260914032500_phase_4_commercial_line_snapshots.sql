-- Fase 4: snapshots financieros y metadatos del catalogo en lineas comerciales.
begin;

alter table public.order_items
  add column if not exists product_type text,
  add column if not exists sku text,
  add column if not exists category text,
  add column if not exists unit text not null default 'unidad',
  add column if not exists tax_pct numeric not null default 0,
  add column if not exists currency text,
  add column if not exists unit_cost_snapshot numeric not null default 0,
  add column if not exists unit_profit_snapshot numeric not null default 0,
  add column if not exists margin_pct_snapshot numeric not null default 0;

create index if not exists order_items_product_id_idx on public.order_items(product_id);
create index if not exists order_items_workspace_product_idx on public.order_items(workspace_id, product_id);

commit;
