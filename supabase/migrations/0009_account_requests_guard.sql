-- 0009_account_requests_guard.sql — Closes two gaps the audit found in 0007.
--
-- 1. The guard froze the firm's columns on UPDATE only. Nothing constrained
--    them on INSERT, so a client could raise a request already carrying a
--    firm reply, a resolver, a resolution time or a back-dated requested_at.
--    No consumer read those columns yet, but the firm queue that will must be
--    able to trust them.
-- 2. A client's withdrawal left resolved_at null, so "history the firm may
--    have to evidence" recorded no time for the one transition a client makes.
--
-- The guard now runs on INSERT too, refuses firm-owned columns from a client,
-- stamps requested_at itself, and stamps resolved_at when a client withdraws.
-- SECURITY INVOKER on purpose; is_firm_admin() is the definer helper.

create or replace function public.account_requests_guard()
returns trigger
language plpgsql as $$
declare
  client_write boolean := auth.role() = 'authenticated' and not public.is_firm_admin();
begin
  if tg_op = 'INSERT' then
    if client_write then
      if new.firm_note is not null or new.resolved_at is not null or new.resolved_by is not null then
        raise exception 'account_requests: a client may only raise a request';
      end if;
      new.requested_at := now();
    end if;
    return new;
  end if;

  if client_write then
    if new.id                 is distinct from old.id
    or new.business_entity_id is distinct from old.business_entity_id
    or new.user_id            is distinct from old.user_id
    or new.kind               is distinct from old.kind
    or new.message            is distinct from old.message
    or new.firm_note          is distinct from old.firm_note
    or new.requested_at       is distinct from old.requested_at
    or new.resolved_at        is distinct from old.resolved_at
    or new.resolved_by        is distinct from old.resolved_by
    then
      raise exception 'account_requests: a client may only withdraw a request';
    end if;
    if new.status = 'cancelled' and old.status <> 'cancelled' then
      new.resolved_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists account_requests_guard_trg on public.account_requests;
create trigger account_requests_guard_trg
  before insert or update on public.account_requests
  for each row execute function public.account_requests_guard();
