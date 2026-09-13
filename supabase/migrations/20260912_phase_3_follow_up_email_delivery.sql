-- CEO Rentable 2.0 — Fase 3 QA
-- Seguimientos por email: estado de envío y reinicio al reprogramar.

begin;

alter table public.clients
  add column if not exists follow_up_email_sent_at timestamptz,
  add column if not exists follow_up_email_last_attempt_at timestamptz,
  add column if not exists follow_up_email_error text;

create index if not exists idx_clients_follow_up_email_due
  on public.clients(next_follow_up_at)
  where next_follow_up_at is not null and follow_up_email_sent_at is null;

create or replace function public.reset_follow_up_email_delivery()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.next_follow_up_at is distinct from old.next_follow_up_at then
    new.follow_up_email_sent_at := null;
    new.follow_up_email_last_attempt_at := null;
    new.follow_up_email_error := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clients_reset_follow_up_email on public.clients;
create trigger trg_clients_reset_follow_up_email
before update of next_follow_up_at on public.clients
for each row
execute function public.reset_follow_up_email_delivery();

commit;
