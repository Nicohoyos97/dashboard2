-- 0016_tax_reconciliation.sql
-- Somewhere to keep the reconciliation the pipeline already computes for a tax
-- record.
--
-- reconcileSalesTax() runs in pipeline.ts and its result is attached to the
-- extraction, but persistTax() drops it on the floor: tax_obligations had no
-- column for it, unlike financial_reports and bank_statements. With nowhere to
-- record whether the figures cross-check, publishBlockers had nothing to gate
-- on and publishDocument never published tax rows at all — a firm could upload,
-- extract and publish a sales-tax return and the client's Taxes pages stayed
-- empty for good.
--
-- Same shape and same reader as the other two tables (lib/documents/
-- reconciliation.ts): `{ passed, checks[], lowConfidence }`. Nullable, because
-- a row entered by hand carries no extraction to reconcile.
alter table public.tax_obligations
  add column reconciliation jsonb;

alter table public.payroll_obligations
  add column reconciliation jsonb;

comment on column public.tax_obligations.reconciliation is
  'Cross-checks on the extracted filing (taxable sales x rate = collected, collected - paid = payable). Null for a firm entry.';
comment on column public.payroll_obligations.reconciliation is
  'Cross-checks on the extracted payroll summary. Null for a firm entry.';
