-- 0004_financials.sql — Financial statements and bank activity
-- (INITIAL_PROMPT.md §5, §9).
--
--   financial_periods           periods that have data (drives the period selector)
--   financial_reports           one P&L or Balance Sheet per period (+ status, reconciliation)
--   financial_statement_lines   the statement, hierarchy via parent_line_id / depth
--   bank_accounts, bank_statements, bank_transactions, expense_categories
--
-- Every derived row carries source, document_version_id, page_number,
-- confidence, published_at / published_by, superseded_by (spec §5). Money is
-- numeric(18,2); TypeScript works in integer cents (docs/PLAN.md §3).
--
-- Client visibility = PUBLISHED rows only, enforced here, not in the UI:
-- reports / statements check their own status; lines / transactions follow
-- their parent through the report_is_published() helpers.

-- ── financial_periods ────────────────────────────────────────────────────────
create table public.financial_periods (
  id                 uuid primary key default gen_random_uuid(),
  business_entity_id uuid not null references public.business_entities (id) on delete cascade,
  period_type        text not null check (period_type in ('month', 'quarter', 'year', 'custom')),
  start_date         date not null,
  end_date           date not null check (end_date >= start_date),
  fiscal_year        integer,
  label              text,
  created_at         timestamptz not null default now(),
  unique (business_entity_id, period_type, start_date, end_date)
);

create index financial_periods_entity_idx on public.financial_periods (business_entity_id, end_date desc);

