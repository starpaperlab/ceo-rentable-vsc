-- CEO Rentable OS™
-- RPC para que visitantes anonimos del /diagnostico puedan completar su lead
-- (respuestas del diagnostico + CEO Score) sin exponer select/update directo
-- sobre public.leads, cuyas policies de select/update son solo para admins.

create or replace function public.update_diagnostico_lead(
  p_email text,
  p_monthly_sales text,
  p_knows_margin boolean,
  p_controls_costs boolean,
  p_knows_best_product boolean,
  p_ceo_score numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.leads
  set
    monthly_sales = p_monthly_sales,
    knows_margin = p_knows_margin,
    controls_costs = p_controls_costs,
    knows_best_product = p_knows_best_product,
    ceo_score = p_ceo_score,
    updated_at = timezone('utc', now())
  where source = 'diagnostico'
    and lower(email) = lower(p_email);
end;
$$;

revoke all on function public.update_diagnostico_lead(text, text, boolean, boolean, boolean, numeric) from public;
grant execute on function public.update_diagnostico_lead(text, text, boolean, boolean, boolean, numeric) to anon, authenticated;
