// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  expenseHref,
  parseExpenseQuery,
  sortTransactions,
} from '@/lib/portal/expense-filters';
import {
  type ExpenseTxn,
  byCategory,
  byVendor,
  expenseDelta,
  expenseTotals,
  expensesByMonth,
} from '@/lib/reports/expenses';

function txn(overrides: Partial<ExpenseTxn> & { id: string; amountCents: number }): ExpenseTxn {
  return {
    date: '2026-03-15',
    description: 'Payment',
    vendor: null,
    categoryId: null,
    categoryName: null,
    categoryKind: null,
    categoryIsFixed: null,
    bankAccountId: 'checking',
    isRecurring: null,
    pageNumber: null,
    documentVersionId: null,
    ...overrides,
  };
}

const rows: ExpenseTxn[] = [
  txn({ id: 'a', amountCents: 120_00, date: '2026-01-10', categoryId: 'c1', categoryName: 'Rent', categoryKind: 'occupancy', categoryIsFixed: true, vendor: 'Landlord', isRecurring: true }),
  txn({ id: 'b', amountCents: 80_00, date: '2026-02-04', categoryId: 'c2', categoryName: 'Wages', categoryKind: 'payroll', isRecurring: true }),
  txn({ id: 'c', amountCents: 30_00, date: '2026-02-20', categoryId: 'c1', categoryName: 'Rent', categoryKind: 'occupancy', categoryIsFixed: true, vendor: 'Landlord', isRecurring: false }),
  txn({ id: 'd', amountCents: 45_00, date: '2026-03-02', vendor: 'Supplies Co' }),
];

describe('expense read model', () => {
  it('totals by kind, keeps uncategorized separate and never guesses a recurring flag', () => {
    const totals = expenseTotals(rows);
    expect(totals.totalCents).toBe(275_00);
    expect(totals.count).toBe(4);
    expect(totals.byKind.occupancy).toBe(150_00);
    expect(totals.byKind.payroll).toBe(80_00);
    expect(totals.byKind.operating).toBe(0);
    expect(totals.uncategorizedCents).toBe(45_00);
    expect(totals.recurring).toEqual({ yesCents: 200_00, noCents: 30_00, unknownCents: 45_00 });
    // Only categories carrying an explicit is_fixed flag are classified.
    expect(totals.fixed).toEqual({ yesCents: 150_00, noCents: 0, unknownCents: 125_00 });
  });

  it('groups by category and vendor largest first, folding unlabelled rows into one slice', () => {
    expect(byCategory(rows, 'Uncategorized').map((g) => [g.label, g.cents, g.count])).toEqual([
      ['Rent', 150_00, 2],
      ['Wages', 80_00, 1],
      ['Uncategorized', 45_00, 1],
    ]);
    expect(byVendor(rows, 'No vendor').map((g) => [g.label, g.cents])).toEqual([
      ['Landlord', 150_00],
      ['No vendor', 80_00],
      ['Supplies Co', 45_00],
    ]);
  });

  it('buckets months across the whole range and ignores rows outside it', () => {
    expect(expensesByMonth(rows, { start: '2026-01-01', end: '2026-04-30' })).toEqual([
      { month: '2026-01', cents: 120_00 },
      { month: '2026-02', cents: 110_00 },
      { month: '2026-03', cents: 45_00 },
      { month: '2026-04', cents: 0 },
    ]);
    expect(expensesByMonth(rows, { start: '2026-02-01', end: '2026-02-28' })).toEqual([{ month: '2026-02', cents: 110_00 }]);
    expect(expensesByMonth(rows, { start: 'bad', end: '2026-02-28' })).toEqual([]);
  });

  it('reports no delta rather than a 100% jump when no prior period is published', () => {
    expect(expenseDelta(200_00, null)).toEqual({ currentCents: 200_00, priorCents: null, deltaCents: null, deltaPct: null });
    expect(expenseDelta(150_00, 100_00)).toMatchObject({ deltaCents: 50_00, deltaPct: 50 });
    expect(expenseDelta(150_00, 0)).toMatchObject({ deltaCents: 150_00, deltaPct: null });
  });
});

describe('expense query params', () => {
  it('keeps the valid filters when one param is unusable', () => {
    const query = parseExpenseQuery({
      category: 'not-a-uuid',
      vendor: 'Landlord',
      recurring: 'maybe',
      q: 'rent',
      min: '10.50',
      sort: 'amount_asc',
      page: '3',
    });
    expect(query.filters.categoryId).toBeNull();
    expect(query.filters.vendor).toBe('Landlord');
    expect(query.filters.recurring).toBeNull();
    expect(query.filters.search).toBe('rent');
    expect(query.filters.minCents).toBe(1050);
    expect(query.sort).toBe('amount_asc');
    expect(query.page).toBe(3);
  });

  it('drops an inverted amount range instead of returning nothing', () => {
    expect(parseExpenseQuery({ min: '100', max: '10' }).filters).toMatchObject({ minCents: 10_000, maxCents: null });
    expect(parseExpenseQuery({ min: '10', max: '100' }).filters).toMatchObject({ minCents: 1000, maxCents: 10_000 });
  });

  it('falls back to defaults for missing or out-of-range params', () => {
    const query = parseExpenseQuery({ page: '0', sort: 'nonsense', min: 'abc' });
    expect(query).toMatchObject({ page: 1, sort: 'date_desc' });
    expect(query.filters.minCents).toBeNull();
  });

  it('resets paging on every change except paging itself', () => {
    const params = { period: '2026-01-01_2026-03-31', page: '4', q: 'rent' };
    expect(expenseHref('/expenses', params, { sort: 'amount_desc' })).toBe('/expenses?period=2026-01-01_2026-03-31&q=rent&sort=amount_desc');
    expect(expenseHref('/expenses', params, { page: '5' })).toBe('/expenses?period=2026-01-01_2026-03-31&page=5&q=rent');
    expect(expenseHref('/expenses', {}, {})).toBe('/expenses');
  });

  it('sorts by date and amount with a stable tiebreak', () => {
    const ids = (sort: Parameters<typeof sortTransactions>[1]) => sortTransactions(rows, sort).map((r) => r.id);
    expect(ids('date_asc')).toEqual(['a', 'b', 'c', 'd']);
    expect(ids('date_desc')).toEqual(['d', 'c', 'b', 'a']);
    expect(ids('amount_desc')).toEqual(['a', 'b', 'd', 'c']);
    expect(ids('amount_asc')).toEqual(['c', 'd', 'b', 'a']);
  });
});
