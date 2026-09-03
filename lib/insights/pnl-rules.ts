// Rules that read the P&L tree. Prior figures come from the statement's own
// comparative column when it has one, otherwise from the prior report's tree
// matched by account name — never from an estimate.
import { variance } from '@/lib/money';
import { PNL_SYNONYMS } from '@/lib/reports/pnl';
import { findSection, normalizeName, walk } from '@/lib/reports/sections';
import type { LineNode, Metric } from '@/lib/reports/types';

import { INSIGHT_LINKS, THRESHOLDS, round1 } from './types';
import type { Insight, PnlInput } from './types';

const PAYROLL = /\b(payroll|wages|salaries|salary)\b/;

/** Current-vs-prior change of a headline metric: comparative column first, else the prior report's figure. */
export function metricChange(metric: Metric, priorMetric: Metric | undefined): { deltaCents: number; deltaPct: number | null } | null {
  if (metric.deltaCents !== null) return { deltaCents: metric.deltaCents, deltaPct: metric.deltaPct };
  if (!metric.current || !priorMetric?.current) return null;
  const { deltaCents, pct } = variance(metric.current.cents, priorMetric.current.cents);
  return { deltaCents, deltaPct: pct };
}

function priorCentsOf(line: LineNode, priorLines: readonly LineNode[] | undefined): number | null {
  if (line.priorCents !== null || !priorLines) return line.priorCents;
  const name = normalizeName(line.accountName);
  let found: number | null = null;
  walk(priorLines, (node) => {
    if (found === null && normalizeName(node.accountName) === name && node.isTotal === line.isTotal) found = node.currentCents;
  });
  return found;
}

/** The payroll figure: a printed payroll total wins over a single payroll account line. */
export function payrollLine(roots: readonly LineNode[]): LineNode | null {
  let total: LineNode | null = null;
  let leaf: LineNode | null = null;
  walk(roots, (node) => {
    if (!PAYROLL.test(normalizeName(node.accountName)) || node.currentCents === null) return;
    if (node.isTotal) total ??= node;
    else if (node.children.length === 0) leaf ??= node;
  });
  return total ?? leaf;
}

export function payrollShareUp(pnl: PnlInput): Insight | null {
  if (!pnl.lines) return null;
  const line = payrollLine(pnl.lines);
  const revenue = pnl.current.revenue.current;
  const priorRevenue = pnl.current.revenue.prior ?? pnl.prior?.revenue.current ?? null;
  if (!line || line.currentCents === null || !revenue || !priorRevenue || revenue.cents === 0 || priorRevenue.cents === 0) return null;
  const priorPayroll = priorCentsOf(line, pnl.priorLines);
  if (priorPayroll === null) return null;
  const currentShare = (line.currentCents / revenue.cents) * 100;
  const priorShare = (priorPayroll / priorRevenue.cents) * 100;
  const points = currentShare - priorShare;
  if (points < THRESHOLDS.payrollSharePoints) return null;
  return {
    ruleKey: 'payroll_share_up',
    severity: 'warning',
    priority: 3,
    linkPath: INSIGHT_LINKS.pnl,
    params: {
      account: line.accountName,
      lineId: line.id,
      currentSharePct: round1(currentShare),
      priorSharePct: round1(priorShare),
      points: round1(points),
    },
  };
}

/** Detail lines under the expense sections; a flat statement falls back to the `section` column. */
function expenseLeaves(roots: readonly LineNode[]): LineNode[] {
  const synonyms: readonly string[] = [...PNL_SYNONYMS.operatingExpenses, ...PNL_SYNONYMS.cogs];
  const sections = [findSection(roots, PNL_SYNONYMS.operatingExpenses), findSection(roots, PNL_SYNONYMS.cogs)].filter(
    (s): s is LineNode => s !== null,
  );
  const leaves: LineNode[] = [];
  const isLeaf = (node: LineNode) => node.children.length === 0 && !node.isTotal && !node.isSection && node.currentCents !== null;
  if (sections.length > 0) {
    walk(sections, (node) => {
      if (isLeaf(node)) leaves.push(node);
    });
    return leaves;
  }
  walk(roots, (node) => {
    if (isLeaf(node) && node.section !== null && synonyms.includes(normalizeName(node.section))) leaves.push(node);
  });
  return leaves;
}

export function categoryUpMaterial(pnl: PnlInput): Insight | null {
  if (!pnl.lines) return null;
  let best: { line: LineNode; deltaCents: number; deltaPct: number; priorCents: number } | null = null;
  for (const line of expenseLeaves(pnl.lines)) {
    const priorCents = priorCentsOf(line, pnl.priorLines);
    if (priorCents === null || line.currentCents === null) continue;
    const { deltaCents, pct } = variance(line.currentCents, priorCents);
    if (pct === null || pct < THRESHOLDS.categoryUpPct || deltaCents < THRESHOLDS.categoryUpMinCents) continue;
    if (!best || deltaCents > best.deltaCents) best = { line, deltaCents, deltaPct: pct, priorCents };
  }
  if (!best) return null;
  return {
    ruleKey: 'category_up_material',
    severity: 'info',
    priority: 3,
    linkPath: INSIGHT_LINKS.pnl,
    params: {
      account: best.line.accountName,
      lineId: best.line.id,
      currentCents: best.line.currentCents ?? 0,
      priorCents: best.priorCents,
      deltaCents: best.deltaCents,
      deltaPct: round1(best.deltaPct),
    },
  };
}

export function marginChanged(pnl: PnlInput): Insight | null {
  const moves = [
    { margin: 'gross', current: pnl.current.grossMarginPct, prior: pnl.prior?.grossMarginPct ?? pnl.current.priorGrossMarginPct },
    { margin: 'net', current: pnl.current.netMarginPct, prior: pnl.prior?.netMarginPct ?? pnl.current.priorNetMarginPct },
  ]
    .flatMap((m) => (m.current === null || m.prior === null ? [] : [{ ...m, points: m.current - m.prior }]))
    .filter((m) => Math.abs(m.points) >= THRESHOLDS.marginPoints)
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  const move = moves[0];
  if (!move || move.current === null || move.prior === null) return null;
  return {
    ruleKey: 'margin_changed',
    // A shrinking margin needs attention; a growing one is good news.
    severity: move.points < 0 ? 'warning' : 'info',
    priority: 2,
    linkPath: INSIGHT_LINKS.pnl,
    params: { margin: move.margin, currentPct: round1(move.current), priorPct: round1(move.prior), points: round1(move.points) },
  };
}
