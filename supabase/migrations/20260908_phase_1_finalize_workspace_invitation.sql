create or replace function public.finalize_user_invitation(p_invitation_id uuid, p_accepted_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv public.user_invitations%rowtype;
  v_updated_count integer;
  v_workspace_role text;
begin
  if p_invitation_id is null or p_accepted_user_id is null then
    return false;
  end if;

  select * into v_inv
  from public.user_invitations
  where id = p_invitation_id
    and status = 'processing'
    and (accepted_user_id is null or accepted_user_id = p_accepted_user_id)
  for update;

  if not found then
    return false;
  end if;

  if v_inv.workspace_id is not null then
    v_workspace_role := case
      when v_inv.workspace_role in ('admin','member','viewer') then v_inv.workspace_role
      else 'member'
    end;

    insert into public.workspace_members (workspace_id, user_id, role, status, module_permissions)
    values (v_inv.workspace_id,p_accepted_user_id,v_workspace_role,'active',coalesce(v_inv.module_permissions,'{}'::jsonb))
    on conflict (workspace_id, user_id)
    do update set role=excluded.role,status='active',module_permissions=excluded.module_permissions;
  end if;

  update public.user_invitations
     set status='accepted',accepted_user_id=p_accepted_user_id,accepted_at=timezone('utc',now()),processing_at=null,updated_at=timezone('utc',now())
   where id=p_invitation_id
     and status='processing'
     and (accepted_user_id is null or accepted_user_id=p_accepted_user_id);

  get diagnostics v_updated_count = row_count;
  return v_updated_count = 1;
end;
$$;

revoke all on function public.finalize_user_invitation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.finalize_user_invitation(uuid, uuid) to service_role;
