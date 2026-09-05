-- 0023_document_pages_sales_report.sql
-- The classifier can say `sales_report`; document_pages could not store it.
--
-- 0022 added the new report type to the Zod enum and to
-- `documents.document_type`, and missed the CHECK on `document_pages`. So the
-- first real Clover report uploaded to production classified correctly, then
-- failed at `persist_pages` — the constraint refused the very label the
-- classifier had just produced, three attempts in a row.
--
-- The list here is REPORT_TYPES in lib/ingestion/schemas/classification.ts.
-- tests/unit/ingestion/report-types.test.ts now compares the two, because the
-- enum and the constraint are two copies of one fact and nothing was checking
-- that they still agreed.
alter table public.document_pages drop constraint if exists document_pages_report_type_check;
alter table public.document_pages add constraint document_pages_report_type_check check (
  report_type = any (array[
    'profit_and_loss', 'balance_sheet', 'bank_statement',
    'sales_report', 'sales_tax', 'income_tax', 'payroll', 'other'
  ])
);
