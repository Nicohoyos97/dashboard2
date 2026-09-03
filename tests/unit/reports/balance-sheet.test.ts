// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { balanceSheetMetrics } from '@/lib/reports/balance-sheet';
import { buildTree } from '@/lib/reports/tree';

import { amend, balanceReport, balanceRows, without } from './fixtures';

const metricsOf = (rows = balanceRows(), rep = balanceReport()) => balanceSheetMetrics(rep, buildTree(rows));

describe('balanceSheetMetrics', () => {
  it('reads the printed totals and cites them', () => {
    const m = metricsOf();
    expect(m.totalAssets.current).toMatchObject({ cents: 2_000_000, lineId: 'B9', page: 1 });
    expect(m.totalLiabilities.current).toMatchObject({ cents: 800_000, lineId: 'B18', page: 2 });
    expect(m.totalEquity.current).toMatchObject({ cents: 1_200_000, lineId: 'B21' });
    expect(m.currentAssets.current?.lineId).toBe('B5');
    expect(m.currentLiabilities.current?.lineId).toBe('B14');
    expect(m.totalLiabilities.deltaCents).toBe(0);
  });

  it('does not mistake "Total Liabilities and Equity" for total liabilities', () => {
    const m = metricsOf(without(balanceRows(), 'B18'));
    expect(m.totalLiabilities.reason).toBe('no_printed_total');
  });

  it('derives working capital only when both current totals are printed', () => {
    const m = metricsOf();
    expect(m.workingCapital.current).toEqual({ cents: 600_000, lineId: null, page: null, source: 'firm_document', label: 'workingCapital' });
    expect(m.workingCapital.prior?.cents).toBe(500_000);
    expect(m.workingCapital.deltaCents).toBe(100_000);
    expect(m.workingCapital.deltaPct).toBe(20);

    const missing = metricsOf(without(balanceRows(), 'B14'));
    expect(missing.workingCapital).toMatchObject({ current: null, reason: 'missing_inputs' });
    expect(missing.currentRatio).toMatchObject({ current: null, reason: 'missing_inputs' });
  });

  it('rounds ratios to two decimals and carries the prior ratio', () => {
    const m = metricsOf();
    expect(m.currentRatio).toEqual({ key: 'currentRatio', current: 4, prior: 6 });
    expect(m.debtToAsset).toEqual({ key: 'debtToAsset', current: 0.4, prior: 0.44 });
  });

  it('refuses to divide by zero current liabilities', () => {
    const m = metricsOf(amend(balanceRows(), 'B14', { currentCents: 0 }));
    expect(m.currentRatio).toMatchObject({ current: null, reason: 'divide_by_zero' });
    expect(m.workingCapital.current?.cents).toBe(800_000);
  });

  it('checks the accounting equation within the reconciliation tolerance', () => {
    expect(metricsOf().equationOk).toBe(true);
    expect(metricsOf(amend(balanceRows(), 'B9', { currentCents: 2_000_100 })).equationOk).toBe(true);
    expect(metricsOf(amend(balanceRows(), 'B9', { currentCents: 2_000_101 })).equationOk).toBe(false);
  });

  it('falls back to the printed "Total Liabilities and Equity" and otherwise returns null', () => {
    expect(metricsOf(without(balanceRows(), 'B18')).equationOk).toBe(true);
    expect(metricsOf(without(balanceRows(), 'B18', 'B22')).equationOk).toBeNull();
    expect(metricsOf(without(balanceRows(), 'B9')).equationOk).toBeNull();
  });
});
