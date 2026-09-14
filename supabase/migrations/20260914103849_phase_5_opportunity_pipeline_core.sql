-- CEO Rentable OS™ — Fase 5 / Bloque E
-- Pipeline por oportunidad: etapas configurables, historial y conversión de ganado a pedido.

begin;

create table public.opportunity_stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  code text not null,
  name text not null,
  sort_order integer not null default 0,
  color text not null default 'neutral',
  stage_type text not null default 'open',
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunity_stages_code_check check (btrim(code) <> ''),
  constraint opportunity_stages_name_check check (btrim(name) <> ''),
  constraint opportunity_stages_type_check check (stage_type in ('open','won','lost')),
  constraint opportunity_stages_workspace_code_key unique(workspace_id, code),
  constraint opportunity_stages_workspace_id_key unique(workspace_id, id)
);

create unique index opportunity_stages_one_default_per_workspace
  on public.opportunity_stages(workspace_id)
  where is_default and is_active;

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  stage_id uuid not null,
  user_id uuid,
  created_by text,
  responsible_user_id uuid,
  responsible_email text,
  title text not null,
  description text,
  source text,
  expected_value numeric(14,2) not null default 0,
  expected_close_date date,
  stage_entered_at timestamptz not null default now(),
  won_at timestamptz,
  lost_at timestamptz,
  loss_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunities_title_check check (btrim(title) <> ''),
  constraint opportunities_expected_value_check check (expected_value >= 0),
  constraint opportunities_stage_fk foreign key (workspace_id, stage_id)
    references public.opportunity_stages(workspace_id, id)
    on update cascade on delete restrict
);

create index idx_opportunities_workspace_stage on public.opportunities(workspace_id, stage_id);
create index idx_opportunities_workspace_client on public.opportunities(workspace_id, client_id);
create index idx_opportunities_expected_close on public.opportunities(workspace_id, expected_close_date);
create index idx_opportunities_responsible on public.opportunities(workspace_id, responsible_user_id);

create table public.opportunity_stage_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  from_stage_id uuid references public.opportunity_stages(id) on delete set null,
  to_stage_id uuid not null references public.opportunity_stages(id) on delete restrict,
  from_stage_code text,
  from_stage_name text,
  to_stage_code text not null,
  to_stage_name text not null,
  stage_entered_at timestamptz,
  changed_at timestamptz not null default now(),
  duration_seconds bigint,
  changed_by uuid,
  changed_by_email text
);

create index idx_opportunity_history_opportunity_time
  on public.opportunity_stage_history(opportunity_id, changed_at desc);
create index idx_opportunity_history_workspace_time
  on public.opportunity_stage_history(workspace_id, changed_at desc);

alter table public.client_activities
  add column if not exists opportunity_id uuid references public.opportunities(id) on delete set null;
create index if not exists idx_client_activities_opportunity_id
  on public.client_activities(opportunity_id);

alter table public.orders
  add column if not exists opportunity_id uuid references public.opportunities(id) on delete restrict;
create unique index if not exists idx_orders_opportunity_id_unique
  on public.orders(opportunity_id)
  where opportunity_id is not null;

insert into public.opportunity_stages
  (workspace_id, code, name, sort_order, color, stage_type, is_default, is_active)
select w.id, seed.code, seed.name, seed.sort_order, seed.color, seed.stage_type, seed.is_default, true
from public.workspaces w
cross join (
  values
    ('new','Nuevo',10,'neutral','open',true),
    ('contacted','Contactado',20,'brand','open',false),
    ('qualified','Calificado',30,'brand','open',false),
    ('proposal','Propuesta',40,'brand','open',false),
    ('follow_up','Seguimiento',50,'brand','open',false),
    ('negotiation','Negociación',60,'brand','open',false),
    ('won','Ganado',70,'success','won',false),
    ('lost','Perdido',80,'danger','lost',false)
) as seed(code,name,sort_order,color,stage_type,is_default)
on conflict (workspace_id, code) do nothing;

create or replace function public.prepare_opportunity_stage()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_stage public.opportunity_stages%rowtype;
  v_client_workspace uuid;
begin
  select workspace_id into v_client_workspace
  from public.clients
  where id = new.client_id;

  if v_client_workspace is null or v_client_workspace is distinct from new.workspace_id then
    raise exception 'El cliente no pertenece al workspace de la oportunidad.';
  end if;

  select * into v_stage
  from public.opportunity_stages
  where id = new.stage_id
    and workspace_id = new.workspace_id;

  if not found then raise exception 'La etapa no pertenece al workspace de la oportunidad.'; end if;

  if (tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id) and not v_stage.is_active then
    raise exception 'No puedes mover la oportunidad a una etapa inactiva.';
  end if;

  if v_stage.stage_type = 'lost' and nullif(btrim(coalesce(new.loss_reason,'')), '') is null then
    raise exception 'Debes indicar el motivo de pérdida.';
  end if;

  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    new.stage_entered_at := now();
    if v_stage.stage_type = 'won' then
      new.won_at := coalesce(new.won_at, now());
      new.lost_at := null;
      new.loss_reason := null;
    elsif v_stage.stage_type = 'lost' then
      new.lost_at := coalesce(new.lost_at, now());
      new.won_at := null;
    else
      new.won_at := null;
      new.lost_at := null;
      new.loss_reason := null;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.capture_opportunity_stage_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from public.opportunity_stages%rowtype;
  v_to public.opportunity_stages%rowtype;
  v_changed_at timestamptz := now();
