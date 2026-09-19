begin;
create index if not exists idx_business_expenses_user_id on public.business_expenses(user_id);
create index if not exists idx_business_materials_user_id on public.business_materials(user_id);
create index if not exists idx_business_equipment_user_id on public.business_equipment(user_id);
commit;
