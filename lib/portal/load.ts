// Read-side loaders for the client portal. Every query runs on the caller's
// RLS-scoped client, so a member only ever receives published rows; the
// explicit status filters make a firm preview show exactly what the client
// sees (the firm can otherwise read drafts). Money leaves here as integer cents.
import 'server-only';

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

export type BankTransactionRow = { date: string; debitCents: number | null; creditCents: number | null };

export async function loadPublishedBankTransactions(
  supabase: Db,
  entityId: string,
  currency: string,
  range?: { start: string; end: string },
): Promise<BankTransactionRow[]> {
  const rows: { txn_date: string; debit: number | null; credit: number | null }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    // The explicit joined status filter matters for a firm preview: the firm's
    // RLS branch can read drafts, while preview must match the client exactly.
    let query = supabase
      .from('bank_transactions')
      .select('id, txn_date, debit, credit, bank_statements!inner(status), bank_accounts!inner(currency)')
      .eq('business_entity_id', entityId)
      .eq('bank_statements.status', 'published')
      .eq('bank_accounts.currency', currency)
      .order('txn_date')
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (range) query = query.gte('txn_date', range.start).lte('txn_date', range.end);
    const { data, error } = await query;
    if (error) throw readError('portal_bank_transactions_read_failed');
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return rows.map((tx) => ({ date: tx.txn_date, debitCents: cents(tx.debit), creditCents: cents(tx.credit) }));
}

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

export type PortalEntitySettings = { currency: string; salesTaxEnabled: boolean; timezone: string };

export async function loadPortalEntitySettings(supabase: Db, entityId: string): Promise<PortalEntitySettings> {
  const { data, error } = await supabase
    .from('business_entities')
    .select('currency, sales_tax_enabled, timezone')
    .eq('id', entityId)
    .single();
  if (error || !data) throw readError('portal_entity_read_failed');
  return { currency: data.currency, salesTaxEnabled: data.sales_tax_enabled, timezone: data.timezone };
}

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
