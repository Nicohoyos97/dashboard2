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

/** Every transaction of these accounts, newest first. Paged: a month of sales can pass PostgREST's row cap. */
export async function loadLedgerTransactions(supabase: Db, entityId: string, accountIds: readonly string[]): Promise<LedgerTxn[]> {
  if (accountIds.length === 0) return [];
  const out: LedgerTxn[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('ledger_transactions')
      .select('id, account_id, txn_date, txn_type, num, name, description, split, amount')
      .eq('business_entity_id', entityId)
      .in('account_id', [...accountIds])
      .order('txn_date', { ascending: false })
      .order('position', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error('ledger_transactions_read_failed');
    for (const row of data ?? []) {
      out.push({
        id: row.id,
        accountId: row.account_id,
        date: row.txn_date,
        type: row.txn_type,
        num: row.num,
        name: row.name,
        description: row.description,
        split: row.split,
        amountCents: toCents(row.amount),
      });
    }
    if ((data ?? []).length < PAGE) return out;
  }
}
