// Persistence of pipeline output (docs/PLAN.md §3.4). Runs with the service
// role inside the worker; every row names its business_entity_id. Re-running
// a job first clears the unpublished derived rows of that version, so
// processing is idempotent. Money arrives as integer cents and is stored in
// numeric(18,2) as cents / 100.
import { randomUUID } from 'node:crypto';

import type Anthropic from '@anthropic-ai/sdk';

import { toCents } from '@/lib/money';
import type { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/lib/supabase/types';

import { applyCsvMapping, dedupeKey, normalizeDescription, parseCsv, proposeCsvMapping } from './csv';
import type { PipelineOutput, PipelineResult } from './pipeline';
import type { Reconciliation } from './reconciliation';
import type { ClassifiedPage } from './schemas/classification';

type Admin = ReturnType<typeof createAdminClient>;

export type PersistContext = {
  versionId: string;
  documentId: string;
  entityId: string;
  currency: string;
};

export type PersistSummary = { results: number; passed: boolean; warnings: string[] };

export class WorkerError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'WorkerError';
  }
}

const money = (cents: number | null): number | null => (cents === null ? null : cents / 100);
const centsOf = (value: string | null | undefined): number | null =>
  value === null || value === undefined ? null : toCents(value);
const asJson = (value: Reconciliation): Json => JSON.parse(JSON.stringify(value)) as Json;
const CHUNK = 200;

export async function clearDerived(admin: Admin, versionId: string): Promise<void> {
  await admin.from('document_pages').delete().eq('document_version_id', versionId);
  await admin.from('financial_reports').delete().eq('document_version_id', versionId).neq('status', 'published');
  await admin.from('bank_statements').delete().eq('document_version_id', versionId).neq('status', 'published');
  await admin.from('tax_obligations').delete().eq('document_version_id', versionId).is('published_at', null);
}

export async function persistPages(admin: Admin, ctx: PersistContext, pages: readonly ClassifiedPage[]): Promise<void> {
  if (pages.length === 0) return;
  const now = new Date().toISOString();
  const { error } = await admin.from('document_pages').insert(
    pages.map((p) => ({
      document_version_id: ctx.versionId,
      business_entity_id: ctx.entityId,
      page_number: p.page,
      kind: p.kind,
      report_type: p.report_type ?? null,
      period_start: p.period_start ?? null,
      period_end: p.period_end ?? null,
      confidence: p.confidence,
      classified_at: now,
    })),
  );
  if (error) throw new WorkerError('persist_pages');
}

async function persistStatement(
  admin: Admin,
  ctx: PersistContext,
  r: Extract<PipelineResult, { kind: 'financial_statement' }>,
  warnings: string[],
): Promise<void> {
  const { data, hierarchy, reconciliation } = r;
  const { data: dup } = await admin
    .from('financial_reports')
    .select('id')
    .eq('business_entity_id', ctx.entityId)
    .eq('report_type', data.report_type)
    .eq('period_start', data.period_start)
    .eq('period_end', data.period_end)
    .neq('document_version_id', ctx.versionId)
    .not('status', 'in', '(superseded,failed)')
    .limit(1);
  if ((dup ?? []).length > 0) warnings.push(`duplicate_period:${data.report_type}`);

  const confidence = Math.min(1, ...hierarchy.rows.map((row) => row.confidence));
  const { data: report, error } = await admin
    .from('financial_reports')
    .insert({
      business_entity_id: ctx.entityId,
      report_type: data.report_type,
      basis: data.basis ?? null,
      currency: data.currency,
      period_start: data.period_start,
      period_end: data.period_end,
      statement_date: data.statement_date ?? null,
      comparative_start: data.comparative_start ?? null,
      comparative_end: data.comparative_end ?? null,
      entity_name_on_statement: data.entity_name,
      source: 'firm_document',
      document_version_id: ctx.versionId,
      status: reconciliation.passed ? 'reconciled' : 'needs_review',
      reconciliation: asJson(reconciliation),
      confidence,
      warnings: [...data.warnings, ...hierarchy.warnings] as Json,
    })
    .select('id')
    .single();
  if (error || !report) throw new WorkerError('persist_report');

  const ids = hierarchy.rows.map(() => randomUUID());
  const rows = hierarchy.rows.map((row, i) => ({
    id: ids[i] ?? randomUUID(),
    report_id: report.id,
    business_entity_id: ctx.entityId,
    parent_line_id: row.parentIndex === null ? null : (ids[row.parentIndex] ?? null),
    position: row.position,
    depth: row.depth,
    section: row.section,
    account_name: row.account_name,
    account_number: row.account_number ?? null,
    current: money(row.currentCents),
    prior: money(row.priorCents),
    extracted_current: money(row.currentCents),
    extracted_prior: money(row.priorCents),
    is_section: row.is_section,
    is_total: row.is_total,
    page_number: row.page,
    source_text: row.source_text,
    confidence: row.confidence,
    source: 'firm_document',
    document_version_id: ctx.versionId,
  }));
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error: lineError } = await admin.from('financial_statement_lines').insert(rows.slice(i, i + CHUNK));
    if (lineError) throw new WorkerError('persist_lines');
  }
}

