// Recognises the printed totals a statement uses for its headline figures.
// Only `isTotal` lines are read — nothing is summed from detail lines, so a
// KPI always points at a figure the document itself prints (spec §3). The
// synonym table is deliberately small; an unrecognised layout yields null with
// a reason rather than a guess.
import type { Figure, LineNode, Metric, MetricReason, ReportRow } from './types';

/** Lower-case, single-spaced, apostrophes dropped, "&" → "and", no trailing colon. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['‘’ʼ]/g, '')
    .replace(/&/g, 'and')
    .replace(/[\s:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Total Income" → "income"; "Gross Profit" → "gross profit"; "Total" → "". */
function headingOf(name: string): string {
  return normalizeName(name).replace(/^total\b\s*/, '');
}

export function walk(nodes: readonly LineNode[], visit: (node: LineNode, parent: LineNode | null) => void): void {
  const step = (node: LineNode, parent: LineNode | null) => {
    visit(node, parent);
    for (const child of node.children) step(child, node);
  };
  for (const node of nodes) step(node, null);
}

/**
 * The printed total whose heading matches one of `synonyms`. A bare "Total"
 * line borrows its parent section's name. `last` picks the final match, for
 * statements that print several candidates (QuickBooks lists "Net Operating
 * Income" before the real "Net Income").
 */
export function findTotal(
  roots: readonly LineNode[],
  synonyms: readonly string[],
  { last = false }: { last?: boolean } = {},
): LineNode | null {
  const matches: LineNode[] = [];
  walk(roots, (node, parent) => {
    if (!node.isTotal) return;
    let heading = headingOf(node.accountName);
    if (heading === '' && parent) heading = normalizeName(parent.accountName);
    if (synonyms.includes(heading)) matches.push(node);
  });
  return (last ? matches.at(-1) : matches[0]) ?? null;
}

/** The section heading (not a total) whose name matches one of `synonyms`. */
export function findSection(roots: readonly LineNode[], synonyms: readonly string[]): LineNode | null {
  let found: LineNode | null = null;
  walk(roots, (node) => {
    if (found || node.isTotal || node.children.length === 0) return;
    if (synonyms.includes(normalizeName(node.accountName))) found = node;
  });
  return found;
}

export function figureOf(line: LineNode, column: 'currentCents' | 'priorCents', report: ReportRow): Figure | null {
  const cents = line[column];
  if (cents === null) return null;
  return { cents, lineId: line.id, page: line.pageNumber, source: report.source, label: line.accountName };
}

/** Current/prior figures for one line, with the delta already computed on the node. */
export function metricFromLine(key: string, line: LineNode | null, report: ReportRow): Metric {
  if (!line) return { key, current: null, prior: null, deltaCents: null, deltaPct: null, reason: 'no_printed_total' };
  const current = figureOf(line, 'currentCents', report);
  const prior = figureOf(line, 'priorCents', report);
  const hasPriorColumn = report.comparativeStart !== null;
  let reason: MetricReason | undefined;
  if (!current) reason = 'no_printed_total';
  else if (!prior) reason = hasPriorColumn ? 'no_prior_total' : 'no_prior_column';
  return {
    key,
    current,
    prior,
    deltaCents: current && prior ? line.deltaCents : null,
    deltaPct: current && prior ? line.deltaPct : null,
    ...reasonProp(reason),
  };
}

/** Spread this so an absent reason stays absent (exactOptionalPropertyTypes forbids an explicit undefined). */
export function reasonProp(reason: MetricReason | undefined): { reason?: MetricReason } {
  return reason === undefined ? {} : { reason };
}

export function emptyMetric(key: string, reason: MetricReason): Metric {
  return { key, current: null, prior: null, deltaCents: null, deltaPct: null, reason };
}
