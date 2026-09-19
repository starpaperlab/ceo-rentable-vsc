create or replace function public.refresh_product_margin_pct()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_price numeric := coalesce(new.sale_price, 0);
  v_cost numeric := coalesce(new.costo_unitario, 0);
  v_fee_pct numeric := coalesce(new.percentage_fees, 0);
  v_fixed_fee numeric := coalesce(new.fixed_fees, 0);
  v_profit numeric;
begin
  v_profit := v_price - v_cost - (v_price * v_fee_pct / 100) - v_fixed_fee;
  new.margin_pct := case
    when v_price > 0 then round((v_profit / v_price) * 100, 2)
    else 0
  end;
  return new;
end;
$$;

revoke all on function public.refresh_product_margin_pct() from public, anon, authenticated;

drop trigger if exists trg_refresh_product_margin_pct on public.products;
create trigger trg_refresh_product_margin_pct
before insert or update of sale_price, costo_unitario, percentage_fees, fixed_fees
on public.products
for each row execute function public.refresh_product_margin_pct();

create or replace function public.propagate_business_pricing_defaults()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.workspace_id is null then return new; end if;

  if new.target_margin_pct is distinct from old.target_margin_pct
     or new.minimum_margin_pct is distinct from old.minimum_margin_pct
     or new.payment_fee_pct is distinct from old.payment_fee_pct
     or new.payment_fixed_fee is distinct from old.payment_fixed_fee
     or new.commercial_rounding is distinct from old.commercial_rounding then

    update public.products p
    set
      target_margin = case
        when p.target_margin is null or p.target_margin = old.target_margin_pct then new.target_margin_pct
        else p.target_margin
      end,
      minimum_margin = case
        when p.minimum_margin is null or p.minimum_margin = old.minimum_margin_pct then new.minimum_margin_pct
        else p.minimum_margin
      end,
      percentage_fees = case
        when p.percentage_fees is null or p.percentage_fees = old.payment_fee_pct then new.payment_fee_pct
        else p.percentage_fees
      end,
      fixed_fees = case
        when p.fixed_fees is null or p.fixed_fees = old.payment_fixed_fee then new.payment_fixed_fee
        else p.fixed_fees
      end,
      commercial_rounding = case
        when p.commercial_rounding is null or p.commercial_rounding = old.commercial_rounding then new.commercial_rounding
        else p.commercial_rounding
      end,
      updated_at = timezone('utc', now())
    where p.workspace_id = new.workspace_id
      and (
        p.target_margin is null or p.target_margin = old.target_margin_pct
        or p.minimum_margin is null or p.minimum_margin = old.minimum_margin_pct
        or p.percentage_fees is null or p.percentage_fees = old.payment_fee_pct
        or p.fixed_fees is null or p.fixed_fees = old.payment_fixed_fee
        or p.commercial_rounding is null or p.commercial_rounding = old.commercial_rounding
      );
  end if;

  return new;
end;
$$;

revoke all on function public.propagate_business_pricing_defaults() from public, anon, authenticated;

drop trigger if exists trg_propagate_business_pricing_defaults on public.business_config;
create trigger trg_propagate_business_pricing_defaults
after update of target_margin_pct, minimum_margin_pct, payment_fee_pct, payment_fixed_fee, commercial_rounding
on public.business_config
for each row execute function public.propagate_business_pricing_defaults();

update public.products
set margin_pct = case
  when coalesce(sale_price,0) > 0 then round((
    (
      coalesce(sale_price,0)
      - coalesce(costo_unitario,0)
      - (coalesce(sale_price,0) * coalesce(percentage_fees,0) / 100)
      - coalesce(fixed_fees,0)
    ) / sale_price
  ) * 100, 2)
  else 0
end;
