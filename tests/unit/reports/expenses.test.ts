// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  expenseHref,
  parseExpenseQuery,
  sortTransactions,
} from '@/lib/portal/expense-filters';
import { expenseDelta } from '@/lib/reports/expenses';

describe('expense delta', () => {
  it('reports no delta rather than a 100% jump when no prior period is published', () => {
    // The grouping itself now runs in Postgres (portal_expense_summary,
    // migration 0011); tests/e2e/expense-aggregates.spec.ts checks its figures
    // against known rows. This comparison is the part SQL does not do.
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

  it('sorts by date and amount with a stable tiebreak (the CSV export orders in JS)', () => {
    const rows = [
      { id: 'a', date: '2026-01-10', amountCents: 120_00 },
      { id: 'b', date: '2026-02-04', amountCents: 80_00 },
      { id: 'c', date: '2026-02-20', amountCents: 30_00 },
      { id: 'd', date: '2026-03-02', amountCents: 45_00 },
    ];
    const ids = (sort: Parameters<typeof sortTransactions>[1]) => sortTransactions(rows, sort).map((r) => r.id);
    expect(ids('date_asc')).toEqual(['a', 'b', 'c', 'd']);
    expect(ids('date_desc')).toEqual(['d', 'c', 'b', 'a']);
    expect(ids('amount_desc')).toEqual(['a', 'b', 'd', 'c']);
    expect(ids('amount_asc')).toEqual(['c', 'd', 'b', 'a']);
  });
});
