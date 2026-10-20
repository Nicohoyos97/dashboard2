// The reads behind a Profit & Loss for any range of dates (lib/reports/range.ts):
// the statements the range is made of, their ledgers' accounts, and — only for
// a statement the range cuts through — that ledger's transactions inside the
// range, summed per account. Several ranges are read in one wave, so a page
// that shows a range beside the one before it pays for one set of round trips.
//
// Everything goes through the member's own client: RLS returns published
// statements only and, below a ledger, only the accounts the firm's
// publication matched to a P&L line (0026) — which are exactly the accounts a
// split needs.
import 'server-only';

import { sumCents, toCents } from '@/lib/money';
import { type LedgerTxn, type PublishedLedger, loadLedgerTransactions, loadPublishedLedgers } from '@/lib/ledger/load';
import { type LedgerMatch, matchLedger } from '@/lib/ledger/match';
import type { PeriodRange } from '@/lib/reports/periods';
import {
  type RangePiece,
  type RangeRefusal,
  type SlicedPiece,
  composeRange,
  piecesRows,
  planRange,
  sliceStatement,
} from '@/lib/reports/range';
import { buildTree } from '@/lib/reports/tree';
import type { LineRow, ReportRow } from '@/lib/reports/types';
import type { createClient } from '@/lib/supabase/server';

import { loadPublishedReports, loadReportLinesFor } from './load';
import { periodParam } from './period-param';

type Db = Awaited<ReturnType<typeof createClient>>;

const PAGE = 1000;

/** Where the transactions behind one line of a range sit: one ledger's accounts, between two dates. */
export type RangeLedgerPart = { ledgerId: string; accountIds: string[]; start: string; end: string; whole: boolean };
export type RangeLedgerLine = { count: number; parts: RangeLedgerPart[] };

export type RangeStatement = {
  /** The range as a statement: its period is the days actually covered. */
  report: ReportRow;
  rows: LineRow[];
  requested: PeriodRange;
  /** True when the range ran past what is published and was cut to it. */
  clamped: boolean;
  /** Each piece as a statement of its own, oldest first — a chart's bars. */
  pieces: { report: ReportRow; rows: LineRow[]; whole: boolean }[];
  /** True when a figure was re-added from a General Ledger rather than read off a statement. */
  fromLedger: boolean;
  /** Line id → the transactions behind it, for the lines every piece's ledger carries. */
  ledger: Map<string, RangeLedgerLine>;
};

export type RangeOutcome =
  | { ok: true; statement: RangeStatement }
  | { ok: false; requested: PeriodRange; reason: RangeRefusal; at: PeriodRange | null };

type AccountRow = { id: string; ledger_id: string; name: string; parent_id: string | null; total: number; transaction_count: number };
type Window = { sums: Map<string, number>; counts: Map<string, number> };

async function loadAccounts(supabase: Db, entityId: string, ledgerIds: readonly string[]): Promise<Map<string, AccountRow[]>> {
  const byLedger = new Map<string, AccountRow[]>(ledgerIds.map((id) => [id, []]));
  if (ledgerIds.length === 0) return byLedger;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('ledger_accounts')
      .select('id, ledger_id, name, parent_id, total, transaction_count')
      .eq('business_entity_id', entityId)
      .in('ledger_id', [...ledgerIds])
      .order('ledger_id')
      .order('position')
      .range(from, from + PAGE - 1);
    if (error) throw new Error('ledger_accounts_read_failed');
    for (const row of data ?? []) byLedger.get(row.ledger_id)?.push(row);
    if ((data ?? []).length < PAGE) return byLedger;
  }
}

/** One ledger's transactions between two dates, summed and counted per account. */
async function loadWindow(supabase: Db, entityId: string, ledgerId: string, start: string, end: string): Promise<Window> {
  const sums = new Map<string, number>();
  const counts = new Map<string, number>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('ledger_transactions')
      .select('id, account_id, amount')
      .eq('business_entity_id', entityId)
      .eq('ledger_id', ledgerId)
      .gte('txn_date', start)
      .lte('txn_date', end)
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error('ledger_transactions_read_failed');
    for (const row of data ?? []) {
      sums.set(row.account_id, (sums.get(row.account_id) ?? 0) + toCents(row.amount));
      counts.set(row.account_id, (counts.get(row.account_id) ?? 0) + 1);
    }
    if ((data ?? []).length < PAGE) return { sums, counts };
  }
}

