// Splitting one published Profit & Loss by date (lib/reports/range.ts): every
// line worked out again from its account lines, each carrying only the
// ledger transactions inside the range. Only the account lines come from the
// ledger; totals follow from them by the statement's own arithmetic, and a
// statement whose printed totals that arithmetic does not give back is
// refused rather than split.
import { sumCents } from '@/lib/money';

import { normalizeName } from './sections';
import { buildTree } from './tree';
import type { LineNode, LineRow } from './types';

// The headline relationships, recognised by name because their parts are not
// plain siblings. The same patterns the upload checks with
// (lib/ingestion/reconcile-statement.ts), so a statement that passed review
// is one this can re-add.
const TOTAL = {
  income: /^total (?:for )?(income|revenue|revenues|sales)\b/,
  cogs: /^total (?:for )?(cost of (goods sold|sales)|cogs)\b/,
  expenses: /^total (?:for )?(operating )?expenses?\b/,
  otherIncome: /^total (?:for )?other income\b/,
  otherExpenses: /^total (?:for )?other expenses?\b/,
};
const HEADING: Record<keyof typeof TOTAL, readonly string[]> = {
  income: ['income', 'revenue', 'revenues', 'sales'],
  cogs: ['cost of goods sold', 'cost of sales', 'cogs'],
  expenses: ['expenses', 'operating expenses'],
  otherIncome: ['other income'],
  otherExpenses: ['other expenses', 'other expense'],
};
const DERIVED = {
  grossProfit: /^gross (profit|margin)\b/,
  netOperatingIncome: /^net operating (income|loss|profit)\b/,
  netOtherIncome: /^net other (income|expenses?|loss)\b/,
  netIncome: /^net (income|loss|profit|earnings)\b(?!.*operating)/,
};
// A loose line between operating and net income whose name says it takes
// from net income: printed plain it is subtracted, in parentheses it already
// carries its sign — the upload's rule, read off the printed figure so a
// split keeps each line's direction.
const REDUCES_INCOME = /\b(expenses?|loss(es)?|costs?|fees?|tax(es)?)\b/;

export function flatten(roots: readonly LineNode[]): LineNode[] {
  const out: LineNode[] = [];
  const visit = (node: LineNode) => {
    out.push(node);
    for (const child of node.children) visit(child);
  };
  for (const root of roots) visit(root);
  return out;
}

function isLeaf(node: LineNode): boolean {
  return node.children.length === 0 && !node.isTotal && !node.isSection;
}

/**
 * Every line of a statement worked out from its account lines alone, each
 * account carrying `leaf(node)`. Totals inside a section add up the lines
 * above them; the root totals follow the statement's own arithmetic. A total
 * the rule cannot place comes back null.
 */
