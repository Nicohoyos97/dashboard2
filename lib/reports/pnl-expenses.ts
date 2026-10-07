// The Expenses page read off a Profit & Loss: every account under Cost of
// Goods Sold and under Expenses, as the statement prints it. Nothing is
// inferred — a P&L carries no transactions and no vendors, so the page built
// on this shows accounts and their amounts, and shares computed in TypeScript
// against the section's own printed total.
import { PNL_SYNONYMS } from './pnl';
import { findSection } from './sections';
import type { LineNode } from './types';

export type PnlExpenseKind = 'cogs' | 'operating';

export type PnlExpenseLine = {
  id: string;
  label: string;
  /** The heading the account sits under inside its section ("Utilities"), null at the section's top level. */
  group: string | null;
  kind: PnlExpenseKind;
  cents: number;
};

function leaves(section: LineNode | null, kind: PnlExpenseKind): PnlExpenseLine[] {
  if (!section) return [];
  const out: PnlExpenseLine[] = [];
  const visit = (node: LineNode, group: string | null) => {
    if (node.isTotal) return;
    if (node.children.length > 0) {
      for (const child of node.children) visit(child, node.accountName);
      return;
    }
    // A credit to an expense account is still a line the statement prints; only
    // a line with no amount, or exactly zero, has nothing to show.
    if (node.isSection || node.currentCents === null || node.currentCents === 0) return;
    out.push({ id: node.id, label: node.accountName, group, kind, cents: node.currentCents });
  };
  for (const child of section.children) visit(child, null);
  return out;
}

/** Cost of goods sold and operating expense accounts, largest first. */
export function pnlExpenseLines(roots: readonly LineNode[]): PnlExpenseLine[] {
  return [
    ...leaves(findSection(roots, PNL_SYNONYMS.cogs), 'cogs'),
    ...leaves(findSection(roots, PNL_SYNONYMS.operatingExpenses), 'operating'),
  ].sort((a, b) => b.cents - a.cents);
}

/** Percent of `totalCents`, one decimal; null when there is no printed total to measure against. */
export function shareOf(cents: number, totalCents: number | null): number | null {
  if (totalCents === null || totalCents === 0) return null;
  return Math.round((cents / totalCents) * 1000) / 10;
}
