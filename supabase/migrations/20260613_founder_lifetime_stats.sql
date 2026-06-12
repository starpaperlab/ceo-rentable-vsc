-- CEO Rentable OS™
-- Sprint 2: contador real de cupos Founder Lifetime para el paywall.
-- Devuelve solo agregados (nunca filas de usuarios), seguro para anon/authenticated.

create or replace function public.get_founder_lifetime_stats(p_total_limit integer default 20)
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'total_limit', p_total_limit,
    'claimed', (select count(*) from public.users where plan = 'founder_lifetime'),
    'remaining', greatest(p_total_limit - (select count(*) from public.users where plan = 'founder_lifetime')::integer, 0)
  );
$$;

revoke all on function public.get_founder_lifetime_stats(integer) from public;
grant execute on function public.get_founder_lifetime_stats(integer) to anon, authenticated;
