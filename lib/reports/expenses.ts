// Expenses read model (INITIAL_PROMPT.md §7 Expenses). One source only:
// debits on published bank statements. The P&L's own expense composition is a
// different source and lives on the statement page — the two are never summed
// or compared as one figure (spec §3). Money is integer cents throughout.
//
// The grouping itself (totals by kind, the recurring and fixed splits, the
// category, vendor and month series) runs in Postgres — `portal_expense_summary`
// in migration 0011 — because PostgREST cannot group and the page was pulling
// every row of the period to add them up in memory. What stays here is the
// shape those figures take and the one comparison the SQL does not do.
import { variance } from '@/lib/money';

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

/** `priorCents` is null when no prior period is published — never zero, which would read as "spent nothing". */
export function expenseDelta(currentCents: number, priorCents: number | null): ExpenseDelta {
  if (priorCents === null) return { currentCents, priorCents, deltaCents: null, deltaPct: null };
  const { deltaCents, pct } = variance(currentCents, priorCents);
  return { currentCents, priorCents, deltaCents, deltaPct: pct };
}
