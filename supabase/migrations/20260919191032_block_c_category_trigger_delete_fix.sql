create or replace function public.propagate_category_pricing_rule()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_workspace uuid;
  v_category_key text;
  v_old_category_key text;
begin
  if tg_op = 'DELETE' then
    v_workspace := old.workspace_id;
    v_category_key := old.category_key;
  else
    v_workspace := new.workspace_id;
    v_category_key := new.category_key;
  end if;

  if tg_op = 'UPDATE' then
    v_old_category_key := old.category_key;
    if v_old_category_key is distinct from v_category_key then
      perform public.apply_pricing_inheritance_for_workspace(v_workspace, v_old_category_key);
    end if;
  end if;

  perform public.apply_pricing_inheritance_for_workspace(v_workspace, v_category_key);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.propagate_category_pricing_rule() from public, anon, authenticated;
