-- 0022_sales_reports.sql
-- Point-of-sale sales reports (Clover, Toast, Square, Stripe), and the rule
-- about where a sales-tax figure is allowed to come from.
--
-- Two documents describe the same month and they are not interchangeable:
--
--   the POS report  says what was sold — gross and net sales, refunds, tips,
--                   tax collected, and how it was paid for.
--   the state filing says what is owed — the payment due, and nothing else we
--                   should believe about sales.
--
-- Keeping them apart is §3 ("sources never mix") applied to sales tax, and it
-- is not theoretical. On the first real month of data the filing reported
-- $12,955.00 of receipts where the POS reported $14,119.36 of gross sales —
-- the filed figure matched one tender line (cards) to the dollar, with cash
-- left out. Reading sales off the filing would have shown that client $12,955
-- as their July sales. So the extractor takes `amount_payable` from a filing
-- and its sales figures from here.

-- ── sales_reports ────────────────────────────────────────────────────────────
-- Publication and status mirror bank_statements exactly: the firm reviews,
-- then publishes, and the client sees only what is published.
create table public.sales_reports (
  id                  uuid primary key default gen_random_uuid(),
  business_entity_id  uuid not null references public.business_entities (id) on delete cascade,
  source_system       text not null check (source_system in ('clover', 'toast', 'square', 'stripe', 'other')),
  period_start        date not null,
  period_end          date not null check (period_end >= period_start),
  currency            char(3) not null default 'USD',
  -- What the report prints. Every one of these is optional because no two POS
  -- vendors print the same set, and a figure we did not read must stay null
  -- rather than become a zero somebody could mistake for a fact.
  gross_sales         numeric(18,2),
  net_sales           numeric(18,2),
  refunds             numeric(18,2),
  discounts           numeric(18,2),
  tips                numeric(18,2),
  tax_collected       numeric(18,2),
  tax_expected        numeric(18,2),
  amount_collected    numeric(18,2),
  order_count         integer check (order_count is null or order_count >= 0),
  source              text not null check (source in ('firm_document', 'firm_entry')),
  document_version_id uuid references public.document_versions (id) on delete set null,
  page_number         integer,
  confidence          numeric(4,3) check (confidence between 0 and 1),
  status              text not null default 'needs_review' check (status in (
                        'uploaded', 'processing', 'needs_review', 'reconciled',
                        'ready_to_publish', 'published', 'failed', 'superseded')),
  reconciliation      jsonb,
  published_at        timestamptz,
  published_by        uuid references auth.users (id) on delete set null,
  superseded_by       uuid references public.sales_reports (id) on delete set null,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check ((status = 'published') = (published_at is not null))
);

-- One live report per business and period, the same duplicate guard
-- bank_statements has. Re-uploading a month replaces it; it does not add a
-- second truth about the same weeks.
create unique index sales_reports_period_idx
  on public.sales_reports (business_entity_id, period_start, period_end)
  where status not in ('superseded', 'failed');
create index sales_reports_entity_idx on public.sales_reports (business_entity_id, period_end desc);

create trigger sales_reports_set_updated_at
  before update on public.sales_reports
  for each row execute function public.set_updated_at();

-- ── sales_report_tenders ─────────────────────────────────────────────────────
-- How the money arrived: cards, cash, DoorDash, Uber Eats. Their sum is what
-- reconciliation checks against `amount_collected`, and the labels are the
-- vendor's own — normalising them would invent categories the report did not
-- print.
create table public.sales_report_tenders (
  id                  uuid primary key default gen_random_uuid(),
  sales_report_id     uuid not null references public.sales_reports (id) on delete cascade,
  business_entity_id  uuid not null references public.business_entities (id) on delete cascade,
  label               text not null,
  amount              numeric(18,2) not null,
  position            integer not null default 0,
  created_at          timestamptz not null default now()
);

create index sales_report_tenders_report_idx on public.sales_report_tenders (sales_report_id, position);

-- ── publication helper, mirroring bank_statement_is_published ────────────────
create or replace function public.sales_report_is_published(report uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sales_reports where id = report and status = 'published'
  );
$$;

revoke execute on function public.sales_report_is_published(uuid) from public, anon, authenticated, service_role;
grant  execute on function public.sales_report_is_published(uuid) to authenticated, service_role;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.sales_reports        enable row level security;
alter table public.sales_report_tenders enable row level security;

-- Archetype B: members read what is published, the firm reads and writes
-- everything, nobody deletes through a policy.
create policy "sales_reports_member_select" on public.sales_reports
  for select using (public.is_entity_member(business_entity_id) and status = 'published');
create policy "sales_reports_firm_select" on public.sales_reports
  for select using (public.is_firm_member());
create policy "sales_reports_admin_insert" on public.sales_reports
  for insert to authenticated with check (public.is_firm_admin());
create policy "sales_reports_admin_update" on public.sales_reports
  for update to authenticated using (public.is_firm_admin()) with check (public.is_firm_admin());

create policy "sales_report_tenders_member_select" on public.sales_report_tenders
  for select using (
    public.is_entity_member(business_entity_id) and public.sales_report_is_published(sales_report_id)
  );
create policy "sales_report_tenders_firm_select" on public.sales_report_tenders
  for select using (public.is_firm_member());
create policy "sales_report_tenders_admin_write" on public.sales_report_tenders
  for all to authenticated using (public.is_firm_admin()) with check (public.is_firm_admin());

-- ── one sales-tax obligation per period ──────────────────────────────────────
-- The POS report fills the sales half of an obligation and the filing fills
-- `amount_payable`, so both have to find the same row — and there was nothing
-- stopping a reprocess from writing a second one. That is not hypothetical
-- either: a client's Sales Taxes page showed the July obligation twice, from
-- one document processed twice, because this index did not exist.
--
-- `nulls not distinct` because jurisdiction_id is usually null: without it two
-- rows with no jurisdiction would not collide, which is exactly the case that
-- went wrong.
create unique index tax_obligations_period_idx
  on public.tax_obligations (business_entity_id, tax_type, jurisdiction_id, period_start, period_end)
  nulls not distinct
  where status <> 'pending_review' and period_start is not null;

-- ── the delete guard learns about the new table (0020) ───────────────────────
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
  'income_tax_document', 'payroll_summary', 'csv_transactions',
  'other_report'
));
