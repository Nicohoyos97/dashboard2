-- 0030_indexes.sql
-- Indexes the app's queries and the database's own cascades already lean on.
-- Additive except one rebuild; every table here holds thousands of rows, not
-- millions, so each build takes milliseconds inside the migration.

-- ── bank_transactions (date, id) ─────────────────────────────────────────────
-- 0011 meant to extend this index with `id` for the Expenses page's
-- `order by txn_date desc, id`, but reused 0004's name with `if not exists`,
-- so Postgres kept the old two-column index and never built the new one.
drop index if exists public.bank_transactions_entity_date_idx;
create index bank_transactions_entity_date_idx
  on public.bank_transactions (business_entity_id, txn_date desc, id);

-- ── document_version_id ──────────────────────────────────────────────────────
-- Publishing, withdrawing, reprocessing (clearDerived), the delete guard and
-- recompute all filter these tables by the version that produced them, and
-- deleting a version sets the column to null through an ON DELETE SET NULL
-- that scans the table without an index.
create index if not exists bank_transactions_version_idx on public.bank_transactions (document_version_id);
create index if not exists statement_lines_version_idx on public.financial_statement_lines (document_version_id);
create index if not exists bank_statements_version_idx on public.bank_statements (document_version_id);
create index if not exists sales_reports_version_idx on public.sales_reports (document_version_id);
create index if not exists tax_obligations_version_idx on public.tax_obligations (document_version_id);
create index if not exists tax_payments_version_idx on public.tax_payments (document_version_id);
create index if not exists payroll_obligations_version_idx on public.payroll_obligations (document_version_id);
create index if not exists reminders_version_idx on public.reminders (document_version_id);

-- ── chat_citations ───────────────────────────────────────────────────────────
-- Every reprocess deletes the version's unpublished statement lines, and each
-- deleted line nulls the citations pointing at it: without these, one scan of
-- every citation ever written per line. Most citations carry none of the
-- three, hence partial.
create index if not exists chat_citations_line_idx on public.chat_citations (line_id) where line_id is not null;
create index if not exists chat_citations_report_idx on public.chat_citations (report_id) where report_id is not null;
create index if not exists chat_citations_version_idx on public.chat_citations (document_version_id) where document_version_id is not null;

-- ── audit_logs ───────────────────────────────────────────────────────────────
-- The firm's audit page reads the newest entries across every business; the
-- existing indexes both lead with a business or an actor.
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
