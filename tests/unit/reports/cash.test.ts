// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { cashByMonth, cashComparison, cashTotals, endingBalanceSeries } from '@/lib/reports/cash';

describe('cash read model', () => {
  const rows = [
    { date: '2026-01-03', debitCents: null, creditCents: 100_00 },
    { date: '2026-01-04', debitCents: 25_00, creditCents: null },
    { date: '2026-03-12', debitCents: 10_00, creditCents: 40_00 },
    { date: '2025-12-31', debitCents: null, creditCents: 999_00 },
  ];

  it('buckets published transactions and zero-fills every month in the requested range', () => {
    expect(cashByMonth(rows, { start: '2026-01-01', end: '2026-03-31' })).toEqual([
      { month: '2026-01', inCents: 100_00, outCents: 25_00, netCents: 75_00 },
      { month: '2026-02', inCents: 0, outCents: 0, netCents: 0 },
      { month: '2026-03', inCents: 40_00, outCents: 10_00, netCents: 30_00 },
    ]);
  });

  it('uses the data span when no range is supplied and refuses invalid ranges', () => {
    expect(cashByMonth(rows)).toHaveLength(4);
    expect(cashByMonth(rows, { start: '2026-03-01', end: '2026-01-31' })).toEqual([]);
    expect(cashByMonth([], undefined)).toEqual([]);
  });

  it('computes totals and comparable-period deltas in integer cents', () => {
    const current = cashByMonth(rows, { start: '2026-01-01', end: '2026-03-31' });
    const prior = [{ month: '2025-10', inCents: 100_00, outCents: 50_00, netCents: 50_00 }];
    expect(cashTotals(current)).toEqual({ inCents: 140_00, outCents: 35_00, netCents: 105_00 });
    const comparison = cashComparison(current, prior);
    expect(comparison).toEqual({
      cashIn: { key: 'cashIn', currentCents: 140_00, priorCents: 100_00, deltaCents: 40_00, deltaPct: 40 },
      cashOut: { key: 'cashOut', currentCents: 35_00, priorCents: 50_00, deltaCents: -15_00, deltaPct: -30 },
      netCash: { key: 'netCash', currentCents: 105_00, priorCents: 50_00, deltaCents: 55_00, deltaPct: comparison.netCash.deltaPct },
    });
    expect(comparison.netCash.deltaPct).toBeCloseTo(110);
  });

  it('does not invent a comparison when no prior rows were published', () => {
    expect(cashComparison([{ month: '2026-01', inCents: 0, outCents: 0, netCents: 0 }], []).cashIn)
      .toMatchObject({ currentCents: 0, priorCents: null, deltaCents: null, deltaPct: null });
  });

  it('sorts printed ending balances and skips missing balances', () => {
    expect(endingBalanceSeries([
      { periodEnd: '2026-03-31', endingBalanceCents: 300 },
      { periodEnd: '2026-01-31', endingBalanceCents: 100 },
      { periodEnd: '2026-02-28', endingBalanceCents: null },
    ])).toEqual([
      { date: '2026-01-31', balanceCents: 100 },
      { date: '2026-03-31', balanceCents: 300 },
    ]);
  });
});
