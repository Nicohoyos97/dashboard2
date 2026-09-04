-- 0014_deadline_notifications.sql — producers for the reminder and tax-deadline
-- notification channels (INITIAL_PROMPT.md §7 Settings → Notifications).
--
-- Until now three of the five switches governed nothing: only document.published
-- had a producer. A daily job (app/api/jobs/notify-deadlines) now walks each
-- business in ITS OWN time zone and notifies members about obligations coming
-- due. Two things it needs from the database:
--
-- 1. `notifications.payload` — the row stores the *facts* (a due date, a tax
--    type), not an English sentence. The bell renders the wording through
--    next-intl in the reader's locale, so a Spanish client never reads a
--    notification frozen in the language the job happened to run in.
-- 2. `notification_dispatches` — one row per (kind, resource, milestone), so a
--    deadline is announced once however often the job runs. The primary key is
--    the idempotency: the job claims the milestone before it sends, and
--    releases the claim if the send fails.

alter table public.notifications add column if not exists payload jsonb;

create table public.notification_dispatches (
  kind               text not null,
  resource_id        uuid not null,
  milestone          text not null check (milestone in ('due_in_7', 'due_today')),
  business_entity_id uuid not null references public.business_entities (id) on delete cascade,
  sent_at            timestamptz not null default now(),
  primary key (kind, resource_id, milestone)
);

create index notification_dispatches_entity_idx
  on public.notification_dispatches (business_entity_id, sent_at desc);

-- System bookkeeping, not tenant data: RLS on with no policies at all, so only
-- the service role (which bypasses it) can read or write — the same shape as
-- `rate_limits`. Nothing here is a financial figure or a name.
alter table public.notification_dispatches enable row level security;
