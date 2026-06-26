-- CEO Rentable OS(TM)
-- Work-order operational details for orders. Additive only.

alter table if exists public.orders
  add column if not exists theme text,
  add column if not exists custom_name text,
  add column if not exists custom_text text,
  add column if not exists requested_colors text,
  add column if not exists event_date date,
  add column if not exists client_instructions text,
  add column if not exists whatsapp_original_message text,
  add column if not exists internal_notes text,
  add column if not exists important_notes boolean not null default false,
  add column if not exists delivery_address text,
  add column if not exists shipping_carrier text,
  add column if not exists tracking_number text,
  add column if not exists estimated_delivery_date date,
  add column if not exists commitment_date date,
  add column if not exists logistics_notes text;

create index if not exists idx_orders_commitment_date on public.orders(commitment_date);
create index if not exists idx_orders_estimated_delivery_date on public.orders(estimated_delivery_date);
