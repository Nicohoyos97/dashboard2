// Where a click on a P&L account goes once the month has a General Ledger.
// Never into the statement itself (owner, 2026-10-19: the P&L shows account
// and sub-account totals only): cost of goods sold and expense accounts open
// on the Expenses page, every other account on its own page.
import { periodParam } from '@/lib/portal/period-param';
import { pnlExpenseLines } from '@/lib/reports/pnl-expenses';
import type { LineNode } from '@/lib/reports/types';

import type { LedgerDetail } from './load';

export type LineLink = { href: string; count: number };

export function ledgerLinks(roots: readonly LineNode[], detail: LedgerDetail | null): Record<string, LineLink> {
  if (!detail) return {};
  const period = periodParam({ start: detail.periodStart, end: detail.periodEnd });
  const expenseIds = new Set(pnlExpenseLines(roots).map((line) => line.id));
  const links: Record<string, LineLink> = {};
  for (const [lineId, line] of detail.lines) {
    links[lineId] = {
      count: line.count,
      href: expenseIds.has(lineId)
        ? `/expenses?period=${period}&line=${lineId}`
        : `/statements/profit-and-loss/lines/${lineId}?period=${period}`,
    };
  }
  return links;
}

/** The expense accounts a composition chart draws, each with its link when it has one. Matched by line, through the label the chart prints. */
export function compositionLinks(roots: readonly LineNode[], links: Record<string, LineLink>): Map<string, string> {
  const byLabel = new Map<string, string>();
  const seen = new Set<string>();
  const ambiguous = new Set<string>();
  for (const line of pnlExpenseLines(roots)) {
    if (seen.has(line.label)) ambiguous.add(line.label);
    seen.add(line.label);
    const link = links[line.id];
    if (link) byLabel.set(line.label, link.href);
  }
  // Two accounts printing the same name cannot be told apart by a label: neither gets a link.
  return new Map([...byLabel].filter(([label]) => !ambiguous.has(label)));
}
