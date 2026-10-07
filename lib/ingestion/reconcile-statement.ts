// P&L / Balance Sheet checks. Every printed subtotal inside a section must
// equal the lines it totals; the top-level relationships (gross profit, net
// income, the balance equation) are recognised by name because their parts
// are not plain siblings.
import { sumCents } from '@/lib/money';

import type { HierarchyRow } from './hierarchy';
import { finishReconciliation, isLowConfidence, makeCheck } from './reconciliation';
import type { Reconciliation, ReconciliationCheck } from './reconciliation';
import type { StatementType } from './schemas/financial-statement';

type Column = 'currentCents' | 'priorCents';

const COLUMNS: { column: Column; suffix: string; label: string }[] = [
  { column: 'currentCents', suffix: '', label: '' },
  { column: 'priorCents', suffix: ':prior', label: ' (prior period)' },
];

// "Total Income" and QuickBooks Online's "Total for Income" are the same line.
const NAMES = {
  totalIncome: /^total (?:for )?(income|revenue|revenues|sales)\b/,
  totalCogs: /^total (?:for )?(cost of (goods sold|sales)|cogs)\b/,
  grossProfit: /^gross (profit|margin)\b/,
  totalExpenses: /^total (?:for )?(operating )?expenses?\b/,
  totalOtherIncome: /^total (?:for )?other income\b/,
  totalOtherExpenses: /^total (?:for )?other expenses?\b/,
  netIncome: /^net (income|loss|profit|earnings)\b(?!.*operating)/,
  totalAssets: /^total (?:for )?assets\b/,
  totalLiabilities: /^total (?:for )?liabilities$/,
  totalEquity: /^total (?:for )?(equity|stockholders'? equity|shareholders'? equity|owner'?s'? equity)\b/,
  totalLiabilitiesAndEquity: /^total (?:for )?liabilities (and|&) (equity|stockholders|shareholders|owner)/,
};

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

class Statement {
  private readonly children = new Map<number, number[]>();

  constructor(readonly rows: readonly HierarchyRow[]) {
    for (const row of rows) {
      if (row.parentIndex === null) continue;
      this.children.set(row.parentIndex, [...(this.children.get(row.parentIndex) ?? []), row.position]);
    }
  }

  /** What a row contributes to its parent: a leaf's own amount, a section's printed total. */
  valueOf(index: number, column: Column): number | null {
    const row = this.rows[index];
    if (!row) return null;
    const kids = this.children.get(index) ?? [];
    if (kids.length === 0) return row[column];
    const totalChild = kids.find((kid) => this.rows[kid]?.is_total);
    if (totalChild !== undefined) return this.rows[totalChild]?.[column] ?? null;
    if (row[column] !== null) return row[column];
    const parts = kids.map((kid) => this.valueOf(kid, column)).filter((v): v is number => v !== null);
    return parts.length === 0 ? null : sumCents(parts);
  }

  /** Lines a subtotal covers: its children, else the siblings back to the previous total. */
  partsOf(total: HierarchyRow): number[] {
    const kids = this.children.get(total.position) ?? [];
    if (kids.length > 0) return kids;
    const parts: number[] = [];
    for (let index = total.position - 1; index >= 0; index -= 1) {
      const row = this.rows[index];
      if (!row || row.parentIndex !== total.parentIndex) continue;
      if (row.is_total) break;
      parts.unshift(index);
    }
    return parts;
  }

  find(pattern: RegExp, column: Column, last = false): number | null {
    return this.findRow(pattern, column, last)?.[column] ?? null;
  }

  findRow(pattern: RegExp, column: Column, last = false): HierarchyRow | null {
    const matches = this.rows.filter((row) => pattern.test(normalizeName(row.account_name)) && row[column] !== null);
    return (last ? matches.at(-1) : matches[0]) ?? null;
  }

  /**
   * Top-level lines printed between two rows that are neither a total nor a
   * heading: what a statement puts between operating income and net income
   * when it has no "Total other income / expenses" line of its own.
   */
  looseBetween(from: HierarchyRow, to: HierarchyRow, column: Column): HierarchyRow[] {
    return this.rows.filter(
      (row) =>
        row.position > from.position &&
        row.position < to.position &&
        row.parentIndex === null &&
        !row.is_total &&
        !row.is_section &&
        !this.children.has(row.position) &&
        row[column] !== null,
    );
  }
}