async function bankAccountId(admin: Admin, ctx: PersistContext, institution: string, masked: string): Promise<string> {
  const { data, error } = await admin
    .from('bank_accounts')
    .upsert(
      { business_entity_id: ctx.entityId, institution, masked_number: masked, currency: ctx.currency },
      { onConflict: 'business_entity_id,institution,masked_number' },
    )
    .select('id')
    .single();
  if (error || !data) throw new WorkerError('persist_account');
  return data.id;
}

type TxInsert = {
  date: string;
  postingDate: string | null;
  description: string;
  debitCents: number | null;
  creditCents: number | null;
  balanceCents: number | null;
  page: number | null;
  confidence: number | null;
};

async function persistTransactions(
  admin: Admin,
  ctx: PersistContext,
  accountId: string,
  statementId: string,
  masked: string,
  txs: readonly TxInsert[],
): Promise<void> {
  const rows = txs.map((tx) => ({
    business_entity_id: ctx.entityId,
    bank_account_id: accountId,
    bank_statement_id: statementId,
    txn_date: tx.date,
    posting_date: tx.postingDate,
    description: tx.description,
    normalized_description: normalizeDescription(tx.description),
    debit: money(tx.debitCents),
    credit: money(tx.creditCents),
    running_balance: money(tx.balanceCents),
    page_number: tx.page,
    confidence: tx.confidence,
    source: 'firm_document',
    document_version_id: ctx.versionId,
    dedupe_key: dedupeKey({
      date: tx.date,
      amountCents: (tx.creditCents ?? 0) - (tx.debitCents ?? 0),
      description: tx.description,
      account: masked,
    }),
  }));
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await admin
      .from('bank_transactions')
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'business_entity_id,dedupe_key', ignoreDuplicates: true });
    if (error) throw new WorkerError('persist_transactions');
  }
}

async function persistBank(
  admin: Admin,
  ctx: PersistContext,
  r: Extract<PipelineResult, { kind: 'bank_activity' }>,
): Promise<void> {
  const { data, reconciliation } = r;
  const accountId = await bankAccountId(admin, ctx, data.institution, data.masked_account);
  const confidence = Math.min(1, ...data.transactions.map((tx) => tx.confidence));
  const { data: statement, error } = await admin
    .from('bank_statements')
    .insert({
      business_entity_id: ctx.entityId,
      bank_account_id: accountId,
      kind: 'statement',
      period_start: data.period_start,
      period_end: data.period_end,
      beginning_balance: money(toCents(data.beginning_balance)),
      ending_balance: money(toCents(data.ending_balance)),
      source: 'firm_document',
      document_version_id: ctx.versionId,
      status: reconciliation.passed ? 'reconciled' : 'needs_review',
      reconciliation: asJson(reconciliation),
      confidence,
    })
    .select('id')
    .single();
  if (error?.code === '23505') throw new WorkerError('duplicate_period');
  if (error || !statement) throw new WorkerError('persist_statement');

  await persistTransactions(
    admin,
    ctx,
    accountId,
    statement.id,
    data.masked_account,
    data.transactions.map((tx) => ({
      date: tx.date,
      postingDate: tx.posting_date ?? null,
      description: tx.description,
      debitCents: centsOf(tx.debit),
      creditCents: centsOf(tx.credit),
      balanceCents: centsOf(tx.running_balance),
      page: tx.page,
      confidence: tx.confidence,
    })),
  );
}

