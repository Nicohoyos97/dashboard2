// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { type InsightPeriod, insightKey, insightsAcrossPeriods } from '@/lib/insights/periods';
import type { InsightInput } from '@/lib/insights/types';
import { pnlMetrics } from '@/lib/reports/pnl';
import { buildTree } from '@/lib/reports/tree';
import type { LineRow, ReportRow } from '@/lib/reports/types';

const TODAY = '2026-09-03';

function report(start: string, end: string): ReportRow {
  return {
    id: `r-${start}`,
    reportType: 'profit_and_loss',
    basis: 'accrual',
    currency: 'USD',
    periodStart: start,
    periodEnd: end,
    comparativeStart: null,
    comparativeEnd: null,
    source: 'firm_document',
    documentVersionId: null,
    publishedAt: '2026-09-01T00:00:00Z',
  };
}

/** A minimal P&L: income, payroll under expenses, and a net income total. */
function lines(revenue: number, payroll: number, netIncome: number): LineRow[] {
  const row = (id: string, name: string, current: number | null, extra: Partial<LineRow> = {}): LineRow => ({
    id,
    parentLineId: null,
    position: 0,
    depth: 0,
    section: null,
    accountName: name,
    accountNumber: null,
    currentCents: current,
    priorCents: null,
    isSection: false,
    isTotal: false,
    pageNumber: null,
    confidence: null,
    ...extra,
  });
  return [
    row('income', 'Total Income', revenue, { position: 1, isTotal: true }),
    row('expenses', 'Expenses', null, { position: 2, isSection: true }),
    row('payroll', 'Payroll', payroll, { position: 3, depth: 1, parentLineId: 'expenses' }),
    row('total-expenses', 'Total Expenses', payroll, { position: 4, depth: 1, parentLineId: 'expenses', isTotal: true }),
    row('net', 'Net Income', netIncome, { position: 5, isTotal: true }),
  ];
}

function period(start: string, end: string, label: string, revenue: number, payroll: number, net: number): InsightPeriod {
  const rows = lines(revenue, payroll, net);
  const tree = buildTree(rows);
  return { start, end, label, metrics: pnlMetrics(report(start, end), tree), lines: tree };
}

const NOTHING: InsightInput = { reminders: [], reportsNeedingReview: 0, today: TODAY };

describe('insights across periods', () => {
  it('tags every insight with the period it was raised for', () => {
    const earlier = [
      period('2026-06-01', '2026-06-30', 'Jun 2026', 100_000_00, 30_000_00, 40_000_00),
      // Payroll jumps from 30% to 45% of revenue: payroll_share_up and
      // category_up_material both fire on this period, not on the selected one.
      period('2026-07-01', '2026-07-31', 'Jul 2026', 100_000_00, 45_000_00, 25_000_00),
    ];
    const result = insightsAcrossPeriods({ start: '2026-08-01', end: '2026-08-31', label: 'Aug 2026' }, earlier, NOTHING, 10);

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((insight) => insight.periodLabel === 'Jul 2026')).toBe(true);
    expect(result.map((insight) => insight.ruleKey)).toContain('payroll_share_up');
    expect(result[0]?.key).toBe(insightKey(result[0]?.ruleKey ?? '', '2026-07-01', '2026-07-31'));
  });

  it('puts the selected period first, then earlier periods newest to oldest', () => {
    const earlier = [
      period('2026-06-01', '2026-06-30', 'Jun 2026', 100_000_00, 30_000_00, 40_000_00),
      period('2026-07-01', '2026-07-31', 'Jul 2026', 100_000_00, 45_000_00, 25_000_00),
    ];
    const selected = { start: '2026-08-01', end: '2026-08-31', label: 'Aug 2026' };
    const result = insightsAcrossPeriods(selected, earlier, {
      ...NOTHING,
      reportsNeedingReview: 2, // fires report_needs_review on the selected period
    }, 10);

    expect(result[0]).toMatchObject({ ruleKey: 'report_needs_review', periodLabel: 'Aug 2026' });
    const labels = [...new Set(result.map((insight) => insight.periodLabel))];
    expect(labels).toEqual(['Aug 2026', 'Jul 2026']);
  });

  it('honours the limit and copes with no earlier periods at all', () => {
    const selected = { start: '2026-08-01', end: '2026-08-31', label: 'Aug 2026' };
    expect(insightsAcrossPeriods(selected, [], NOTHING, 10)).toEqual([]);
    expect(insightsAcrossPeriods(selected, [], { ...NOTHING, reportsNeedingReview: 1 }, 10)).toHaveLength(1);

    const earlier = [
      period('2026-06-01', '2026-06-30', 'Jun 2026', 100_000_00, 30_000_00, 40_000_00),
      period('2026-07-01', '2026-07-31', 'Jul 2026', 100_000_00, 45_000_00, 25_000_00),
    ];
    expect(insightsAcrossPeriods(selected, earlier, NOTHING, 1)).toHaveLength(1);
  });

  it('builds a dismissal key from the rule and the period, not the figures', () => {
    expect(insightKey('margin_changed', '2026-07-01', '2026-07-31')).toBe('margin_changed|2026-07-01|2026-07-31');
  });
});