begin
  if tg_op = 'UPDATE' and new.stage_id is not distinct from old.stage_id then return new; end if;
  if tg_op = 'UPDATE' then select * into v_from from public.opportunity_stages where id = old.stage_id; end if;
  select * into v_to from public.opportunity_stages where id = new.stage_id;

  insert into public.opportunity_stage_history (
    workspace_id, opportunity_id, from_stage_id, to_stage_id,
    from_stage_code, from_stage_name, to_stage_code, to_stage_name,
    stage_entered_at, changed_at, duration_seconds, changed_by, changed_by_email
  )
  values (
    new.workspace_id, new.id,
    case when tg_op = 'UPDATE' then old.stage_id else null end,
    new.stage_id,
    case when tg_op = 'UPDATE' then v_from.code else null end,
    case when tg_op = 'UPDATE' then v_from.name else null end,
    v_to.code, v_to.name,
    case when tg_op = 'UPDATE' then old.stage_entered_at else new.stage_entered_at end,
    v_changed_at,
    case when tg_op = 'UPDATE' and old.stage_entered_at is not null
      then greatest(0, extract(epoch from (v_changed_at - old.stage_entered_at))::bigint)
      else 0 end,
    auth.uid(),
    nullif(auth.jwt() ->> 'email','')
  );
  return new;
end;
$$;

create trigger trg_prepare_opportunity_stage
before insert or update on public.opportunities
for each row execute function public.prepare_opportunity_stage();

create trigger trg_capture_opportunity_stage_history
after insert or update of stage_id on public.opportunities
for each row execute function public.capture_opportunity_stage_history();

alter table public.opportunity_stages enable row level security;
alter table public.opportunities enable row level security;
alter table public.opportunity_stage_history enable row level security;

create policy opportunity_stages_select on public.opportunity_stages for select to authenticated
using (public.workspace_has_module_access(workspace_id, 'opportunities'));
create policy opportunity_stages_insert on public.opportunity_stages for insert to authenticated
with check (public.workspace_can_write(workspace_id, 'opportunities'));
create policy opportunity_stages_update on public.opportunity_stages for update to authenticated
using (public.workspace_can_write(workspace_id, 'opportunities'))
with check (public.workspace_can_write(workspace_id, 'opportunities'));
create policy opportunity_stages_delete on public.opportunity_stages for delete to authenticated
using (public.workspace_can_write(workspace_id, 'opportunities'));

create policy opportunities_select on public.opportunities for select to authenticated
using (public.workspace_has_module_access(workspace_id, 'opportunities'));
create policy opportunities_insert on public.opportunities for insert to authenticated
with check (public.workspace_can_write(workspace_id, 'opportunities'));
create policy opportunities_update on public.opportunities for update to authenticated
using (public.workspace_can_write(workspace_id, 'opportunities'))
with check (public.workspace_can_write(workspace_id, 'opportunities'));
create policy opportunities_delete on public.opportunities for delete to authenticated
using (public.workspace_can_write(workspace_id, 'opportunities'));

create policy opportunity_history_select on public.opportunity_stage_history for select to authenticated
using (public.workspace_has_module_access(workspace_id, 'opportunities'));

grant select, insert, update, delete on public.opportunity_stages to authenticated;
grant select, insert, update, delete on public.opportunities to authenticated;
grant select on public.opportunity_stage_history to authenticated;
grant all on public.opportunity_stages, public.opportunities, public.opportunity_stage_history to service_role;

revoke all on function public.prepare_opportunity_stage() from public, anon, authenticated;
revoke all on function public.capture_opportunity_stage_history() from public, anon, authenticated;

drop policy if exists client_activities_workspace_select on public.client_activities;
drop policy if exists client_activities_workspace_insert on public.client_activities;
drop policy if exists client_activities_workspace_update on public.client_activities;
drop policy if exists client_activities_workspace_delete on public.client_activities;

create policy client_activities_workspace_select on public.client_activities for select to authenticated
using (
  public.workspace_has_module_access(workspace_id, 'clients')
  or (opportunity_id is not null and public.workspace_has_module_access(workspace_id, 'opportunities'))
);
create policy client_activities_workspace_insert on public.client_activities for insert to authenticated
with check (
  public.workspace_can_write(workspace_id, 'clients')
  or (opportunity_id is not null and public.workspace_can_write(workspace_id, 'opportunities'))
);
create policy client_activities_workspace_update on public.client_activities for update to authenticated
using (
  public.workspace_can_write(workspace_id, 'clients')
  or (opportunity_id is not null and public.workspace_can_write(workspace_id, 'opportunities'))
)
with check (
  public.workspace_can_write(workspace_id, 'clients')
  or (opportunity_id is not null and public.workspace_can_write(workspace_id, 'opportunities'))
);
create policy client_activities_workspace_delete on public.client_activities for delete to authenticated
using (
  public.workspace_can_write(workspace_id, 'clients')
  or (opportunity_id is not null and public.workspace_can_write(workspace_id, 'opportunities'))
);