-- ── financial_reports ────────────────────────────────────────────────────────
create table public.financial_reports (
  id                       uuid primary key default gen_random_uuid(),
  business_entity_id       uuid not null references public.business_entities (id) on delete cascade,
  report_type              text not null check (report_type in ('profit_and_loss', 'balance_sheet')),
  basis                    text check (basis in ('cash', 'accrual')),
  currency                 char(3) not null default 'USD',
  period_start             date not null,
  period_end               date not null check (period_end >= period_start),
  statement_date           date,
  comparative_start        date,
  comparative_end          date,
  entity_name_on_statement text,
  source                   text not null check (source in ('firm_document', 'firm_entry')),
  document_version_id      uuid references public.document_versions (id) on delete set null,
  status                   text not null default 'needs_review' check (status in (
                             'uploaded', 'processing', 'needs_review', 'reconciled',
                             'ready_to_publish', 'published', 'failed', 'superseded')),
  reconciliation           jsonb,          -- { passed: bool, checks: [{ key, ok, expected, actual, tolerance }] }
  confidence               numeric(4,3) check (confidence between 0 and 1),
  warnings                 jsonb not null default '[]'::jsonb,
  published_at             timestamptz,
  published_by             uuid references auth.users (id) on delete set null,
  superseded_by            uuid references public.financial_reports (id) on delete set null,
  created_by               uuid references auth.users (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check ((status = 'published') = (published_at is not null))
);

create index financial_reports_entity_idx
  on public.financial_reports (business_entity_id, report_type, period_end desc);
create index financial_reports_version_idx on public.financial_reports (document_version_id);

create trigger financial_reports_set_updated_at
  before update on public.financial_reports
  for each row execute function public.set_updated_at();

-- ── financial_statement_lines ────────────────────────────────────────────────
-- extracted_* keep what the model read; current / prior are the effective
-- values after a firm correction (corrected_by / corrected_at).
create table public.financial_statement_lines (
  id                  uuid primary key default gen_random_uuid(),
  report_id           uuid not null references public.financial_reports (id) on delete cascade,
  business_entity_id  uuid not null references public.business_entities (id) on delete cascade,
  parent_line_id      uuid references public.financial_statement_lines (id) on delete cascade,
  position            integer not null,
  depth               integer not null default 0 check (depth >= 0),
  section             text,
  account_name        text not null,
  account_number      text,
  current             numeric(18,2),
  prior               numeric(18,2),
  extracted_current   numeric(18,2),
  extracted_prior     numeric(18,2),
  is_section          boolean not null default false,
  is_total            boolean not null default false,
  page_number         integer check (page_number >= 1),
  source_text         text,
  confidence          numeric(4,3) check (confidence between 0 and 1),
  source              text not null default 'firm_document' check (source in ('firm_document', 'firm_entry')),
  document_version_id uuid references public.document_versions (id) on delete set null,
  corrected_by        uuid references auth.users (id) on delete set null,
  corrected_at        timestamptz,
  created_at          timestamptz not null default now(),
  unique (report_id, position)
);

create index statement_lines_report_idx on public.financial_statement_lines (report_id, position);
create index statement_lines_entity_idx on public.financial_statement_lines (business_entity_id, report_id);
create index statement_lines_parent_idx on public.financial_statement_lines (parent_line_id);

-- ── bank_accounts / bank_statements / bank_transactions ─────────────────────
create table public.bank_accounts (
  id                 uuid primary key default gen_random_uuid(),
  business_entity_id uuid not null references public.business_entities (id) on delete cascade,
  institution        text not null,
  masked_number      text not null,          -- e.g. "••••1234"; never the full number
  account_type       text check (account_type in ('checking', 'savings', 'credit_card', 'loan', 'other')),
  currency           char(3) not null default 'USD',
  created_at         timestamptz not null default now(),
  unique (business_entity_id, institution, masked_number)
);

-- A statement period for one account. CSV exports get kind = 'csv_export' so
-- every transaction has a parent that carries publication + reconciliation.
create table public.bank_statements (
  id                  uuid primary key default gen_random_uuid(),
  business_entity_id  uuid not null references public.business_entities (id) on delete cascade,
  bank_account_id     uuid not null references public.bank_accounts (id) on delete cascade,
  kind                text not null default 'statement' check (kind in ('statement', 'csv_export')),
  period_start        date not null,
  period_end          date not null check (period_end >= period_start),
  beginning_balance   numeric(18,2),
  ending_balance      numeric(18,2),
  source              text not null check (source in ('firm_document', 'firm_entry')),
  document_version_id uuid references public.document_versions (id) on delete set null,
  status              text not null default 'needs_review' check (status in (
                        'uploaded', 'processing', 'needs_review', 'reconciled',
                        'ready_to_publish', 'published', 'failed', 'superseded')),
  reconciliation      jsonb,
  confidence          numeric(4,3) check (confidence between 0 and 1),
  published_at        timestamptz,
  published_by        uuid references auth.users (id) on delete set null,
  superseded_by       uuid references public.bank_statements (id) on delete set null,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check ((status = 'published') = (published_at is not null))
);

-- Duplicate detection by (account, period) among live statements (spec §9).
create unique index bank_statements_period_idx
  on public.bank_statements (bank_account_id, period_start, period_end)
  where status not in ('superseded', 'failed');
create index bank_statements_entity_idx on public.bank_statements (business_entity_id, period_end desc);

create trigger bank_statements_set_updated_at
  before update on public.bank_statements
  for each row execute function public.set_updated_at();

create table public.expense_categories (
  id                 uuid primary key default gen_random_uuid(),
  business_entity_id uuid not null references public.business_entities (id) on delete cascade,
  name               text not null,
  kind               text not null default 'operating' check (kind in (
                       'operating', 'cogs', 'payroll', 'occupancy', 'marketing',
                       'professional_services', 'other')),
  parent_id          uuid references public.expense_categories (id) on delete set null,
  is_fixed           boolean,
  created_at         timestamptz not null default now(),
  unique (business_entity_id, name)
);

create table public.bank_transactions (
  id                     uuid primary key default gen_random_uuid(),
  business_entity_id     uuid not null references public.business_entities (id) on delete cascade,
  bank_account_id        uuid not null references public.bank_accounts (id) on delete cascade,
  bank_statement_id      uuid not null references public.bank_statements (id) on delete cascade,
  txn_date               date not null,
  posting_date           date,
  description            text not null,
  normalized_description text,
  debit                  numeric(18,2) check (debit >= 0),
  credit                 numeric(18,2) check (credit >= 0),
  running_balance        numeric(18,2),
  category_id            uuid references public.expense_categories (id) on delete set null,
  vendor                 text,
  is_recurring           boolean,
  page_number            integer check (page_number >= 1),
  confidence             numeric(4,3) check (confidence between 0 and 1),
  source                 text not null default 'firm_document' check (source in ('firm_document', 'firm_entry')),
  document_version_id    uuid references public.document_versions (id) on delete set null,
  dedupe_key             text not null,      -- sha256(date|amount|normalized description|account)
  created_at             timestamptz not null default now(),
  unique (business_entity_id, dedupe_key),
  check (debit is not null or credit is not null)
);

create index bank_transactions_entity_date_idx on public.bank_transactions (business_entity_id, txn_date desc);
create index bank_transactions_statement_idx   on public.bank_transactions (bank_statement_id);
create index bank_transactions_category_idx    on public.bank_transactions (category_id);

-- ── publication helpers (used by child-row policies) ─────────────────────────
create or replace function public.report_is_published(report uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.financial_reports where id = report and status = 'published'
  );
$$;

create or replace function public.bank_statement_is_published(statement uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.bank_statements where id = statement and status = 'published'
  );
$$;

revoke execute on function public.report_is_published(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.report_is_published(uuid) to authenticated, service_role;

revoke execute on function public.bank_statement_is_published(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.bank_statement_is_published(uuid) to authenticated, service_role;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.financial_periods         enable row level security;
alter table public.financial_reports         enable row level security;
alter table public.financial_statement_lines enable row level security;
alter table public.bank_accounts             enable row level security;
alter table public.bank_statements           enable row level security;
alter table public.expense_categories        enable row level security;
alter table public.bank_transactions         enable row level security;

-- financial_periods — B: members read, firm admin writes.
create policy "periods_member_select" on public.financial_periods
  for select using (public.is_entity_member(business_entity_id) or public.is_firm_member());
create policy "periods_admin_insert" on public.financial_periods
  for insert with check (public.is_firm_admin());
create policy "periods_admin_update" on public.financial_periods
  for update using (public.is_firm_admin()) with check (public.is_firm_admin());
create policy "periods_admin_delete" on public.financial_periods
  for delete using (public.is_firm_admin());

-- financial_reports — B: members read PUBLISHED; firm admin writes; no delete.
create policy "reports_member_select" on public.financial_reports
  for select using (
    (public.is_entity_member(business_entity_id) and status = 'published')
    or public.is_firm_member()
  );
create policy "reports_admin_insert" on public.financial_reports
  for insert with check (public.is_firm_admin());
create policy "reports_admin_update" on public.financial_reports
  for update using (public.is_firm_admin()) with check (public.is_firm_admin());

-- financial_statement_lines — A for clients (read via published parent); the
-- worker (service role) inserts; firm admin corrects and enters firm_entry lines.
create policy "lines_member_select" on public.financial_statement_lines
  for select using (
    (public.is_entity_member(business_entity_id) and public.report_is_published(report_id))
    or public.is_firm_member()
  );
create policy "lines_admin_insert" on public.financial_statement_lines
  for insert with check (public.is_firm_admin());
create policy "lines_admin_update" on public.financial_statement_lines
  for update using (public.is_firm_admin()) with check (public.is_firm_admin());
create policy "lines_admin_delete" on public.financial_statement_lines
  for delete using (public.is_firm_admin());

-- bank_accounts — B.
create policy "bank_accounts_member_select" on public.bank_accounts
  for select using (public.is_entity_member(business_entity_id) or public.is_firm_member());
create policy "bank_accounts_admin_insert" on public.bank_accounts
  for insert with check (public.is_firm_admin());
create policy "bank_accounts_admin_update" on public.bank_accounts
  for update using (public.is_firm_admin()) with check (public.is_firm_admin());

-- bank_statements — B: members read PUBLISHED; no delete.
create policy "bank_statements_member_select" on public.bank_statements
  for select using (
    (public.is_entity_member(business_entity_id) and status = 'published')
    or public.is_firm_member()
  );
create policy "bank_statements_admin_insert" on public.bank_statements
  for insert with check (public.is_firm_admin());
create policy "bank_statements_admin_update" on public.bank_statements
  for update using (public.is_firm_admin()) with check (public.is_firm_admin());

-- expense_categories — B.
create policy "categories_member_select" on public.expense_categories
  for select using (public.is_entity_member(business_entity_id) or public.is_firm_member());
create policy "categories_admin_insert" on public.expense_categories
  for insert with check (public.is_firm_admin());
create policy "categories_admin_update" on public.expense_categories
  for update using (public.is_firm_admin()) with check (public.is_firm_admin());
create policy "categories_admin_delete" on public.expense_categories
  for delete using (public.is_firm_admin());

-- bank_transactions — A for clients (read via published statement); worker
-- inserts; firm admin categorizes / fixes / removes duplicates.
create policy "transactions_member_select" on public.bank_transactions
  for select using (
    (public.is_entity_member(business_entity_id) and public.bank_statement_is_published(bank_statement_id))
    or public.is_firm_member()
  );
create policy "transactions_admin_insert" on public.bank_transactions
  for insert with check (public.is_firm_admin());
create policy "transactions_admin_update" on public.bank_transactions
  for update using (public.is_firm_admin()) with check (public.is_firm_admin());
create policy "transactions_admin_delete" on public.bank_transactions
  for delete using (public.is_firm_admin());
