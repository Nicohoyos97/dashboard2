-- 0007_portal_requests.sql — Settings for the client portal (Phase 5,
-- INITIAL_PROMPT.md §7 "Settings, Profile, Help").
--
-- Adds:
--   notification_preferences  per user, per business — which alerts they want
--   account_requests          data export / account deletion, queued for the firm
--
-- Nothing here deletes anything. An account-deletion request is a row the firm
-- acts on; the portal has no self-serve destructive path, so a client can never
-- remove financial records the firm is required to keep.

-- ── notification_preferences ─────────────────────────────────────────────────
-- Archetype C (self-only) with a membership check, so a row cannot be created
-- for a business the user does not belong to. The firm has no read: these are
-- personal delivery settings, not tenant financial data.
create table public.notification_preferences (
  user_id            uuid not null references auth.users (id) on delete cascade,
  business_entity_id uuid not null references public.business_entities (id) on delete cascade,
  reminders          boolean not null default true,   -- due dates and obligations
  new_reports        boolean not null default true,   -- a statement or document was published
  tax_deadlines      boolean not null default true,   -- filing and payment deadlines
  document_activity  boolean not null default false,  -- uploads, versions, supersessions
  email_digest       boolean not null default false,  -- weekly summary by email
  updated_at         timestamptz not null default now(),
  primary key (user_id, business_entity_id)
);

create index notification_preferences_entity_idx
  on public.notification_preferences (business_entity_id);

alter table public.notification_preferences enable row level security;

create policy "notification_prefs_self_select" on public.notification_preferences
  for select using (user_id = auth.uid() and public.is_entity_member(business_entity_id));

create policy "notification_prefs_self_insert" on public.notification_preferences
  for insert with check (user_id = auth.uid() and public.is_entity_member(business_entity_id));

-- WITH CHECK repeats the condition so an update cannot move the row to another
-- user or another business.
create policy "notification_prefs_self_update" on public.notification_preferences
  for update
  using (user_id = auth.uid() and public.is_entity_member(business_entity_id))
  with check (user_id = auth.uid() and public.is_entity_member(business_entity_id));

-- ── account_requests ─────────────────────────────────────────────────────────
create table public.account_requests (
  id                 uuid primary key default gen_random_uuid(),
  business_entity_id uuid not null references public.business_entities (id) on delete cascade,
  user_id            uuid not null references auth.users (id) on delete cascade,
  kind               text not null check (kind in ('data_export', 'account_deletion')),
  status             text not null default 'pending' check (status in (
                       'pending', 'in_progress', 'completed', 'declined', 'cancelled')),
  message            text,                    -- the client's own note to the firm
  firm_note          text,                    -- the firm's reply, shown to the client
  requested_at       timestamptz not null default now(),
  resolved_at        timestamptz,
  resolved_by        uuid references auth.users (id) on delete set null
);

create index account_requests_entity_idx
  on public.account_requests (business_entity_id, requested_at desc);
create index account_requests_user_idx
  on public.account_requests (user_id, requested_at desc);

-- One open request of each kind at a time, so a client cannot queue the firm
-- with duplicates by refreshing the form.
create unique index account_requests_open_idx
  on public.account_requests (user_id, business_entity_id, kind)
  where status in ('pending', 'in_progress');

alter table public.account_requests enable row level security;

create policy "account_requests_select" on public.account_requests
  for select using (
    (user_id = auth.uid() and public.is_entity_member(business_entity_id))
    or public.is_firm_member()
  );

create policy "account_requests_self_insert" on public.account_requests
  for insert with check (
    user_id = auth.uid()
    and public.is_entity_member(business_entity_id)
    and status = 'pending'
  );

-- The client may withdraw a request they raised and nothing else: the WITH
-- CHECK pins the post-image to 'cancelled', and the trigger below freezes every
-- other column so this cannot become a general-purpose edit path.
create policy "account_requests_self_cancel" on public.account_requests
  for update
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid() and status = 'cancelled');

create policy "account_requests_firm_update" on public.account_requests
  for update using (public.is_firm_admin()) with check (public.is_firm_admin());

-- No delete policy: a request is history the firm may have to evidence.

-- SECURITY INVOKER on purpose; is_firm_admin() is the definer helper.
create or replace function public.account_requests_guard()
returns trigger
language plpgsql as $$
begin
  if auth.role() = 'authenticated' and not public.is_firm_admin() and (
       new.id                 is distinct from old.id
    or new.business_entity_id is distinct from old.business_entity_id
    or new.user_id            is distinct from old.user_id
    or new.kind               is distinct from old.kind
    or new.message            is distinct from old.message
    or new.firm_note          is distinct from old.firm_note
    or new.requested_at       is distinct from old.requested_at
    or new.resolved_by        is distinct from old.resolved_by
  ) then
    raise exception 'account_requests: a client may only withdraw a request';
  end if;
  return new;
end;
$$;

create trigger account_requests_guard_trg
  before update on public.account_requests
  for each row execute function public.account_requests_guard();
