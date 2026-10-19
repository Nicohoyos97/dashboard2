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

export type LedgerLine = {
  lineId: string;
  /** The ledger account the line names. */
  accountId: string;
  /** Every account whose transactions make up the line's figure (match.ts): the sub-accounts of a collapsed parent too. */
  accountIds: string[];
  count: number;
  totalCents: number;
};

export type LedgerDetail = {
  ledgerId: string;
  periodStart: string;
  periodEnd: string;
  /** Keyed by P&L line id: only lines whose account carries exactly the statement's figure. */
  lines: Map<string, LedgerLine>;
};

const PAGE = 1000;

export type PublishedLedger = { id: string; period_start: string; period_end: string };

/**
 * The business's published ledgers, newest first: id and period only. The
 * client has no read on the row itself — its reconciliation lists every
 * account of the file, the firm-only ones too (0028).
 */
export async function loadPublishedLedgers(supabase: Db, entityId: string): Promise<PublishedLedger[]> {
  const { data, error } = await supabase.rpc('published_ledgers', { entity: entityId });
  if (error) throw new Error('published_ledgers_read_failed');
  return data ?? [];
}

export async function loadLedgerDetail(
  supabase: Db,
  entityId: string,
  report: ReportRow,
  roots: readonly LineNode[],
  /** Already loaded by a caller reading several months. */
  published?: readonly PublishedLedger[],
): Promise<LedgerDetail | null> {
  if (report.reportType !== 'profit_and_loss') return null;
  const ledger = (published ?? (await loadPublishedLedgers(supabase, entityId))).find(
    (l) => l.period_start === report.periodStart && l.period_end === report.periodEnd,
  );
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
    // transaction_count is each account's own rows; a collapsed parent's line counts its sub-accounts' too.
    const count = line.accountIds.reduce((sum, id) => sum + (counts.get(id) ?? 0), 0);
    if (count > 0) {
      lines.set(line.lineId, { lineId: line.lineId, accountId: line.accountId, accountIds: line.accountIds, count, totalCents: line.statementCents });
    }
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
  const txns = detail ? await loadLedgerTransactions(supabase, entityId, detail.accountIds) : [];
  return { line: { id: line.id, accountName: line.account_name }, report, detail, txns };
}

/** Rows one search reads at most, in pages; past it the result says it is partial rather than present a part as the whole. */
const SEARCH_LIMIT = 10_000;
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

/**
 * `%`, `_` and `\` in what the user typed are literal, not wildcards. PostgREST
 * also reads `*` as `%` and offers no escape for it, so a `*` becomes `_` (any
 * one character) here and the literal check in searchLedgerTransactions drops
 * whatever that lets through.
 */
function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/\*/g, '_')}%`;
}

export type LedgerSearch = { txns: LedgerTxn[]; truncated: boolean };

/**
 * Transactions of these ledgers whose payee or description contains `text`,
 * case-insensitively, newest first, kept to `accountIds`. Filtered by ledger
 * (at most a year of them) rather than by account, because a year of P&L
 * accounts is hundreds of ids — too long for a URL. Two filtered reads rather
 * than one `or` filter, so nothing the user typed is ever parsed as PostgREST
 * syntax, each paged so a busy payee is not cut at PostgREST's row cap.
 */
export async function searchLedgerTransactions(
  supabase: Db,
  entityId: string,
  ledgerIds: readonly string[],
  accountIds: ReadonlySet<string>,
  text: string,
): Promise<LedgerSearch> {
  const needle = text.trim();
  if (ledgerIds.length === 0 || accountIds.size === 0 || needle === '') return { txns: [], truncated: false };
  const pattern = containsPattern(needle);
  let truncated = false;
  const read = async (column: 'name' | 'description') => {
    const rows: LedgerTxn[] = [];
    for (let from = 0; from < SEARCH_LIMIT; from += PAGE) {
      const { data, error } = await supabase
        .from('ledger_transactions')
        .select(TXN_COLUMNS)
        .eq('business_entity_id', entityId)
        .in('ledger_id', [...ledgerIds])
        .ilike(column, pattern)
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) throw new Error('ledger_transactions_read_failed');
      for (const row of data ?? []) rows.push(toTxn(row));
      if ((data ?? []).length < PAGE) return rows;
    }
    truncated = true;
    return rows;
  };
  const [byName, byDescription] = await Promise.all([read('name'), read('description')]);
  const lower = needle.toLowerCase();
  const contains = (value: string | null) => value !== null && value.toLowerCase().includes(lower);
  const found = new Map<string, LedgerTxn>();
  for (const tx of [...byName, ...byDescription]) {
    if (accountIds.has(tx.accountId) && (contains(tx.name) || contains(tx.description))) found.set(tx.id, tx);
  }
  return { txns: [...found.values()].sort((a, b) => b.date.localeCompare(a.date)), truncated };
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
