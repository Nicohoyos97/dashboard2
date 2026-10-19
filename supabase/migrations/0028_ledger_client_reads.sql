-- 0028_ledger_client_reads.sql
-- What a client reads of a General Ledger: its period, and the accounts behind
-- their P&L — all of each account's transactions, sub-accounts included.
--
-- 1. The row itself is the firm's. `general_ledgers_member_select` handed a
--    client the whole published row, and two of its columns are working
--    papers: `reconciliation` holds one check per account in the file — name,
--    printed total, summed total — bank, card, equity and liability accounts
--    among them, which is exactly what 0026 rule 2 keeps with the firm; and
--    `company_name` is kept for the firm's review only. A policy cannot hide a
--    column, and the firm reads the same row as the same role, so the member
--    policy goes and `published_ledgers()` returns the three columns the portal
--    and Nick use (id and period), under the membership check the policy made.
--
-- 2. A collapsed parent's sub-accounts. When a P&L prints a parent account as
--    one line, the figure is the parent's total with every sub-account's in it
--    (lib/ledger/match.ts), so the transactions that make it up are the whole
--    subtree's. Publication made only the parent readable, and the client saw
--    the parent's own postings under the subtree's total. Publication now marks
--    the subtree (lib/documents/publish.ts); the backfill below does the same
--    for ledgers already published. Under the previous matcher a parent could
--    only be matched on its subtree's total, so every visible parent with
--    sub-accounts is such a line and the backfill is exact.

-- ── 1. the row ───────────────────────────────────────────────────────────────
drop policy "general_ledgers_member_select" on public.general_ledgers;

create or replace function public.published_ledgers(entity uuid)
returns table (id uuid, period_start date, period_end date)
language sql
stable
security definer
set search_path = public
as $$
  select g.id, g.period_start, g.period_end
    from public.general_ledgers g
   where g.business_entity_id = entity
     and g.status = 'published'
     and (public.is_entity_member(entity) or public.is_firm_member())
   order by g.period_end desc;
$$;

revoke execute on function public.published_ledgers(uuid) from public, anon;
grant  execute on function public.published_ledgers(uuid) to authenticated, service_role;

-- ── 2. sub-accounts of a published parent ────────────────────────────────────
with recursive visible as (
  select a.id
    from public.ledger_accounts a
    join public.general_ledgers g on g.id = a.ledger_id
   where a.client_visible and g.status = 'published'
  union
  select c.id
    from public.ledger_accounts c
    join visible v on c.parent_id = v.id
)
update public.ledger_accounts a
   set client_visible = true
  from visible v
 where a.id = v.id and not a.client_visible;

-- Deleting a ledger cascades through parent_id once per account; without an
-- index each of those is a scan of every tenant's accounts.
create index if not exists ledger_accounts_parent_idx
  on public.ledger_accounts (parent_id) where parent_id is not null;