const key = (period: { periodStart: string; periodEnd: string } | { period_start: string; period_end: string }) =>
  'periodStart' in period ? `${period.periodStart}_${period.periodEnd}` : `${period.period_start}_${period.period_end}`;
const windowKey = (ledgerId: string, piece: RangePiece) => `${ledgerId}|${piece.start}|${piece.end}`;

export type RangeContext = {
  /** The business's published statements, any type, newest first (loadPublishedReports); only Profit & Loss statements in `currency` are used. */
  reports: readonly ReportRow[];
  ledgers: readonly PublishedLedger[];
  currency: string;
  /** Lines the page already read, by report id. */
  preloaded?: ReadonlyMap<string, LineRow[]>;
};

function planner({ reports, ledgers, currency }: RangeContext) {
  const pnl = reports.filter((report) => report.reportType === 'profit_and_loss' && report.currency === currency);
  const ledgerOf = new Map(ledgers.map((ledger) => [key(ledger), ledger]));
  const ledgerFor = (report: ReportRow) => ledgerOf.get(key(report)) ?? null;
  return { ledgerFor, plan: (requested: PeriodRange) => planRange(requested, pnl, (report) => ledgerFor(report) !== null) };
}

/** The days a range actually covers once cut to what is published, before anything is read; null when it cannot be added up. */
export function coveredRange(context: RangeContext, requested: PeriodRange): PeriodRange | null {
  const plan = planner(context).plan(requested);
  return plan.ok ? plan.range : null;
}