async function persistTax(admin: Admin, ctx: PersistContext, r: Extract<PipelineResult, { kind: 'tax_record' }>): Promise<void> {
  const { data } = r;
  const { data: obligation, error } = await admin
    .from('tax_obligations')
    .insert({
      business_entity_id: ctx.entityId,
      tax_type: data.tax_type,
      tax_year: data.filing_period_end ? Number(data.filing_period_end.slice(0, 4)) : null,
      period_start: data.filing_period_start ?? null,
      period_end: data.filing_period_end ?? null,
      due_date: data.due_date ?? null,
      amount_paid: money(centsOf(data.amount_paid)),
      amount_payable: money(centsOf(data.amount_payable)),
      taxable_sales: money(centsOf(data.taxable_sales)),
      non_taxable_sales: money(centsOf(data.non_taxable_sales)),
      tax_collected: money(centsOf(data.tax_collected)),
      status: data.status,
      confirmation_number: data.confirmation_number ?? null,
      notes: `Jurisdiction: ${data.jurisdiction}`,
      source: 'firm_document',
      document_version_id: ctx.versionId,
      page_number: data.page,
      confidence: data.confidence,
    })
    .select('id')
    .single();
  if (error || !obligation) throw new WorkerError('persist_tax');

  const paid = centsOf(data.amount_paid);
  if (paid !== null && data.payment_date) {
    const { error: paymentError } = await admin.from('tax_payments').insert({
      business_entity_id: ctx.entityId,
      obligation_id: obligation.id,
      paid_on: data.payment_date,
      amount: paid / 100,
      confirmation_number: data.confirmation_number ?? null,
      source: 'firm_document',
      document_version_id: ctx.versionId,
      page_number: data.page,
      confidence: data.confidence,
    });
    if (paymentError) throw new WorkerError('persist_tax_payment');
  }
}

export async function persistPipelineOutput(admin: Admin, ctx: PersistContext, output: PipelineOutput): Promise<PersistSummary> {
  const warnings = [...output.warnings];
  await persistPages(admin, ctx, output.pages);
  for (const result of output.results) {
    if (result.kind === 'financial_statement') await persistStatement(admin, ctx, result, warnings);
    else if (result.kind === 'bank_activity') await persistBank(admin, ctx, result);
    else await persistTax(admin, ctx, result);
  }
  return {
    results: output.results.length,
    passed: output.results.length > 0 && output.results.every((r) => r.reconciliation.passed),
    warnings,
  };
}

// CSV exports: deterministic parse, a model-proposed mapping (kept for the
// firm to confirm in review — the statement lands in needs_review), then one
// synthetic "CSV export" account per business until the firm assigns a real one.
export async function persistCsv(admin: Admin, ctx: PersistContext, text: string, anthropic: Anthropic): Promise<PersistSummary> {
  const table = parseCsv(text);
  const { mapping } = await proposeCsvMapping({ headers: table.headers, sampleRows: table.rows, anthropic });
  const { transactions, skipped } = applyCsvMapping(table.rows, mapping);
  const dates = transactions.map((tx) => tx.date).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first || !last) throw new WorkerError('csv_no_transactions');

  const masked = 'CSV export';
  const accountId = await bankAccountId(admin, ctx, 'CSV export', masked);
  const reconciliation: Reconciliation = {
    passed: false,
    checks: [],
    lowConfidence: { count: skipped.length, refs: skipped.map((s) => `row ${s.row}: ${s.reason}`) },
  };
  const { data: statement, error } = await admin
    .from('bank_statements')
    .insert({
      business_entity_id: ctx.entityId,
      bank_account_id: accountId,
      kind: 'csv_export',
      period_start: first,
      period_end: last,
      source: 'firm_document',
      document_version_id: ctx.versionId,
      status: 'needs_review',
      reconciliation: asJson(reconciliation),
    })
    .select('id')
    .single();
  if (error?.code === '23505') throw new WorkerError('duplicate_period');
  if (error || !statement) throw new WorkerError('persist_statement');

  await persistTransactions(
    admin,
    ctx,
    accountId,
    statement.id,
    masked,
    transactions.map((tx) => ({
      date: tx.date,
      postingDate: null,
      description: tx.description,
      debitCents: centsOf(tx.debit),
      creditCents: centsOf(tx.credit),
      balanceCents: centsOf(tx.balance),
      page: null,
      confidence: null,
    })),
  );
  return { results: 1, passed: false, warnings: skipped.map((s) => `csv row ${s.row}: ${s.reason}`) };
}
