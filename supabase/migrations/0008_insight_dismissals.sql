-- 0008_insight_dismissals.sql — Checking an insight off the Overview
-- (INITIAL_PROMPT.md §7 Insights).
--
-- Insights are derived, not stored: `generateInsights` recomputes them from
-- published figures on every render, so there is no row to flag. What is worth
-- keeping is the human act — "I have seen this one" — which this table records
-- against the rule and the period it was raised for.
--
-- Per user on purpose: one member ticking a line off must not hide it from
-- another. The `insights` table added in 0005 carries a per-business
-- `dismissed_at` for a future job that persists generated insights; this table
-- is the client-side acknowledgement and does not replace it.

create table public.insight_dismissals (
  user_id            uuid not null references auth.users (id) on delete cascade,
  business_entity_id uuid not null references public.business_entities (id) on delete cascade,
  rule_key           text not null,
  -- The period the rule was evaluated over. A rule that is not period-bound
  -- (a due date, a report awaiting review) is recorded against the period the
  -- client was looking at, so it comes back when a new period is published.
  period_start       date not null,
  period_end         date not null,
  dismissed_at       timestamptz not null default now(),
  primary key (user_id, business_entity_id, rule_key, period_start, period_end)
);

create index insight_dismissals_entity_idx
  on public.insight_dismissals (business_entity_id, user_id);

alter table public.insight_dismissals enable row level security;

-- Archetype C with a membership check: a row can only ever be the caller's own,
-- and only for a business they belong to.
create policy "insight_dismissals_self_select" on public.insight_dismissals
  for select using (user_id = auth.uid() and public.is_entity_member(business_entity_id));

create policy "insight_dismissals_self_insert" on public.insight_dismissals
  for insert with check (user_id = auth.uid() and public.is_entity_member(business_entity_id));

-- Un-checking is a delete of your own row; there is nothing to update.
create policy "insight_dismissals_self_delete" on public.insight_dismissals
  for delete using (user_id = auth.uid() and public.is_entity_member(business_entity_id));
