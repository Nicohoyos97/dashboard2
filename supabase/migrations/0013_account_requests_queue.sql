-- 0013_account_requests_queue.sql — the firm side of account requests
-- (INITIAL_PROMPT.md §7: data export / account deletion, queued for firm
-- confirmation).
--
-- 0007 gave the firm an UPDATE policy but nothing that constrains what a firm
-- write may do, so the queue's invariants held only as long as the app code
-- happened to be correct:
--   · a resolution always records who resolved it and when;
--   · a resolved or withdrawn request is never quietly reopened — it is the
--     firm's evidence that a request was answered;
--   · the client's own words (`kind`, `message`, `requested_at`) are never
--     edited by the firm, only replied to via `firm_note`.
-- The guard below enforces all three for every caller that is not the service
-- role. SECURITY INVOKER on purpose; is_firm_admin() is the definer helper.

create or replace function public.account_requests_guard()
returns trigger
language plpgsql as $$
declare
  is_client boolean := auth.role() = 'authenticated' and not public.is_firm_admin();
  is_firm   boolean := auth.role() = 'authenticated' and public.is_firm_admin();
  terminal  constant text[] := array['completed', 'declined', 'cancelled'];
begin
  if tg_op = 'INSERT' then
    if is_client then
      if new.firm_note is not null or new.resolved_at is not null or new.resolved_by is not null then
        raise exception 'account_requests: a client may only raise a request';
      end if;
      new.requested_at := now();
    end if;
    return new;
  end if;

  if is_client then
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
    return new;
  end if;

  if is_firm then
    if new.id                 is distinct from old.id
    or new.business_entity_id is distinct from old.business_entity_id
    or new.user_id            is distinct from old.user_id
    or new.kind               is distinct from old.kind
    or new.message            is distinct from old.message
    or new.requested_at       is distinct from old.requested_at
    then
      raise exception 'account_requests: the firm may only answer a request';
    end if;
    if old.status = any (terminal) and new.status is distinct from old.status then
      raise exception 'account_requests: a resolved request is not reopened';
    end if;
    if new.status = any (terminal) and old.status <> new.status then
      new.resolved_at := coalesce(new.resolved_at, now());
      new.resolved_by := coalesce(new.resolved_by, auth.uid());
    end if;
  end if;

  return new;
end;
$$;

-- The queue reads across every business, newest open request first.
create index if not exists account_requests_queue_idx
  on public.account_requests (requested_at desc)
  where status in ('pending', 'in_progress');
