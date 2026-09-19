begin;

alter table public.products
  add column if not exists auto_allocate_general_tools boolean not null default true,
  add column if not exists linked_expense_ids uuid[] not null default '{}'::uuid[];

create index if not exists idx_products_linked_expense_ids
  on public.products using gin(linked_expense_ids);

commit;
