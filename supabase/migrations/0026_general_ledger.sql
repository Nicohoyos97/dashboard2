-- 0026_general_ledger.sql
-- The General Ledger behind a month's Profit & Loss: every transaction, by
-- account, as QuickBooks exports it. The firm uploads one per month with the
-- P&L, once the month is adjusted, and the client clicks a P&L account to see
-- the transactions that make it up.
--
-- Three rules shape this file.
--
--   1. The detail must add up to the statement. A ledger is published only
--      when every P&L account it covers carries exactly the figure the
--      published P&L prints (lib/ledger/match.ts) — the portal tells the
--      client "these add up to the figure on your statement", so it has to be
--      true to the cent.
--   2. The client sees the detail behind the P&L and nothing else. A ledger
--      also carries the bank, card, equity and liability accounts; those stay
--      with the firm. `client_visible` is set at publication on exactly the
--      accounts matched to a P&L line, and the member policies read it, so the
--      rule holds in the database and not only in the page.
--   3. The file is the firm's working paper, like a POS report (0025): its
--      figures reach the client, the CSV does not.

-- ── general_ledgers ──────────────────────────────────────────────────────────
-- One per document version. Publication and status mirror sales_reports.
create table public.general_ledgers (
  id                  uuid primary key default gen_random_uuid(),
  business_entity_id  uuid not null references public.business_entities (id) on delete cascade,
  period_start        date not null,
  period_end          date not null check (period_end >= period_start),
  -- Read from the export's footer ("Accrual Basis …"); null when it prints none.
  basis               text check (basis in ('cash', 'accrual')),
  currency            char(3) not null default 'USD',
  -- The company line the export prints, kept for the firm's review only.
  company_name        text,
  source              text not null default 'firm_document' check (source in ('firm_document')),
  document_version_id uuid references public.document_versions (id) on delete set null,
  status              text not null default 'needs_review' check (status in (
                        'uploaded', 'processing', 'needs_review', 'reconciled',
                        'ready_to_publish', 'published', 'failed', 'superseded')),
  reconciliation      jsonb,
  published_at        timestamptz,
  published_by        uuid references auth.users (id) on delete set null,
  superseded_by       uuid references public.general_ledgers (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check ((status = 'published') = (published_at is not null))
);

-- One published ledger per business and month. Unlike sales_reports this
-- leaves unpublished rows free: a corrected export uploaded as a new version
-- must be able to process while the old one is still what the client sees,
-- and publishing it supersedes the old one (lib/documents/publish.ts).
create unique index general_ledgers_published_period_idx
  on public.general_ledgers (business_entity_id, period_start, period_end)
  where status = 'published';
create index general_ledgers_entity_idx on public.general_ledgers (business_entity_id, period_end desc);
create index general_ledgers_version_idx on public.general_ledgers (document_version_id);

create trigger general_ledgers_set_updated_at
  before update on public.general_ledgers
  for each row execute function public.set_updated_at();

-- ── ledger_accounts ──────────────────────────────────────────────────────────
-- Each account section of the export, in file order, sub-accounts under their
-- parent. `printed_total` is the export's own "Total for …" line (for a parent,
-- the "with sub-accounts" total), kept so the parse can be checked against it.
create table public.ledger_accounts (
  id                  uuid primary key default gen_random_uuid(),
  ledger_id           uuid not null references public.general_ledgers (id) on delete cascade,
  business_entity_id  uuid not null references public.business_entities (id) on delete cascade,
  parent_id           uuid references public.ledger_accounts (id) on delete cascade,
  name                text not null,
  depth               smallint not null default 0 check (depth >= 0),
  position            integer not null,
  printed_total       numeric(18,2),
  -- What the parse adds up: its own transactions plus every sub-account's.
  -- Stored so matching against the P&L and counting for the client never has
  -- to read every transaction of the month.
  total               numeric(18,2) not null default 0,
  transaction_count   integer not null default 0 check (transaction_count >= 0),
  -- Set when the ledger is published, on the accounts matched to a P&L line.
  client_visible      boolean not null default false,
  created_at          timestamptz not null default now()
);

create index ledger_accounts_ledger_idx on public.ledger_accounts (ledger_id, position);

-- ── ledger_transactions ──────────────────────────────────────────────────────
-- One row per line of the export. Amounts keep the export's sign, which is the
-- account's own: a payment is positive in an expense account, a deposit is
-- positive in an income account, an adjustment that reduces either is negative.
create table public.ledger_transactions (
  id                  uuid primary key default gen_random_uuid(),
  ledger_id           uuid not null references public.general_ledgers (id) on delete cascade,
  account_id          uuid not null references public.ledger_accounts (id) on delete cascade,
  business_entity_id  uuid not null references public.business_entities (id) on delete cascade,
  txn_date            date not null,
  txn_type            text,
  num                 text,
  name                text,
  description         text,
  split               text,
  amount              numeric(18,2) not null,
  position            integer not null,
  created_at          timestamptz not null default now()
);

