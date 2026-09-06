// Read-side loaders for the client portal. Every query runs on the caller's
// RLS-scoped client, so a member only ever receives published rows; the
// explicit status filters make a firm preview show exactly what the client
// sees (the firm can otherwise read drafts). Money leaves here as integer cents.
import 'server-only';

import { cache } from 'react';

import { insightKey } from '@/lib/insights/periods';
import type { LineRow, ReportRow } from '@/lib/reports/types';
import type { createClient } from '@/lib/supabase/server';

type Db = Awaited<ReturnType<typeof createClient>>;

const PAGE_SIZE = 1_000;

function readError(code: string): Error {
  // Fixed codes only: never copy PostgREST messages into user-visible errors.
  return new Error(code);
}

const cents = (value: number | null): number | null => (value === null ? null : Math.round(value * 100));

function toReportRow(r: {
  id: string;
  report_type: string;
  basis: string | null;
  currency: string;
  period_start: string;
  period_end: string;
  comparative_start: string | null;
  comparative_end: string | null;
  source: string;
  document_version_id: string | null;
  published_at: string | null;
}): ReportRow {
  return {
    id: r.id,
    reportType: r.report_type === 'balance_sheet' ? 'balance_sheet' : 'profit_and_loss',
    basis: r.basis === 'accrual' ? 'accrual' : r.basis === 'cash' ? 'cash' : null,
    currency: r.currency,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    comparativeStart: r.comparative_start,
    comparativeEnd: r.comparative_end,
    source: r.source === 'firm_entry' ? 'firm_entry' : 'firm_document',
    documentVersionId: r.document_version_id,
    publishedAt: r.published_at,
  };
}

const REPORT_COLUMNS =
  'id, report_type, basis, currency, period_start, period_end, comparative_start, comparative_end, source, document_version_id, published_at';

export async function loadPublishedReports(supabase: Db, entityId: string): Promise<ReportRow[]> {
  const { data, error } = await supabase
    .from('financial_reports')
    .select(REPORT_COLUMNS)
    .eq('business_entity_id', entityId)
    .eq('status', 'published')
    .order('period_end', { ascending: false });
  if (error) throw readError('portal_reports_read_failed');
  return (data ?? []).map(toReportRow);
}

export async function loadPublishedReport(supabase: Db, entityId: string, reportId: string): Promise<ReportRow | null> {
  const { data, error } = await supabase
    .from('financial_reports')
    .select(REPORT_COLUMNS)
    .eq('id', reportId)
    .eq('business_entity_id', entityId)
    .eq('status', 'published')
    .maybeSingle();
  if (error) throw readError('portal_report_read_failed');
  return data ? toReportRow(data) : null;
}

export async function loadReportLines(supabase: Db, entityId: string, reportId: string): Promise<LineRow[]> {
  const rows: {
    id: string;
    parent_line_id: string | null;
    position: number;
    depth: number;
    section: string | null;
    account_name: string;
    account_number: string | null;
    current: number | null;
    prior: number | null;
    is_section: boolean;
    is_total: boolean;
    page_number: number | null;
    confidence: number | null;
  }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('financial_statement_lines')
      .select('id, parent_line_id, position, depth, section, account_name, account_number, current, prior, is_section, is_total, page_number, confidence')
      .eq('business_entity_id', entityId)
      .eq('report_id', reportId)
      .order('position')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw readError('portal_report_lines_read_failed');
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return rows.map((l) => ({
    id: l.id,
    parentLineId: l.parent_line_id,
    position: l.position,
    depth: l.depth,
    section: l.section,
    accountName: l.account_name,
    accountNumber: l.account_number,
    currentCents: cents(l.current),
    priorCents: cents(l.prior),
    isSection: l.is_section,
    isTotal: l.is_total,
    pageNumber: l.page_number,
    confidence: l.confidence,
  }));
}

/**
 * The lines of several reports in one round trip, keyed by report.
 *
 * The trend series on the Overview and both statement pages used to call
 * `loadReportLines` once per period — eight identical queries, eight RLS
 * evaluations, eight round trips to answer one screen. Same columns, same
 * `position` order within a report and the same paging as the single-report
 * loader; only the filter widens. Every requested id is present in the result,
 * with an empty array when the report has no lines.
 */
