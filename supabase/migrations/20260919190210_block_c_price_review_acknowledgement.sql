create or replace function public.maintain_product_price_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  pricing_dependency_changed boolean;
  pricing_reviewed boolean;
begin
  pricing_dependency_changed :=
    new.costo_unitario is distinct from old.costo_unitario
    or new.target_margin is distinct from old.target_margin
    or new.minimum_margin is distinct from old.minimum_margin
    or new.percentage_fees is distinct from old.percentage_fees
    or new.fixed_fees is distinct from old.fixed_fees;

  pricing_reviewed :=
    new.sale_price is distinct from old.sale_price
    or new.price_calculated_at is distinct from old.price_calculated_at;

  if pricing_reviewed then
    new.price_status := 'current';
    if new.price_calculated_at is not distinct from old.price_calculated_at then
      new.price_calculated_at := timezone('utc', now());
    end if;
  elsif pricing_dependency_changed then
    if old.price_status in ('review', 'outdated') then
      new.price_status := 'outdated';
    else
      new.price_status := 'review';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.maintain_product_price_status() from public, anon, authenticated;

drop trigger if exists trg_maintain_product_price_status on public.products;
create trigger trg_maintain_product_price_status
before update of sale_price, costo_unitario, target_margin, minimum_margin, percentage_fees, fixed_fees, price_calculated_at
on public.products
for each row execute function public.maintain_product_price_status();
