// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { withAccountLabels } from '@/lib/portal/account-label';
import { pnlMetrics } from '@/lib/reports/pnl';
import { buildTree } from '@/lib/reports/tree';

import { amend, line, pnlRows, report, resetPositions, without, withoutPrior } from './fixtures';

const metricsOf = (rows = pnlRows(), rep = report()) => pnlMetrics(rep, buildTree(rows));

describe('pnlMetrics', () => {
  it('reads every headline figure from its printed total and cites the line', () => {
    const m = metricsOf();
    expect(m.revenue.current).toEqual({ cents: 1_500_000, lineId: 'L4', page: 1, source: 'firm_document', label: 'Total Income' });
    expect(m.cogs.current?.lineId).toBe('L7');
    expect(m.grossProfit.current).toMatchObject({ cents: 1_100_000, lineId: 'L8', page: 2 });
    expect(m.operatingExpenses.current?.lineId).toBe('L13');
    expect(m.netIncome.current?.lineId).toBe('L15');
    expect(m.revenue.reason).toBeUndefined();
  });

  it('prefers the last net-income candidate so "Net Operating Income" does not shadow "Net Income"', () => {
    const rows = amend(pnlRows(), 'L15', { currentCents: 390_000 });
    expect(metricsOf(rows).netIncome.current?.cents).toBe(390_000);
  });

  it('carries prior figures and deltas', () => {
    const m = metricsOf();
    expect(m.revenue.prior?.cents).toBe(1_300_000);
    expect(m.revenue.deltaCents).toBe(200_000);
    expect(m.revenue.deltaPct).toBeCloseTo(15.38, 2);
    expect(m.netIncome.deltaCents).toBe(-100_000);
  });

  it('computes margins in TypeScript, rounded to one decimal', () => {
    const m = metricsOf();
    expect(m.grossMarginPct).toBe(73.3);
    expect(m.netMarginPct).toBe(26.7);
    expect(m.priorGrossMarginPct).toBe(76.9);
    expect(m.priorNetMarginPct).toBe(38.5);
    expect(m.marginReason).toBeUndefined();
  });

  it('returns null with a reason when a total is not printed', () => {
    const m = metricsOf(without(pnlRows(), 'L5', 'L6', 'L7', 'L8'));
    expect(m.cogs).toMatchObject({ current: null, prior: null, deltaCents: null, reason: 'no_printed_total' });
    expect(m.grossProfit.reason).toBe('no_printed_total');
    expect(m.grossMarginPct).toBeNull();
    expect(m.netMarginPct).toBe(26.7);
    expect(m.marginReason).toBe('missing_inputs');
  });

  it('explains a missing prior: no comparative column vs a blank total', () => {
    const noColumn = metricsOf(withoutPrior(pnlRows()), report({ comparativeStart: null, comparativeEnd: null }));
    expect(noColumn.revenue).toMatchObject({ prior: null, deltaCents: null, deltaPct: null, reason: 'no_prior_column' });
    expect(noColumn.priorGrossMarginPct).toBeNull();

    const blank = metricsOf(amend(pnlRows(), 'L4', { priorCents: null }));
    expect(blank.revenue.reason).toBe('no_prior_total');
    expect(blank.cogs.reason).toBeUndefined();
  });

  it('never divides by zero revenue', () => {
    const m = metricsOf(amend(pnlRows(), 'L4', { currentCents: 0 }));
    expect(m.grossMarginPct).toBeNull();
    expect(m.netMarginPct).toBeNull();
    expect(m.marginReason).toBe('divide_by_zero');
  });

  it('ignores a section heading that carries an amount but is not a printed total', () => {
    const rows = amend(without(pnlRows(), 'L4'), 'L1', { currentCents: 1_500_000 });
    expect(metricsOf(rows).revenue.reason).toBe('no_printed_total');
  });

  it('lets a bare "Total" line borrow its section heading and accepts synonyms', () => {
    resetPositions();
    const rows = [
      line('R1', 'Revenue', { isSection: true }),
      line('R2', 'Consulting', { parent: 'R1', current: 100 }),
      line('R3', 'TOTAL', { parent: 'R1', current: 100, isTotal: true }),
      line('R4', 'Total Cost of Sales', { current: 40, isTotal: true }),
      line('R5', 'Total Operating Expenses:', { current: 30, isTotal: true }),
      line('R6', 'Net Profit', { current: 30, isTotal: true }),
    ];
    const m = metricsOf(rows, report({ comparativeStart: null, comparativeEnd: null }));
    expect(m.revenue.current?.lineId).toBe('R3');
    expect(m.cogs.current?.lineId).toBe('R4');
    expect(m.operatingExpenses.current?.lineId).toBe('R5');
    expect(m.netIncome.current?.lineId).toBe('R6');
    expect(m.netMarginPct).toBe(30);
  });

  // QuickBooks Online prints "Total for Income" and an account code in front of
  // every name. Read as "for income", the three section totals went missing and
  // the portal showed a statement with profit but no revenue.
  it('reads a QuickBooks Online layout: "Total for X" totals and coded accounts', () => {
    resetPositions();
    const rows = withAccountLabels([
      line('Q1', 'Income', { isSection: true }),
      line('Q2', '1001- Sales (POS)', { parent: 'Q1', current: 60_000 }),
      line('Q3', '1002 - Zelle sales', { parent: 'Q1', current: 40_000 }),
      line('Q4', 'Total for Income', { parent: 'Q1', current: 100_000, isTotal: true }),
      line('Q5', 'Cost of Goods Sold', { isSection: true }),
      line('Q6', '1100 - Cost of good sold', { parent: 'Q5', current: 40_000 }),
      line('Q7', 'Total for Cost of Goods Sold', { parent: 'Q5', current: 40_000, isTotal: true }),
      line('Q8', 'Gross Profit', { current: 60_000, isTotal: true }),
      line('Q9', 'Expenses', { isSection: true }),
      line('Q10', '5943 - Rent', { parent: 'Q9', current: 20_000 }),
      line('Q11', '6300 - Utilities', { parent: 'Q9', isSection: true }),
      line('Q12', '63001 - Electricity', { parent: 'Q11', current: 10_000 }),
      line('Q13', 'Total for 6300 - Utilities', { parent: 'Q11', current: 10_000, isTotal: true }),
      line('Q14', 'Total for Expenses', { parent: 'Q9', current: 30_000, isTotal: true }),
      line('Q15', 'Net Operating Income', { current: 30_000, isTotal: true }),
      line('Q16', 'Net Income', { current: 30_000, isTotal: true }),
    ]);
    const m = metricsOf(rows, report({ comparativeStart: null, comparativeEnd: null }));
    expect(m.revenue.current).toMatchObject({ cents: 100_000, lineId: 'Q4' });
    expect(m.cogs.current?.lineId).toBe('Q7');
    expect(m.operatingExpenses.current?.lineId).toBe('Q14');
    expect(m.netIncome.current?.lineId).toBe('Q16');
    expect(m.grossMarginPct).toBe(60);
    expect(m.netMarginPct).toBe(30);
    expect(rows.map((r) => r.accountName)).toEqual([
      'Income', 'Sales (POS)', 'Zelle sales', 'Total for Income',
      'Cost of Goods Sold', 'Cost of good sold', 'Total for Cost of Goods Sold', 'Gross Profit',
      'Expenses', 'Rent', 'Utilities', 'Electricity', 'Total for Utilities', 'Total for Expenses',
      'Net Operating Income', 'Net Income',
    ]);
  });
});