export async function loadReportLinesFor(
  supabase: Db,
  entityId: string,
  reportIds: readonly string[],
): Promise<Map<string, LineRow[]>> {
  const byReport = new Map<string, LineRow[]>(reportIds.map((id) => [id, []]));
  if (reportIds.length === 0) return byReport;

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('financial_statement_lines')
      .select('report_id, id, parent_line_id, position, depth, section, account_name, account_number, current, prior, is_section, is_total, page_number, confidence')
      .eq('business_entity_id', entityId)
      .in('report_id', reportIds)
      // report_id first so paging never interleaves two reports mid-page.
      .order('report_id')
      .order('position')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw readError('portal_report_lines_read_failed');
    for (const l of data ?? []) {
      byReport.get(l.report_id)?.push({
        id: l.id,
        parentLineId: l.parent_line_id,
        position: l.position,
        depth: l.depth,
        section: l.section,
        accountName: l.account_name,
        accountNumber: l.account_number,
        currentCents: cents(l.current),
        priorCents: cents(l.prior),
        isSection: l.is_section,
        isTotal: l.is_total,
        pageNumber: l.page_number,
        confidence: l.confidence,
      });
    }
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return byReport;
}

export type BankTransactionRow = { date: string; debitCents: number | null; creditCents: number | null };
export type BankStatementRow = {
  id: string;
  bankAccountId: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
  endingBalanceCents: number | null;
};

export async function loadPublishedBankStatements(supabase: Db, entityId: string): Promise<BankStatementRow[]> {
  const { data, error } = await supabase
    .from('bank_statements')
    .select('id, bank_account_id, period_start, period_end, ending_balance, bank_accounts!inner(currency)')
    .eq('business_entity_id', entityId)
    .eq('status', 'published')
    .order('period_end');
  if (error) throw readError('portal_bank_statements_read_failed');
  return (data ?? []).map((s) => ({
    id: s.id,
    bankAccountId: s.bank_account_id,
    currency: s.bank_accounts.currency,
    periodStart: s.period_start,
    periodEnd: s.period_end,
    endingBalanceCents: cents(s.ending_balance),
  }));
}

import { type PortalModules, portalModules } from './modules';

export type PortalEntitySettings = {
  currency: string;
  /** Kept for the pages that already read it; `modules.sales_taxes` is the same fact. */
  salesTaxEnabled: boolean;
  modules: PortalModules;
  timezone: string;
  industry: string | null;
  logoUrl: string | null;
};

/**
 * Memoized per request: the dashboard layout reads the settings to build the
 * nav, and then the page reads them again. Both hands are the same client now
 * that createClient() is itself memoized, so the cache key is stable.
 */
export const loadPortalEntitySettings = cache(async function loadPortalEntitySettings(
  supabase: Db,
  entityId: string,
): Promise<PortalEntitySettings> {
  const { data, error } = await supabase
    .from('business_entities')
    .select('currency, sales_tax_enabled, enabled_modules, timezone, industry, logo_url')
    .eq('id', entityId)
    .single();
  if (error || !data) throw readError('portal_entity_read_failed');
  return {
    currency: data.currency,
    salesTaxEnabled: data.sales_tax_enabled,
    modules: portalModules(data),
    timezone: data.timezone,
    industry: data.industry,
    logoUrl: data.logo_url,
  };
});

export type PublishedDocument = {
  id: string;
  title: string;
  documentType: string;
  periodStart: string | null;
  periodEnd: string | null;
  publishedAt: string | null;
  currentVersionId: string | null;
};