/** Each requested range as a statement, or the reason it cannot be one — all of them read in one wave. */
export async function composeRanges(
  supabase: Db,
  entityId: string,
  context: RangeContext,
  requests: readonly PeriodRange[],
): Promise<RangeOutcome[]> {
  const { currency, preloaded } = context;
  const { ledgerFor, plan: planOne } = planner(context);
  const plans = requests.map(planOne);

  const pieces = plans.flatMap((plan) => (plan.ok ? plan.pieces : []));
  const reportIds = [...new Set(pieces.map((piece) => piece.report.id))];
  const ledgerIds = [...new Set(pieces.flatMap((piece) => ledgerFor(piece.report)?.id ?? []))];
  const windows = new Map<string, { ledgerId: string; piece: RangePiece }>();
  for (const piece of pieces) {
    const ledger = ledgerFor(piece.report);
    if (!piece.whole && ledger) windows.set(windowKey(ledger.id, piece), { ledgerId: ledger.id, piece });
  }

  const missing = reportIds.filter((id) => !preloaded?.has(id));
  const [read, accounts, windowList] = await Promise.all([
    loadReportLinesFor(supabase, entityId, missing),
    loadAccounts(supabase, entityId, ledgerIds),
    Promise.all([...windows].map(async ([k, w]) => [k, await loadWindow(supabase, entityId, w.ledgerId, w.piece.start, w.piece.end)] as const)),
  ]);
  const linesOf = (id: string) => preloaded?.get(id) ?? read.get(id) ?? [];
  const windowOf = new Map(windowList);

  // One match per statement, against its own lines (lib/ledger/match.ts).
  const matches = new Map<string, LedgerMatch | null>();
  const matchOf = (report: ReportRow): LedgerMatch | null => {
    if (matches.has(report.id)) return matches.get(report.id) ?? null;
    const ledger = ledgerFor(report);
    const rows = ledger ? accounts.get(ledger.id) : undefined;
    const match = rows
      ? matchLedger(
          buildTree(linesOf(report.id)),
          rows.map((a) => ({ id: a.id, name: a.name, parentId: a.parent_id, totalCents: toCents(a.total) })),
        )
      : null;
    matches.set(report.id, match);
    return match;
  };

  return plans.map((plan): RangeOutcome => {
    if (!plan.ok) return plan;
    const refuse = (reason: RangeRefusal, at: PeriodRange | null): RangeOutcome => ({ ok: false, requested: plan.requested, reason, at });
    const bases = new Set(plan.pieces.flatMap((piece) => piece.report.basis ?? []));
    if (bases.size > 1) return refuse('mixed_basis', null);

    const sliced: SlicedPiece[] = [];
    for (const piece of plan.pieces) {
      const rows = linesOf(piece.report.id);
      if (piece.whole) {
        sliced.push({ piece, rows, values: new Map(rows.map((row) => [row.id, row.currentCents])) });
        continue;
      }
      const at = { start: piece.report.periodStart, end: piece.report.periodEnd };
      const ledger = ledgerFor(piece.report);
      const match = matchOf(piece.report);
      const window = ledger ? windowOf.get(windowKey(ledger.id, piece)) : undefined;
      // Every account line has to come back out of the ledger, or the split would leave one out.
      if (!match?.passed || !window) return refuse('unsplittable', at);
      const byLine = new Map(match.lines.map((line) => [line.lineId, line]));
      const values = sliceStatement(rows, (node) => sumCents((byLine.get(node.id)?.accountIds ?? []).map((id) => window.sums.get(id) ?? 0)));
      if (!values) return refuse('unsplittable', at);
      sliced.push({ piece, rows, values });
    }

    const composed = composeRange(sliced);
    if (!composed) return refuse('layout', null);

    // The transactions behind each account line: every piece that gives the
    // line a figure has to have its ledger behind it, or the list would not
    // add up to the figure beside it.
    const parents = new Set(composed.rows.flatMap((row) => row.parentLineId ?? []));
    const ledgerLines = new Map<string, RangeLedgerLine>();
    for (const row of composed.rows) {
      if (row.isTotal || row.isSection || parents.has(row.id) || !row.currentCents) continue;
      const parts: RangeLedgerPart[] = [];
      let count = 0;
      let complete = true;
      for (const source of composed.sources.get(row.id) ?? []) {
        const piece = sliced[source.piece]!;
        const figure = piece.values.get(source.lineId) ?? 0;
        const ledger = ledgerFor(piece.piece.report);
        const line = matchOf(piece.piece.report)?.lines.find((l) => l.lineId === source.lineId && l.status === 'matched');
        if (!ledger || !line) {
          if (figure !== 0) complete = false;
          continue;
        }
        const ledgerAccounts = accounts.get(ledger.id) ?? [];
        const window = piece.piece.whole ? null : windowOf.get(windowKey(ledger.id, piece.piece));
        count += line.accountIds.reduce(
          (sum, id) => sum + (window ? (window.counts.get(id) ?? 0) : (ledgerAccounts.find((a) => a.id === id)?.transaction_count ?? 0)),
          0,
        );
        parts.push({ ledgerId: ledger.id, accountIds: line.accountIds, start: piece.piece.start, end: piece.piece.end, whole: piece.piece.whole });
      }
      if (complete && count > 0) ledgerLines.set(row.id, { count, parts });
    }

    const report: ReportRow = {
      id: `range:${periodParam(plan.range)}`,
      reportType: 'profit_and_loss',
      basis: [...bases][0] ?? null,
      currency,
      periodStart: plan.range.start,
      periodEnd: plan.range.end,
      comparativeStart: null,
      comparativeEnd: null,
      source: plan.pieces.every((piece) => piece.report.source === 'firm_entry') ? 'firm_entry' : 'firm_document',
      documentVersionId: null,
      publishedAt: null,
    };
    return {
      ok: true,
      statement: {
        report,
        rows: composed.rows,
        requested: plan.requested,
        clamped: plan.clamped,
        pieces: sliced.map((piece) => ({
          report: {
            ...piece.piece.report,
            periodStart: piece.piece.start,
            periodEnd: piece.piece.end,
            comparativeStart: null,
            comparativeEnd: null,
          },
          rows: piecesRows(piece),
          whole: piece.piece.whole,
        })),
        fromLedger: plan.pieces.some((piece) => !piece.whole),
        ledger: ledgerLines,
      },
    };
  });
}

/**
 * The transactions behind one line of a range, newest first: each ledger's
 * accounts, whole for a statement the range covers and between the range's
 * dates for one it cuts through — the same reads its figure was added from.
 */
export async function loadRangeLineTransactions(supabase: Db, entityId: string, line: RangeLedgerLine): Promise<LedgerTxn[]> {
  const lists = await Promise.all(
    line.parts.map((part) => loadLedgerTransactions(supabase, entityId, part.accountIds, part.whole ? undefined : { start: part.start, end: part.end })),
  );
  return lists.flat().sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * One range, for a route that has only the URL: the business's published
 * statements and ledgers, then the range. The pages read those in their first
 * wave and call composeRanges / loadRangeView themselves.
 */
export async function loadRange(supabase: Db, entityId: string, currency: string, period: PeriodRange): Promise<RangeOutcome> {
  const [reports, ledgers] = await Promise.all([loadPublishedReports(supabase, entityId), loadPublishedLedgers(supabase, entityId)]);
  const [outcome] = await composeRanges(supabase, entityId, { reports, ledgers, currency }, [period]);
  return outcome ?? { ok: false, requested: period, reason: 'nothing_published', at: null };
}