function evaluate(roots: readonly LineNode[], leaf: (node: LineNode) => number): Map<string, number | null> {
  const values = new Map<string, number | null>();
  const parentOf = new Map<string, LineNode | null>();
  const siblingsOf = (node: LineNode): readonly LineNode[] => {
    const parent = parentOf.get(node.id) ?? null;
    return parent ? parent.children : roots;
  };
  const all = flatten(roots);
  for (const node of all) for (const child of node.children) parentOf.set(child.id, node);
  for (const root of roots) parentOf.set(root.id, null);

  const add = (parts: readonly (number | null)[]): number | null => {
    const known = parts.filter((v): v is number => v !== null);
    return known.length === 0 ? null : sumCents(known);
  };
  /** The lines a total adds up: its children, else the siblings above it back to the previous total. */
  const partsOf = (total: LineNode): LineNode[] => {
    if (total.children.length > 0) return total.children.filter((child) => !child.isTotal);
    const siblings = siblingsOf(total);
    const parts: LineNode[] = [];
    for (let index = siblings.indexOf(total) - 1; index >= 0; index -= 1) {
      const sibling = siblings[index]!;
      if (sibling.isTotal) break;
      parts.unshift(sibling);
    }
    return parts;
  };

  const valueOf = (node: LineNode): number | null => {
    if (values.has(node.id)) return values.get(node.id) ?? null;
    let value: number | null;
    if (isLeaf(node)) value = leaf(node);
    else if (node.isTotal) value = parentOf.get(node.id) === null && derivedName(node) ? null : add(partsOf(node).map(valueOf));
    else if (node.children.length > 0) {
      const totals = node.children.filter((child) => child.isTotal);
      const total = totals.at(-1);
      value = total ? valueOf(total) : add(node.children.map(valueOf));
    } else value = null;
    values.set(node.id, value);
    return value;
  };
  for (const node of all) valueOf(node);

  // The root totals that are not sums of the lines above them.
  const sectionValue = (key: keyof typeof TOTAL): number | null => {
    const total = all.find((node) => node.isTotal && TOTAL[key].test(normalizeName(node.accountName)));
    if (total) return values.get(total.id) ?? null;
    const heading = all.find((node) => !node.isTotal && node.children.length > 0 && HEADING[key].includes(normalizeName(node.accountName)));
    return heading ? (values.get(heading.id) ?? null) : null;
  };
  const income = sectionValue('income');
  const cogs = sectionValue('cogs') ?? 0;
  const expenses = sectionValue('expenses') ?? 0;
  const otherIncome = sectionValue('otherIncome');
  const otherExpenses = sectionValue('otherExpenses');
  const gross = income === null ? null : income - cogs;
  const operating = gross === null ? null : gross - expenses;
  const other = (): number => {
    if (otherIncome !== null || otherExpenses !== null) return (otherIncome ?? 0) - (otherExpenses ?? 0);
    // No named totals: the loose root lines between the expenses (their total,
    // or the section holding it) and net income.
    const holds = (root: LineNode, test: (node: LineNode) => boolean): boolean => flatten([root]).some(test);
    const isExpensesTotal = (node: LineNode) => node.isTotal && TOTAL.expenses.test(normalizeName(node.accountName));
    const expensesAt = roots.findIndex((root) => holds(root, isExpensesTotal));
    let netIncomeAt = -1;
    roots.forEach((root, index) => {
      if (root.isTotal && DERIVED.netIncome.test(normalizeName(root.accountName))) netIncomeAt = index;
    });
    if (expensesAt < 0 || netIncomeAt < 0) return 0;
    return sumCents(
      roots.slice(expensesAt + 1, netIncomeAt).flatMap((node) => {
        if (!isLeaf(node)) return [];
        const value = values.get(node.id) ?? 0;
        const reduces = REDUCES_INCOME.test(normalizeName(node.accountName)) && (node.currentCents ?? 0) > 0;
        return [reduces ? -value : value];
      }),
    );
  };
  for (const node of roots) {
    const name = derivedName(node);
    if (!node.isTotal || !name) continue;
    const value =
      name === 'grossProfit'
        ? gross
        : name === 'netOperatingIncome'
          ? operating
          : name === 'netOtherIncome'
            ? (otherIncome ?? 0) - (otherExpenses ?? 0)
            : operating === null
              ? null
              : operating + other();
    values.set(node.id, value);
  }
  return values;
}

function derivedName(node: LineNode): keyof typeof DERIVED | null {
  if (!node.isTotal) return null;
  const name = normalizeName(node.accountName);
  for (const key of Object.keys(DERIVED) as (keyof typeof DERIVED)[]) if (DERIVED[key].test(name)) return key;
  return null;
}

/**
 * The statement as it would print if each account line carried `leaf(node)`.
 * Null when the rule does not give back the statement's own printed totals
 * from its own printed accounts: then this layout is not one it can re-add,
 * and the caller refuses the split.
 */
export function sliceStatement(rows: readonly LineRow[], leaf: (node: LineNode) => number): Map<string, number | null> | null {
  const roots = buildTree(rows);
  const printed = evaluate(roots, (node) => node.currentCents ?? 0);
  for (const node of flatten(roots)) {
    // Every printed total, and every heading that prints a figure of its own.
    if (node.currentCents === null || isLeaf(node)) continue;
    if (printed.get(node.id) !== node.currentCents) return null;
  }
  const sliced = evaluate(roots, leaf);
  // What the statement leaves blank stays blank: a heading, a total it does
  // not print, an account nothing in the range lands on.
  for (const node of flatten(roots)) {
    if (node.currentCents === null && (!isLeaf(node) || sliced.get(node.id) === 0)) sliced.set(node.id, null);
  }
  return sliced;
}
