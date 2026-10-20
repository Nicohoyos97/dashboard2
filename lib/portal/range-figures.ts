// A range's statement read the way the pages read a published one: its tree
// (with the previous range beside it as the comparison column, when that one
// adds up too), its headline figures, the same figures piece by piece for the
// charts, and where each account line opens onto its transactions.
import 'server-only';

import type { LineLink } from '@/lib/ledger/links';
import { amountsByPath, withComparison } from '@/lib/reports/compare';
import { PNL_SYNONYMS, type PnlMetricKey, type PnlMetrics, pnlMetrics } from '@/lib/reports/pnl';
import { pnlExpenseLines } from '@/lib/reports/pnl-expenses';
import { buildTree } from '@/lib/reports/tree';
import type { LineNode, Metric, ReportRow } from '@/lib/reports/types';

import type { RangeStatement } from './range-statement';

export type RangeFigures = {
  /** The range as a statement; its comparative period is the previous range when there is one. */
  report: ReportRow;
  /** The range's own lines, without the comparison. */
  current: LineNode[];
  /** With the previous range as the prior column, when it adds up. */
  roots: LineNode[];
  hasPrior: boolean;
  metrics: PnlMetrics;
  /** Oldest first: each statement the range is made of, cut to its days. */
  pieces: { report: ReportRow; roots: LineNode[]; metrics: PnlMetrics }[];
  /** Account line id → its transactions on Expenses, for the cost and expense lines the ledgers carry. */
  links: Record<string, LineLink>;
  statement: RangeStatement;
};

export function rangeFigures(statement: RangeStatement, prior: RangeStatement | null, periodValue: string): RangeFigures {
  const current = buildTree(statement.rows);
  const roots = prior ? withComparison(current, amountsByPath(buildTree(prior.rows))) : current;
  const report: ReportRow = prior
    ? { ...statement.report, comparativeStart: prior.report.periodStart, comparativeEnd: prior.report.periodEnd }
    : statement.report;
  const pieces = statement.pieces.map((piece) => {
    const tree = buildTree(piece.rows);
    return { report: piece.report, roots: tree, metrics: pnlMetrics(piece.report, tree) };
  });

  // Only Expenses lists a range's accounts with their transactions; the other
  // lines have no page of their own outside one published statement.
  const expenseIds = new Set(pnlExpenseLines(current).map((line) => line.id));
  const links: Record<string, LineLink> = {};
  for (const [id, line] of statement.ledger) {
    if (expenseIds.has(id)) links[id] = { count: line.count, href: `/expenses?period=${periodValue}&line=${id}` };
  }

  return {
    report,
    current,
    roots,
    hasPrior: prior !== null,
    metrics: prior ? pnlMetrics(report, roots) : withoutColumnReason(pnlMetrics(report, roots)),
    pieces,
    links,
    statement,
  };
}

/**
 * A range prints no comparative column, so none is missing: without a previous
 * range to set beside it, a card simply has no prior period.
 */
function withoutColumnReason(metrics: PnlMetrics): PnlMetrics {
  const out = { ...metrics };
  for (const key of Object.keys(PNL_SYNONYMS) as PnlMetricKey[]) {
    const { reason, ...metric } = out[key];
    out[key] = reason === 'no_prior_column' ? metric : out[key];
  }
  return out;
}

/**
 * A headline card's sparkline: one point per piece when every piece prints the
 * figure — a gap is never drawn as a zero — otherwise the two figures the card
 * compares, otherwise none.
 */
export function rangeSpark(figures: RangeFigures, pick: (metrics: PnlMetrics) => Metric): number[] {
  const points = figures.pieces.flatMap((piece) => {
    const cents = pick(piece.metrics).current?.cents;
    return cents === undefined || cents === null ? [] : [cents];
  });
  if (points.length === figures.pieces.length && points.length >= 2) return points;
  const metric = pick(figures.metrics);
  const current = metric.current?.cents ?? null;
  const prior = metric.prior?.cents ?? null;
  return current !== null && prior !== null ? [prior, current] : [];
}