update public.workspace_members
set module_permissions = coalesce(module_permissions,'{}'::jsonb)
  || jsonb_build_object(
    'opportunities',
    case
      when role in ('owner','admin') then true
      else coalesce((module_permissions->>'clients')::boolean,false)
    end
  )
where not (coalesce(module_permissions,'{}'::jsonb) ? 'opportunities');

create or replace function public.set_default_opportunity_stage(target_stage_id uuid)
returns public.opportunity_stages
language plpgsql
security definer
set search_path = public
as $$
declare v_stage public.opportunity_stages%rowtype;
begin
  select * into v_stage from public.opportunity_stages where id = target_stage_id for update;
  if not found then raise exception 'Etapa no encontrada.'; end if;
  if not public.workspace_can_write(v_stage.workspace_id, 'opportunities') then raise exception 'No autorizado.'; end if;
  if v_stage.stage_type <> 'open' then raise exception 'La etapa predeterminada debe ser una etapa abierta.'; end if;
  update public.opportunity_stages set is_default = false, updated_at = now()
  where workspace_id = v_stage.workspace_id and is_default = true;
  update public.opportunity_stages set is_default = true, is_active = true, updated_at = now()
  where id = v_stage.id returning * into v_stage;
  return v_stage;
end;
$$;

revoke all on function public.set_default_opportunity_stage(uuid) from public;
revoke all on function public.set_default_opportunity_stage(uuid) from anon;
grant execute on function public.set_default_opportunity_stage(uuid) to authenticated;
grant execute on function public.set_default_opportunity_stage(uuid) to service_role;

create or replace function public.convert_opportunity_to_order(target_opportunity_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opportunity public.opportunities%rowtype;
  v_stage public.opportunity_stages%rowtype;
  v_client public.clients%rowtype;
  v_order public.orders%rowtype;
  v_existing public.orders%rowtype;
  v_order_number text;
  v_status text;
begin
  if target_opportunity_id is null then raise exception 'Oportunidad requerida.'; end if;
  select * into v_opportunity from public.opportunities where id = target_opportunity_id for update;
  if not found then raise exception 'Oportunidad no encontrada.'; end if;

  if not public.workspace_can_write(v_opportunity.workspace_id, 'opportunities')
     or not public.workspace_can_write(v_opportunity.workspace_id, 'orders') then
    raise exception 'No autorizado.';
  end if;

  select * into v_stage from public.opportunity_stages where id = v_opportunity.stage_id;
  if v_stage.stage_type <> 'won' then raise exception 'Solo una oportunidad ganada puede convertirse en pedido.'; end if;

  select * into v_existing from public.orders where opportunity_id = v_opportunity.id limit 1;
  if found then return v_existing; end if;

  select * into v_client from public.clients
  where id = v_opportunity.client_id and workspace_id = v_opportunity.workspace_id;
  if not found then raise exception 'El cliente de la oportunidad no está disponible en este workspace.'; end if;

  v_order_number := public.reserve_order_number(v_opportunity.workspace_id);
  select code into v_status from public.order_statuses
  where workspace_id = v_opportunity.workspace_id and code = 'draft' and is_active limit 1;
  if v_status is null then
    select code into v_status from public.order_statuses
    where workspace_id = v_opportunity.workspace_id and is_default and is_active
    order by sort_order limit 1;
  end if;

  insert into public.orders (
    workspace_id, user_id, created_by, order_number, date,
    client_id, client_name, client_email, client_phone,
    subtotal, discount_amount, shipping_amount, total_final,
    operational_status, notes, opportunity_id
  )
  values (
    v_opportunity.workspace_id, v_opportunity.user_id, v_opportunity.created_by,
    v_order_number, current_date,
    v_client.id, v_client.name, v_client.email, v_client.phone,
    0, 0, 0, 0, coalesce(v_status,'draft'),
    concat_ws(E'\n',
      'Pedido creado desde oportunidad: ' || v_opportunity.title,
      case when coalesce(v_opportunity.expected_value,0) > 0
        then 'Valor estimado de la oportunidad: ' || v_opportunity.expected_value::text else null end,
      nullif(v_opportunity.description,'')
    ),
    v_opportunity.id
  )
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.convert_opportunity_to_order(uuid) from public;
revoke all on function public.convert_opportunity_to_order(uuid) from anon;
grant execute on function public.convert_opportunity_to_order(uuid) to authenticated;
grant execute on function public.convert_opportunity_to_order(uuid) to service_role;

commit;
