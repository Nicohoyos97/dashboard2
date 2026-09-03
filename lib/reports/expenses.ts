// Expenses read model (INITIAL_PROMPT.md §7 Expenses). One source only:
// debits on published bank statements. The P&L's own expense composition is a
// different source and lives on the statement page — the two are never summed
// or compared as one figure (spec §3). Money is integer cents throughout and
// every total is computed here, never by the model.
import { sumCents, variance } from '@/lib/money';

import { monthFromIndex, monthIndex, monthKey, parseIsoDate } from './dates';

export const EXPENSE_KINDS = [
  'operating',
  'cogs',
  'payroll',
  'occupancy',
  'marketing',
  'professional_services',
  'other',
] as const;

export type ExpenseKind = (typeof EXPENSE_KINDS)[number];

export type ExpenseTxn = {
  id: string;
  date: string;
  description: string;
  vendor: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryKind: ExpenseKind | null;
  categoryIsFixed: boolean | null;
  bankAccountId: string;
  isRecurring: boolean | null;
  amountCents: number;
  pageNumber: number | null;
  documentVersionId: string | null;
};

/** One slice of a composition (category, vendor, kind), with the row count behind it. */
export type ExpenseGroup = { key: string; label: string; cents: number; count: number };

export type ExpenseSplit = { yesCents: number; noCents: number; unknownCents: number };

export type ExpenseTotals = {
  totalCents: number;
  count: number;
  byKind: Record<ExpenseKind, number>;
  uncategorizedCents: number;
  recurring: ExpenseSplit;
  /** Only categories that carry an explicit is_fixed flag; the rest stay unknown. */
  fixed: ExpenseSplit;
};

export type ExpenseDelta = { currentCents: number; priorCents: number | null; deltaCents: number | null; deltaPct: number | null };

function emptyKinds(): Record<ExpenseKind, number> {
  return Object.fromEntries(EXPENSE_KINDS.map((kind) => [kind, 0])) as Record<ExpenseKind, number>;
}

function split(txns: readonly ExpenseTxn[], flag: (txn: ExpenseTxn) => boolean | null): ExpenseSplit {
  const bucket = (want: boolean | null) => sumCents(txns.filter((txn) => flag(txn) === want).map((txn) => txn.amountCents));
  return { yesCents: bucket(true), noCents: bucket(false), unknownCents: bucket(null) };
}

export function expenseTotals(txns: readonly ExpenseTxn[]): ExpenseTotals {
  const byKind = emptyKinds();
  for (const txn of txns) {
    if (txn.categoryKind !== null) byKind[txn.categoryKind] += txn.amountCents;
  }
  return {
    totalCents: sumCents(txns.map((txn) => txn.amountCents)),
    count: txns.length,
    byKind,
    uncategorizedCents: sumCents(txns.filter((txn) => txn.categoryId === null).map((txn) => txn.amountCents)),
    recurring: split(txns, (txn) => txn.isRecurring),
    fixed: split(txns, (txn) => txn.categoryIsFixed),
  };
}

function group(
  txns: readonly ExpenseTxn[],
  keyOf: (txn: ExpenseTxn) => string | null,
  labelOf: (txn: ExpenseTxn) => string | null,
  unlabelled: string,
): ExpenseGroup[] {
  const groups = new Map<string, ExpenseGroup>();
  for (const txn of txns) {
    const key = keyOf(txn) ?? '';
    const existing = groups.get(key);
    if (existing) {
      existing.cents = sumCents([existing.cents, txn.amountCents]);
      existing.count += 1;
      continue;
    }
    groups.set(key, { key, label: labelOf(txn) ?? unlabelled, cents: txn.amountCents, count: 1 });
  }
  return [...groups.values()].sort((a, b) => b.cents - a.cents);
}

/** Spend per category, largest first. Rows with no category fold into one `unlabelled` slice. */
export function byCategory(txns: readonly ExpenseTxn[], unlabelled: string): ExpenseGroup[] {
  return group(txns, (txn) => txn.categoryId, (txn) => txn.categoryName, unlabelled);
}

/** Spend per vendor, largest first. Vendors are only known when the extraction recorded one. */
export function byVendor(txns: readonly ExpenseTxn[], unlabelled: string): ExpenseGroup[] {
  return group(txns, (txn) => txn.vendor, (txn) => txn.vendor, unlabelled);
}

export type MonthSpend = { month: string; cents: number };

/**
 * One entry per calendar month of `range`, zero-filled and ascending. Callers
 * pass only ranges that published statements fully cover, so a zero month is a
 * month with no debits — not a month we have no statements for.
 */
export function expensesByMonth(txns: readonly ExpenseTxn[], range: { start: string; end: string }): MonthSpend[] {
  const from = parseIsoDate(range.start);
  const to = parseIsoDate(range.end);
  if (!from || !to) return [];
  const first = monthIndex(from.year, from.month);
  const last = monthIndex(to.year, to.month);
  if (last < first) return [];
  const months = new Map<string, MonthSpend>();
  for (let index = first; index <= last; index += 1) {
    const { year, month } = monthFromIndex(index);
    months.set(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`, {
      month: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`,
      cents: 0,
    });
  }
  for (const txn of txns) {
    if (txn.date < range.start || txn.date > range.end) continue;
    const bucket = months.get(monthKey(txn.date));
    if (bucket) bucket.cents = sumCents([bucket.cents, txn.amountCents]);
  }
  return [...months.values()];
}

/** `priorCents` is null when no prior period is published — never zero, which would read as "spent nothing". */
export function expenseDelta(currentCents: number, priorCents: number | null): ExpenseDelta {
  if (priorCents === null) return { currentCents, priorCents, deltaCents: null, deltaPct: null };
  const { deltaCents, pct } = variance(currentCents, priorCents);
  return { currentCents, priorCents, deltaCents, deltaPct: pct };
}
