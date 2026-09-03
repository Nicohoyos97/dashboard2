// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { availablePeriods, bankAccountsCoverPeriod, granularity, periodKind, priorPeriod, rangeCovered } from '@/lib/reports/periods';

import { balanceReport, report } from './fixtures';

describe('reporting periods', () => {
  it('recognises complete month, quarter and year ranges without fabricating custom spans', () => {
    expect(periodKind('2026-02-01', '2026-02-28')).toBe('month');
    expect(periodKind('2026-02-01', '2026-04-30')).toBe('quarter');
    expect(periodKind('2025-07-01', '2026-06-30')).toBe('year');
    expect(periodKind('2026-01-01', '2026-06-30')).toBe('custom');
    expect(periodKind('2026-01-02', '2026-01-31')).toBe('custom');
  });

  it('merges exact ranges by source and sorts newest first', () => {
    const reports = [
      report({ id: 'p1', periodStart: '2026-01-01', periodEnd: '2026-06-30' }),
      balanceReport({ id: 'b1', periodStart: '2026-06-30', periodEnd: '2026-06-30' }),
    ];
    const periods = availablePeriods(reports, [
      { periodStart: '2026-01-01', periodEnd: '2026-06-30' },
      { periodStart: '2026-05-01', periodEnd: '2026-05-31' },
    ]);
    expect(periods.map((p) => [p.start, p.end, p.sources])).toEqual([
      ['2026-06-30', '2026-06-30', ['balance_sheet']],
      ['2026-01-01', '2026-06-30', ['pnl', 'bank']],
      ['2026-05-01', '2026-05-31', ['bank']],
    ]);
  });

  it('keeps unsupported granularities disabled with explicit reasons', () => {
    const halfYear = availablePeriods([report()], []);
    expect(granularity(halfYear, false)).toEqual({
      month: { enabled: false, reason: 'no_monthly_source' },
      quarter: { enabled: false, reason: 'no_quarterly_source' },
      year: { enabled: false, reason: 'no_annual_source' },
    });
    expect(granularity(halfYear, true)).toEqual({
      month: { enabled: true },
      quarter: { enabled: true },
      year: { enabled: true },
    });
  });

  it('computes comparable month, quarter, fiscal-year and custom periods', () => {
    expect(priorPeriod({ start: '2026-02-01', end: '2026-02-28' })).toMatchObject({ start: '2026-01-01', end: '2026-01-31', kind: 'month' });
    expect(priorPeriod({ start: '2026-04-01', end: '2026-06-30' })).toMatchObject({ start: '2026-01-01', end: '2026-03-31', kind: 'quarter' });
    expect(priorPeriod({ start: '2025-07-01', end: '2026-06-30' })).toMatchObject({ start: '2024-07-01', end: '2025-06-30', kind: 'year' });
    expect(priorPeriod({ start: '2026-01-15', end: '2026-01-20' })).toMatchObject({ start: '2026-01-09', end: '2026-01-14', kind: 'custom' });
    expect(priorPeriod({ start: 'not-a-date', end: '2026-01-20' })).toBeNull();
  });

  it('requires continuous publication coverage for every bank account before summing entity cash', () => {
    const range = { start: '2026-01-01', end: '2026-03-31' };
    expect(rangeCovered(range, [
      { start: '2026-01-01', end: '2026-01-31' },
      { start: '2026-02-01', end: '2026-02-28' },
      { start: '2026-03-01', end: '2026-03-31' },
    ])).toBe(true);
    expect(rangeCovered(range, [
      { start: '2026-01-01', end: '2026-01-31' },
      { start: '2026-03-01', end: '2026-03-31' },
    ])).toBe(false);

    expect(bankAccountsCoverPeriod([
      { bankAccountId: 'checking', start: '2026-01-01', end: '2026-03-31' },
      { bankAccountId: 'savings', start: '2026-01-01', end: '2026-02-28' },
    ], range)).toBe(false);
    expect(bankAccountsCoverPeriod([
      { bankAccountId: 'checking', start: '2026-01-01', end: '2026-03-31' },
      { bankAccountId: 'savings', start: '2026-01-01', end: '2026-03-31' },
    ], range)).toBe(true);
  });
});
