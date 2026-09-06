// Persistence of pipeline output (docs/PLAN.md §3.4). Runs with the service
// role inside the worker; every row names its business_entity_id. Re-running
// a job first clears the unpublished derived rows of that version, so
// processing is idempotent. Money arrives as integer cents and is stored in
// numeric(18,2) as cents / 100.
import { randomUUID } from 'node:crypto';

import type Anthropic from '@anthropic-ai/sdk';

import { toCents } from '@/lib/money';
import type { createAdminClient } from '@/lib/supabase/admin';
import type { Database, Json } from '@/lib/supabase/types';

import { applyCsvMapping, dedupeKey, normalizeDescription, parseCsv, proposeCsvMapping } from './csv';
import type { PipelineOutput, PipelineResult } from './pipeline';
import { reconcileCsvExport } from './reconcile';
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
  // Tenders cascade with their report.
  await admin.from('sales_reports').delete().eq('document_version_id', versionId).neq('status', 'published');
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

// account_type decides how the balance moves (see reconcileBankStatement), so
// it is recorded from the extraction rather than left null as it was before.
type AccountType = Database['public']['Tables']['bank_accounts']['Insert']['account_type'];

async function bankAccountId(
  admin: Admin,
  ctx: PersistContext,
  institution: string,
  masked: string,
  accountType: AccountType = null,
): Promise<string> {
  const { data, error } = await admin
    .from('bank_accounts')
    .upsert(
      {
        business_entity_id: ctx.entityId,
        institution,
        masked_number: masked,
        currency: ctx.currency,
        ...(accountType ? { account_type: accountType } : {}),
      },
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
  const accountId = await bankAccountId(
    admin,
    ctx,
    data.institution,
    data.masked_account,
    data.account_kind === 'depository' ? 'checking' : data.account_kind === 'other' ? 'other' : data.account_kind,
  );
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

/**
 * The one sales-tax obligation for a business and period, created if it is not
 * there yet.
 *
 * Two documents describe the same period from different sides — the
 * point-of-sale report says what was sold, the state filing says what is owed
 * — and each writes only its own columns onto this row. Finding the row rather
 * than inserting one is what makes that possible, and what stops the same
 * document processed twice from producing two obligations: a client's Sales
 * Taxes page showed July twice for exactly that reason, before
 * `tax_obligations_period_idx` (0022) existed to make it impossible.
 */
async function upsertObligation(
  admin: Admin,
  ctx: PersistContext,
  key: { taxType: string; periodStart: string | null; periodEnd: string | null },
  patch: Database['public']['Tables']['tax_obligations']['Update'],
  /** Only applied when the row is created, never when it already exists. */
  onInsert: Partial<Database['public']['Tables']['tax_obligations']['Insert']> = {},
): Promise<string> {
  const existing = key.periodStart
    ? await admin
        .from('tax_obligations')
        .select('id')
        .eq('business_entity_id', ctx.entityId)
        .eq('tax_type', key.taxType)
        .eq('period_start', key.periodStart)
        .eq('period_end', key.periodEnd ?? key.periodStart)
        .is('jurisdiction_id', null)
        .maybeSingle()
    : { data: null };

  if (existing.data) {
    const { error } = await admin.from('tax_obligations').update(patch).eq('id', existing.data.id);
    if (error) throw new WorkerError('persist_tax');
    return existing.data.id;
  }

  const { data, error } = await admin
    .from('tax_obligations')
    .insert({
      business_entity_id: ctx.entityId,
      tax_type: key.taxType,
      period_start: key.periodStart,
      period_end: key.periodEnd,
      source: 'firm_document',
      ...onInsert,
      ...patch,
    })
    .select('id')
    .single();
  if (error || !data) throw new WorkerError('persist_tax');
  return data.id;
}

/**
 * A point-of-sale sales report: what was sold, and how the money arrived.
 *
 * It also fills the *sales* half of the sales-tax obligation for the same
 * period — `taxable_sales` and `tax_collected` — which the filing no longer
 * supplies. Neither document overwrites the other's columns.
 */
async function persistSalesReport(
  admin: Admin,
  ctx: PersistContext,
  r: Extract<PipelineResult, { kind: 'sales_report' }>,
): Promise<void> {
  const { data } = r;
  const { data: report, error } = await admin
    .from('sales_reports')
    .insert({
      business_entity_id: ctx.entityId,
      source_system: data.source_system,
      period_start: data.period_start,
      period_end: data.period_end,
      currency: data.currency,
      gross_sales: money(centsOf(data.gross_sales)),
      net_sales: money(centsOf(data.net_sales)),
      refunds: money(centsOf(data.refunds)),
      discounts: money(centsOf(data.discounts)),
      tips: money(centsOf(data.tips)),
      tax_collected: money(centsOf(data.tax_collected)),
      tax_expected: money(centsOf(data.tax_expected)),
      amount_collected: money(centsOf(data.amount_collected)),
      order_count: data.order_count ?? null,
      source: 'firm_document',
      document_version_id: ctx.versionId,
      page_number: data.page,
      confidence: data.confidence,
      reconciliation: asJson(r.reconciliation),
    })
    .select('id')
    .single();
  if (error || !report) throw new WorkerError('persist_sales_report');

  const tenders = data.tenders ?? [];
  if (tenders.length > 0) {
    const { error: tenderError } = await admin.from('sales_report_tenders').insert(
      tenders.map((tender, index) => ({
        sales_report_id: report.id,
        business_entity_id: ctx.entityId,
        label: tender.label,
        amount: toCents(tender.amount) / 100,
        position: index,
      })),
    );
    if (tenderError) throw new WorkerError('persist_sales_report');
  }

  // The sales half of the obligation. Written only when the report actually
  // printed the figure — a null here means "not reported", and must not land
  // as a zero the firm would read as "no taxable sales".
  const taxableSales = money(centsOf(data.net_sales ?? data.gross_sales));
  const taxCollected = money(centsOf(data.tax_collected));
  if (taxableSales !== null || taxCollected !== null) {
    // Its own two columns and nothing else.
    //
    // `document_version_id` and `status` belong to the FILING — the document
    // that states what is owed — and this row carries only one of each. Writing
    // them here made whichever document processed last claim the row, and left
    // the other one reading "nothing was extracted from this version", unable
    // to be published, with its figures sitting in the row all along. The
    // provenance of these two numbers is the sales_reports row, which has its
    // own document_version_id.
    await upsertObligation(
      admin,
      ctx,
      { taxType: 'sales', periodStart: data.period_start, periodEnd: data.period_end },
      { taxable_sales: taxableSales, tax_collected: taxCollected },
      // A sales report can arrive before any filing; the row still needs a
      // status, and "nobody has filed yet" is pending_review.
      { status: 'pending_review' },
    );
  }
}

async function persistTax(admin: Admin, ctx: PersistContext, r: Extract<PipelineResult, { kind: 'tax_record' }>): Promise<void> {
  const { data } = r;
  // A filing says what is OWED and nothing believable about what was sold.
  // `taxable_sales`, `non_taxable_sales` and `tax_collected` are deliberately
  // absent here: they belong to the point-of-sale report for the same period
  // (0022). Reading them off a return once put a client's July sales at
  // $12,955 when their POS said $14,119 — the return had been prepared from
  // the card tender line alone.
  const obligationId = await upsertObligation(
    admin,
    ctx,
    { taxType: data.tax_type, periodStart: data.filing_period_start ?? null, periodEnd: data.filing_period_end ?? null },
    {
      tax_year: data.filing_period_end ? Number(data.filing_period_end.slice(0, 4)) : null,
      due_date: data.due_date ?? null,
      amount_paid: money(centsOf(data.amount_paid)),
      amount_payable: money(centsOf(data.amount_payable)),
      status: data.status,
      confirmation_number: data.confirmation_number ?? null,
      notes: `Jurisdiction: ${data.jurisdiction}`,
      document_version_id: ctx.versionId,
      page_number: data.page,
      confidence: data.confidence,
      // The pipeline already cross-checked this filing; without recording it,
      // publishBlockers has nothing to gate on and the row can never be
      // published (0016).
      reconciliation: asJson(r.reconciliation),
    },
  );
  const obligation = { id: obligationId };

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
    else if (result.kind === 'sales_report') await persistSalesReport(admin, ctx, result);
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
  const accountId = await bankAccountId(admin, ctx, 'CSV export', masked, 'other');
  // A ledger has its own invariants — every row understood, and continuity
  // where the export prints a balance. Recording an unconditional failure here
  // meant publishBlockers could never clear, so no CSV export ever reached a
  // client however clean it was.
  const checked = reconcileCsvExport(transactions, skipped);
  const reconciliation: Reconciliation = {
    ...checked,
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
  return {
    results: 1,
    passed: reconciliation.passed,
    warnings: skipped.map((s) => `csv row ${s.row}: ${s.reason}`),
  };
}
