// What the client portal reads of a published General Ledger: for each P&L
// account line, the ledger account behind it and its transactions.
//
// The match is recomputed here against the statement on screen rather than
// trusted from publication: if the firm later replaces the P&L, a line whose
// figure moved simply stops linking to transactions that no longer add up to
// it. RLS already limits a client to the accounts the firm's publication
// matched (0026); the firm previewing as a client sees every account, and the
// match below still keeps only the P&L lines.
import 'server-only';

import { toCents } from '@/lib/money';
import { loadPublishedReport, loadReportLines } from '@/lib/portal/load';
import { buildTree } from '@/lib/reports/tree';
import type { LineNode, ReportRow } from '@/lib/reports/types';
import type { createClient } from '@/lib/supabase/server';

import type { LedgerTxn } from './display';
import { matchLedger } from './match';

export type { LedgerTxn } from './display';

type Db = Awaited<ReturnType<typeof createClient>>;

export type LedgerLine = { lineId: string; accountId: string; count: number; totalCents: number };

export type LedgerDetail = {
  ledgerId: string;
  periodStart: string;
  periodEnd: string;
  /** Keyed by P&L line id: only lines whose account carries exactly the statement's figure. */
  lines: Map<string, LedgerLine>;
};

const PAGE = 1000;

export async function loadLedgerDetail(
  supabase: Db,
  entityId: string,
  report: ReportRow,
  roots: readonly LineNode[],
): Promise<LedgerDetail | null> {
  if (report.reportType !== 'profit_and_loss') return null;
  const { data: ledger } = await supabase
    .from('general_ledgers')
    .select('id, period_start, period_end')
    .eq('business_entity_id', entityId)
    .eq('status', 'published')
    .eq('period_start', report.periodStart)
    .eq('period_end', report.periodEnd)
    .limit(1)
    .maybeSingle();
  if (!ledger) return null;

  const { data: accounts, error } = await supabase
    .from('ledger_accounts')
    .select('id, name, parent_id, total, transaction_count')
    .eq('ledger_id', ledger.id)
    .eq('business_entity_id', entityId)
    .order('position');
  if (error) throw new Error('ledger_accounts_read_failed');

  const counts = new Map((accounts ?? []).map((a) => [a.id, a.transaction_count]));
  const match = matchLedger(
    roots,
    (accounts ?? []).map((a) => ({ id: a.id, name: a.name, parentId: a.parent_id, totalCents: toCents(a.total) })),
  );
  const lines = new Map<string, LedgerLine>();
  for (const line of match.lines) {
    if (line.status !== 'matched' || !line.accountId) continue;
    const count = counts.get(line.accountId) ?? 0;
    if (count > 0) lines.set(line.lineId, { lineId: line.lineId, accountId: line.accountId, count, totalCents: line.statementCents });
  }
  return lines.size > 0 ? { ledgerId: ledger.id, periodStart: ledger.period_start, periodEnd: ledger.period_end, lines } : null;
}

export type LineLedger = {
  line: { id: string; accountName: string };
  report: ReportRow;
  /** Null when the month has no published ledger, or its account no longer carries the line's figure. */
  detail: LedgerLine | null;
  txns: LedgerTxn[];
};

/**
 * One P&L account line and the transactions behind it — what its own page
 * shows and what its CSV contains. Null when the line is not on a published
 * Profit & Loss this client can read (RLS returns nothing else).
 */
export async function loadLineLedger(supabase: Db, entityId: string, lineId: string): Promise<LineLedger | null> {
  const { data: line } = await supabase
    .from('financial_statement_lines')
    .select('id, report_id, account_name')
    .eq('id', lineId)
    .eq('business_entity_id', entityId)
    .maybeSingle();
  const report = line ? await loadPublishedReport(supabase, entityId, line.report_id) : null;
  if (!line || !report || report.reportType !== 'profit_and_loss') return null;
  const roots = buildTree(await loadReportLines(supabase, entityId, report.id));
  const detail = (await loadLedgerDetail(supabase, entityId, report, roots))?.lines.get(lineId) ?? null;
  const txns = detail ? await loadLedgerTransactions(supabase, entityId, [detail.accountId]) : [];
  return { line: { id: line.id, accountName: line.account_name }, report, detail, txns };
}

const SEARCH_LIMIT = 1000;
const TXN_COLUMNS = 'id, account_id, txn_date, txn_type, num, name, description, split, amount';

function toTxn(row: {
  id: string;
  account_id: string;
  txn_date: string;
  txn_type: string | null;
  num: string | null;
  name: string | null;
  description: string | null;
  split: string | null;
  amount: number;
}): LedgerTxn {
  return {
    id: row.id,
    accountId: row.account_id,
    date: row.txn_date,
    type: row.txn_type,
    num: row.num,
    name: row.name,
    description: row.description,
    split: row.split,
    amountCents: toCents(row.amount),
  };
}

/** `%`, `_` and `\` in what the user typed are literal, not wildcards. */
function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Transactions of these accounts whose payee or description contains `text`,
 * case-insensitively, newest first. Two filtered reads rather than one `or`
 * filter, so nothing the user typed is ever parsed as PostgREST syntax.
 */
export async function searchLedgerTransactions(
  supabase: Db,
  entityId: string,
  accountIds: readonly string[],
  text: string,
): Promise<LedgerTxn[]> {
  if (accountIds.length === 0 || text.trim() === '') return [];
  const pattern = containsPattern(text.trim());
  const read = (column: 'name' | 'description') =>
    supabase
      .from('ledger_transactions')
      .select(TXN_COLUMNS)
      .eq('business_entity_id', entityId)
      .in('account_id', [...accountIds])
      .ilike(column, pattern)
      .limit(SEARCH_LIMIT);
  const [byName, byDescription] = await Promise.all([read('name'), read('description')]);
  if (byName.error || byDescription.error) throw new Error('ledger_transactions_read_failed');
  const found = new Map<string, LedgerTxn>();
  for (const row of [...(byName.data ?? []), ...(byDescription.data ?? [])]) found.set(row.id, toTxn(row));
  return [...found.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/** Every transaction of these accounts, newest first. Paged: a month of sales can pass PostgREST's row cap. */
export async function loadLedgerTransactions(supabase: Db, entityId: string, accountIds: readonly string[]): Promise<LedgerTxn[]> {
  if (accountIds.length === 0) return [];
  const out: LedgerTxn[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('ledger_transactions')
      .select(TXN_COLUMNS)
      .eq('business_entity_id', entityId)
      .in('account_id', [...accountIds])
      .order('txn_date', { ascending: false })
      .order('position', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error('ledger_transactions_read_failed');
    for (const row of data ?? []) out.push(toTxn(row));
    if ((data ?? []).length < PAGE) return out;
  }
}