create index ledger_transactions_account_idx on public.ledger_transactions (account_id, txn_date desc, position);
create index ledger_transactions_ledger_idx on public.ledger_transactions (ledger_id);

-- ── publication helpers ──────────────────────────────────────────────────────
create or replace function public.general_ledger_is_published(ledger uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.general_ledgers where id = ledger and status = 'published'
  );
$$;

-- An account the client may read: its ledger is published and the firm's
-- publication matched it to a line of the P&L.
create or replace function public.ledger_account_is_client_visible(account uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.ledger_accounts a
    join public.general_ledgers l on l.id = a.ledger_id
    where a.id = account and a.client_visible and l.status = 'published'
  );
$$;

revoke execute on function public.general_ledger_is_published(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.general_ledger_is_published(uuid) to authenticated, service_role;
revoke execute on function public.ledger_account_is_client_visible(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.ledger_account_is_client_visible(uuid) to authenticated, service_role;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.general_ledgers     enable row level security;
alter table public.ledger_accounts     enable row level security;
alter table public.ledger_transactions enable row level security;

-- Archetype B: members read what is published (and, below the ledger, only the
-- P&L accounts), the firm reads and writes everything, nobody deletes through
-- a policy — the worker clears unpublished rows with the service role.
create policy "general_ledgers_member_select" on public.general_ledgers
  for select using (public.is_entity_member(business_entity_id) and status = 'published');
create policy "general_ledgers_firm_select" on public.general_ledgers
  for select using (public.is_firm_member());
create policy "general_ledgers_admin_insert" on public.general_ledgers
  for insert to authenticated with check (public.is_firm_admin());
create policy "general_ledgers_admin_update" on public.general_ledgers
  for update to authenticated using (public.is_firm_admin()) with check (public.is_firm_admin());

create policy "ledger_accounts_member_select" on public.ledger_accounts
  for select using (
    public.is_entity_member(business_entity_id) and client_visible and public.general_ledger_is_published(ledger_id)
  );
create policy "ledger_accounts_firm_select" on public.ledger_accounts
  for select using (public.is_firm_member());
create policy "ledger_accounts_admin_write" on public.ledger_accounts
  for all to authenticated using (public.is_firm_admin()) with check (public.is_firm_admin());

create policy "ledger_transactions_member_select" on public.ledger_transactions
  for select using (
    public.is_entity_member(business_entity_id) and public.ledger_account_is_client_visible(account_id)
  );
create policy "ledger_transactions_firm_select" on public.ledger_transactions
  for select using (public.is_firm_member());
create policy "ledger_transactions_admin_write" on public.ledger_transactions
  for all to authenticated using (public.is_firm_admin()) with check (public.is_firm_admin());

-- ── the file stays with the firm (0025) ──────────────────────────────────────
create or replace function public.document_type_is_client_visible(doc_type text)
returns boolean
language sql
immutable
as $$
  select doc_type not in ('sales_report', 'general_ledger');
$$;

-- ── the delete guard learns about the new table (0020, 0022) ─────────────────
create or replace function public.guard_document_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  published_rows integer;
begin
  select
    (select count(*) from public.financial_reports r
      join public.document_versions v on v.id = r.document_version_id
      where v.document_id = old.id and r.status = 'published')
  + (select count(*) from public.bank_statements b
      join public.document_versions v on v.id = b.document_version_id
      where v.document_id = old.id and b.status = 'published')
  + (select count(*) from public.sales_reports s
      join public.document_versions v on v.id = s.document_version_id
      where v.document_id = old.id and s.status = 'published')
  + (select count(*) from public.general_ledgers g
      join public.document_versions v on v.id = g.document_version_id
      where v.document_id = old.id and g.status = 'published')
  + (select count(*) from public.tax_obligations t
      join public.document_versions v on v.id = t.document_version_id
      where v.document_id = old.id and t.published_at is not null)
  + (select count(*) from public.tax_payments p
      join public.document_versions v on v.id = p.document_version_id
      where v.document_id = old.id and p.published_at is not null)
  + (select count(*) from public.payroll_obligations p
      join public.document_versions v on v.id = p.document_version_id
      where v.document_id = old.id and p.published_at is not null)
  + (select count(*) from public.reminders m
      join public.document_versions v on v.id = m.document_version_id
      where v.document_id = old.id and m.published_at is not null)
  into published_rows;

  if published_rows > 0 then
    raise exception 'document has % published figure(s) derived from it', published_rows
      using errcode = '23503';
  end if;
  return old;
end;
$$;

revoke execute on function public.guard_document_delete() from public, anon, authenticated, service_role;

-- ── the new document type ────────────────────────────────────────────────────
alter table public.documents drop constraint if exists documents_document_type_check;
alter table public.documents add constraint documents_document_type_check check (document_type in (
  'bank_statement', 'profit_and_loss', 'balance_sheet',
  'statement_package', 'sales_report', 'sales_tax_filing', 'sales_tax_payment',
  'income_tax_document', 'payroll_summary', 'csv_transactions', 'general_ledger',
  'other_report'
));
