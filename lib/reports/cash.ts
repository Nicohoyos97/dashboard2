// Cash In / Cash Out come from published bank transactions and nothing else
// (spec §3: sources never mix, cash flow is never inferred from a P&L).
// Convention: a credit on a deposit account is money in, a debit is money out;
// callers normalise credit-card accounts before passing rows here.
import { sumCents, variance } from '@/lib/money';

import { monthFromIndex, monthIndex, monthKey, parseIsoDate } from './dates';

export type BankTransactionRow = { date: string; debitCents: number | null; creditCents: number | null };
export type DateRange = { start: string; end: string };
export type MonthCash = { month: string; inCents: number; outCents: number; netCents: number };
export type CashTotals = { inCents: number; outCents: number; netCents: number };
export type CashMetricKey = 'cashIn' | 'cashOut' | 'netCash';
export type CashMetric = {
  key: CashMetricKey;
  currentCents: number;
  priorCents: number | null;
  deltaCents: number | null;
  deltaPct: number | null;
};
export type CashComparison = Record<CashMetricKey, CashMetric>;

function monthSpan(transactions: readonly BankTransactionRow[], range: DateRange | undefined): { first: number; last: number } | null {
  const bounds = range ?? {
    start: transactions.reduce<string | null>((min, tx) => (min === null || tx.date < min ? tx.date : min), null) ?? '',
    end: transactions.reduce<string | null>((max, tx) => (max === null || tx.date > max ? tx.date : max), null) ?? '',
  };
  const start = parseIsoDate(bounds.start);
  const end = parseIsoDate(bounds.end);
  if (!start || !end) return null;
  const first = monthIndex(start.year, start.month);
  const last = monthIndex(end.year, end.month);
  return last < first ? null : { first, last };
}

/** One entry per month of the range (or of the data when no range), zero-filled, ascending. */
export function cashByMonth(transactions: readonly BankTransactionRow[], range?: DateRange): MonthCash[] {
  const span = monthSpan(transactions, range);
  if (!span) return [];
  const months = new Map<string, MonthCash>();
  for (let index = span.first; index <= span.last; index += 1) {
    const { year, month } = monthFromIndex(index);
    const key = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
    months.set(key, { month: key, inCents: 0, outCents: 0, netCents: 0 });
  }
  for (const tx of transactions) {
    if (range && (tx.date < range.start || tx.date > range.end)) continue;
    const bucket = months.get(monthKey(tx.date));
    if (!bucket) continue;
    bucket.inCents = sumCents([bucket.inCents, tx.creditCents ?? 0]);
    bucket.outCents = sumCents([bucket.outCents, tx.debitCents ?? 0]);
    bucket.netCents = bucket.inCents - bucket.outCents;
  }
  return [...months.values()];
}

export function cashTotals(months: readonly MonthCash[]): CashTotals {
  const inCents = sumCents(months.map((m) => m.inCents));
  const outCents = sumCents(months.map((m) => m.outCents));
  return { inCents, outCents, netCents: inCents - outCents };
}

function cashMetric(key: CashMetricKey, currentCents: number, priorCents: number | null): CashMetric {
  if (priorCents === null) return { key, currentCents, priorCents, deltaCents: null, deltaPct: null };
  const { deltaCents, pct } = variance(currentCents, priorCents);
  return { key, currentCents, priorCents, deltaCents, deltaPct: pct };
}

/** Current totals against the prior range's totals; `priorMonths` may be empty when no prior data is published. */
export function cashComparison(months: readonly MonthCash[], priorMonths: readonly MonthCash[]): CashComparison {
  const current = cashTotals(months);
  const prior = priorMonths.length === 0 ? null : cashTotals(priorMonths);
  return {
    cashIn: cashMetric('cashIn', current.inCents, prior?.inCents ?? null),
    cashOut: cashMetric('cashOut', current.outCents, prior?.outCents ?? null),
    netCash: cashMetric('netCash', current.netCents, prior?.netCents ?? null),
  };
}

export type BalancePoint = { date: string; balanceCents: number };

/**
 * Printed ending balances in date order, one point per statement (accounts
 * are not summed: their statement dates rarely line up — the UI filters by
 * account). Statements without a printed balance are skipped, not guessed.
 */
export function endingBalanceSeries(
  statements: readonly { periodEnd: string; endingBalanceCents: number | null }[],
): BalancePoint[] {
  return statements
    .flatMap((s) => (s.endingBalanceCents === null ? [] : [{ date: s.periodEnd, balanceCents: s.endingBalanceCents }]))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
