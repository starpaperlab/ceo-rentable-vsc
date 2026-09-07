-- CEO Rentable OS™
-- Fase 0.2: asegurar que una transacción PayPal completada active
-- usuario + suscripción + orden dentro de la misma transacción PostgreSQL.
-- Esto evita el estado "pago cobrado pero acceso incompleto" si el servidor
-- falla después de registrar la transacción.

create or replace function public.apply_completed_paypal_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_code text;
  v_is_lifetime boolean;
  v_now timestamptz := timezone('utc', now());
begin
  if new.payment_provider is distinct from 'paypal'
     or new.status <> 'completed'
     or new.provider_capture_id is null then
    return new;
  end if;

  v_plan_code := lower(trim(coalesce(new.metadata ->> 'plan_code', '')));

  if v_plan_code not in ('founder_lifetime', 'monthly') then
    raise exception 'Unsupported PayPal plan_code for completed transaction';
  end if;

  v_is_lifetime := (v_plan_code = 'founder_lifetime');

  update public.users
     set has_access = true,
         access_status = 'active',
         plan = v_plan_code,
         is_lifetime = v_is_lifetime,
         payment_provider = 'paypal',
         access_source = 'paypal',
         updated_at = v_now
   where id = new.user_id;

  if not found then
    raise exception 'PayPal transaction user not found';
  end if;

  insert into public.subscriptions (
    user_id,
    plan,
    plan_code,
    status,
    is_lifetime,
    access_source,
    payment_provider,
    provider_customer_id,
    provider_subscription_id,
    metadata,
    updated_at
  )
  values (
    new.user_id,
    v_plan_code,
    v_plan_code,
    'active',
    v_is_lifetime,
    'paypal',
    'paypal',
    null,
    null,
    jsonb_build_object(
      'plan_type', case when v_is_lifetime then 'lifetime' else 'monthly' end,
      'paypal_order_id', new.provider_order_id,
      'paypal_capture_id', new.provider_capture_id
    ),
    v_now
  )
  on conflict (user_id) do update
     set plan = excluded.plan,
         plan_code = excluded.plan_code,
         status = excluded.status,
         is_lifetime = excluded.is_lifetime,
         access_source = excluded.access_source,
         payment_provider = excluded.payment_provider,
         provider_customer_id = excluded.provider_customer_id,
         provider_subscription_id = excluded.provider_subscription_id,
         metadata = excluded.metadata,
         updated_at = excluded.updated_at;

  if new.provider_order_id is not null then
    update public.paypal_orders
       set status = 'completed',
           paypal_capture_id = new.provider_capture_id,
           captured_at = coalesce(captured_at, v_now),
           updated_at = v_now
     where paypal_order_id = new.provider_order_id
       and user_id = new.user_id;

    if not found then
      raise exception 'PayPal local order not found for completed transaction';
    end if;
  end if;

  return new;
end;
$$;

-- El índice único existente en (payment_provider, provider_capture_id)
-- continúa siendo la barrera de idempotencia ante doble captura/evento.

drop trigger if exists trg_apply_completed_paypal_transaction on public.transactions;
create trigger trg_apply_completed_paypal_transaction
after insert on public.transactions
for each row
when (new.payment_provider = 'paypal' and new.status = 'completed')
execute function public.apply_completed_paypal_transaction();

comment on function public.apply_completed_paypal_transaction() is
  'Atomically reconciles a completed PayPal transaction with user access, subscription and local PayPal order.';