// A loose line whose name says it takes from net income. Printed in
// parentheses it already carries its sign; printed plain it is subtracted.
const REDUCES_INCOME = /\b(expenses?|loss(es)?|costs?|fees?|tax(es)?)\b/;

function otherBelowExpenses(statement: Statement, column: Column): number {
  const named = statement.find(NAMES.totalOtherIncome, column) ?? statement.find(NAMES.totalOtherExpenses, column);
  if (named !== null) {
    return (statement.find(NAMES.totalOtherIncome, column) ?? 0) - (statement.find(NAMES.totalOtherExpenses, column) ?? 0);
  }
  // No named totals: the lines themselves. Ignoring them made a P&L that
  // printed "Unclassified expenses (104.69)" between operating income and net
  // income fail by exactly 104.69, and no correction of that line could clear
  // it, because the check never read it.
  const expenses = statement.findRow(NAMES.totalExpenses, column);
  const netIncome = statement.findRow(NAMES.netIncome, column, true);
  if (!expenses || !netIncome) return 0;
  const parts = statement.looseBetween(expenses, netIncome, column).map((row) => {
    const value = row[column] ?? 0;
    return REDUCES_INCOME.test(normalizeName(row.account_name)) && value > 0 ? -value : value;
  });
  return parts.length === 0 ? 0 : sumCents(parts);
}

function subtotalChecks(statement: Statement, column: Column, suffix: string, label: string): ReconciliationCheck[] {
  const checks: ReconciliationCheck[] = [];
  for (const row of statement.rows) {
    if (!row.is_total || row.parentIndex === null || row[column] === null) continue;
    const parts = statement.partsOf(row).map((index) => statement.valueOf(index, column));
    if (parts.length === 0 || parts.some((v) => v === null)) continue;
    const expected = sumCents(parts.filter((v): v is number => v !== null));
    checks.push(makeCheck(`subtotal:${row.ref}${suffix}`, `${row.account_name}${label}`, expected, row[column]));
  }
  return checks;
}

function namedChecks(statement: Statement, reportType: StatementType, column: Column, suffix: string, label: string) {
  const checks: ReconciliationCheck[] = [];
  const find = (pattern: RegExp, last = false) => statement.find(pattern, column, last);
  if (reportType === 'profit_and_loss') {
    const income = find(NAMES.totalIncome);
    const cogs = find(NAMES.totalCogs) ?? 0;
    const grossProfit = find(NAMES.grossProfit);
    const expenses = find(NAMES.totalExpenses);
    const netIncome = find(NAMES.netIncome, true);
    if (income !== null && grossProfit !== null) {
      checks.push(makeCheck(`gross_profit${suffix}`, `Gross profit = income − cost of goods sold${label}`, income - cogs, grossProfit));
    }
    const base = grossProfit ?? (income === null ? null : income - cogs);
    if (base !== null && expenses !== null && netIncome !== null) {
      const other = otherBelowExpenses(statement, column);
      checks.push(makeCheck(`net_income${suffix}`, `Net income = gross profit − expenses ± other${label}`, base - expenses + other, netIncome));
    }
  } else {
    const assets = find(NAMES.totalAssets);
    const liabilities = find(NAMES.totalLiabilities);
    const equity = find(NAMES.totalEquity);
    const combined = find(NAMES.totalLiabilitiesAndEquity) ?? (liabilities !== null && equity !== null ? liabilities + equity : null);
    if (assets !== null && combined !== null) {
      checks.push(makeCheck(`balance_equation${suffix}`, `Assets = liabilities + equity${label}`, combined, assets));
    }
  }
  return checks;
}

export function reconcileStatement(rows: readonly HierarchyRow[], reportType: StatementType): Reconciliation {
  const statement = new Statement(rows);
  const hasPrior = rows.some((row) => row.priorCents !== null);
  const checks = COLUMNS.filter((c) => c.column === 'currentCents' || hasPrior).flatMap(({ column, suffix, label }) => [
    ...subtotalChecks(statement, column, suffix, label),
    ...namedChecks(statement, reportType, column, suffix, label),
  ]);
  const lowConfidence = rows.filter((row) => isLowConfidence(row.confidence)).map((row) => row.ref);
  return finishReconciliation(checks, lowConfidence);
}
