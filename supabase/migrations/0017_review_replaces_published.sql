-- 0017_review_replaces_published.sql
-- Let a replacement statement exist while the one it replaces is still live.
--
-- bank_statements_period_idx enforced one statement per account and period
-- across every status except superseded/failed, so a second version of an
-- already-published bank statement could not even be extracted: the insert
-- collided with the published row, the worker burned all three attempts, and
-- the document was stuck. Combined with the review pointer following
-- current_version_id (see lib/documents/publish.ts), replacing a published
-- document was a dead end.
--
-- The invariant that actually matters is that the client never sees two live
-- statements for the same account and period — that is about *published* rows.
-- A draft under review alongside the published one it will replace is the
-- normal state of a correction, not a conflict.
drop index if exists public.bank_statements_period_idx;

create unique index bank_statements_period_idx
  on public.bank_statements (bank_account_id, period_start, period_end)
  where status = 'published';

comment on index public.bank_statements_period_idx is
  'One published statement per account and period. Drafts may coexist with the published row they replace.';