export async function loadPublishedDocuments(supabase: Db, entityId: string): Promise<PublishedDocument[]> {
  const rows: {
    id: string;
    title: string;
    document_type: string;
    period_start: string | null;
    period_end: string | null;
    published_at: string | null;
    current_version_id: string | null;
  }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('documents')
      .select('id, title, document_type, period_start, period_end, published_at, current_version_id')
      .eq('business_entity_id', entityId)
      .eq('status', 'published')
      .order('period_end', { ascending: false, nullsFirst: false })
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw readError('portal_documents_read_failed');
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return rows.map((d) => ({
    id: d.id,
    title: d.title,
    documentType: d.document_type,
    periodStart: d.period_start,
    periodEnd: d.period_end,
    publishedAt: d.published_at,
    currentVersionId: d.current_version_id,
  }));
}

export type ReminderRow = {
  id: string;
  reminderType: string;
  title: string;
  amountCents: number | null;
  dueDate: string;
  status: string;
  responsible: string;
  actionRequired: string | null;
  source: string;
};

export async function loadReminders(supabase: Db, entityId: string): Promise<ReminderRow[]> {
  const { data, error } = await supabase
    .from('reminders')
    .select('id, reminder_type, title, amount, due_date, status, responsible, action_required, source')
    .eq('business_entity_id', entityId)
    .not('published_at', 'is', null)
    .order('due_date')
    .limit(200);
  if (error) throw readError('portal_reminders_read_failed');
  return (data ?? []).map((r) => ({
    id: r.id,
    reminderType: r.reminder_type,
    title: r.title,
    amountCents: cents(r.amount),
    dueDate: r.due_date,
    status: r.status,
    responsible: r.responsible,
    actionRequired: r.action_required,
    source: r.source,
  }));
}

/**
 * Insight rows this user has already checked off, as `ruleKey|start|end` keys
 * (see lib/insights/periods.ts). Per user: another member's ticks never hide a
 * line from this one.
 */
export async function loadInsightDismissals(supabase: Db, entityId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('insight_dismissals')
    .select('rule_key, period_start, period_end')
    .eq('business_entity_id', entityId);
  if (error) throw readError('portal_insight_dismissals_read_failed');
  return new Set((data ?? []).map((row) => insightKey(row.rule_key, row.period_start, row.period_end)));
}

export type PortalSalesReport = {
  id: string;
  sourceSystem: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  grossSalesCents: number | null;
  netSalesCents: number | null;
  refundsCents: number | null;
  // The third term of net sales (gross − refunds − discounts), read by the
  // portal since the client's own breakdown started showing it.
  discountsCents: number | null;
  tipsCents: number | null;
  taxCollectedCents: number | null;
  amountCollectedCents: number | null;
  orderCount: number | null;
  tenders: { id: string; label: string; amountCents: number }[];
};

/**
 * Published point-of-sale reports, newest period first.
 *
 * These are what the client's own register rang up (0022), and they are the
 * only source of sales figures in the portal — a tax filing states receipts as
 * the filer entered them, which is a different fact and is never read as sales.
 * RLS returns published rows only, so an unreviewed month cannot appear here.
 */
export async function loadPublishedSalesReports(
  supabase: Db,
  entityId: string,
  limit = 12,
): Promise<PortalSalesReport[]> {
  const { data, error } = await supabase
    .from('sales_reports')
    .select(
      'id, source_system, period_start, period_end, currency, gross_sales, net_sales, refunds, discounts, tips, tax_collected, amount_collected, order_count, sales_report_tenders ( id, label, amount, position )',
    )
    .eq('business_entity_id', entityId)
    .eq('status', 'published')
    .order('period_end', { ascending: false })
    .limit(limit);
  if (error) throw readError('portal_sales_reports_read_failed');

  return (data ?? []).map((row) => ({
    id: row.id,
    sourceSystem: row.source_system,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    currency: row.currency,
    grossSalesCents: cents(row.gross_sales),
    netSalesCents: cents(row.net_sales),
    refundsCents: cents(row.refunds),
    discountsCents: cents(row.discounts),
    tipsCents: cents(row.tips),
    taxCollectedCents: cents(row.tax_collected),
    amountCollectedCents: cents(row.amount_collected),
    orderCount: row.order_count,
    tenders: [...row.sales_report_tenders]
      .sort((a, b) => a.position - b.position)
      .map((tender) => ({ id: tender.id, label: tender.label, amountCents: cents(tender.amount) ?? 0 })),
  }));
}
