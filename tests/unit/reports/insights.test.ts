// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { generateInsights, MAX_INSIGHTS, THRESHOLDS } from '@/lib/insights/rules';
import type { InsightInput } from '@/lib/insights/types';
import { balanceSheetMetrics } from '@/lib/reports/balance-sheet';
import { pnlMetrics } from '@/lib/reports/pnl';
import { buildTree } from '@/lib/reports/tree';

import { amend, balanceReport, balanceRows, pnlRows, report } from './fixtures';

const empty = (): InsightInput => ({ reminders: [], reportsNeedingReview: 0, today: '2026-06-01' });
const pnl = () => {
  const lines = buildTree(pnlRows());
  return { current: pnlMetrics(report(), lines), lines };
};
const keys = (input: InsightInput) => generateInsights(input).map((i) => i.ruleKey);

describe('deterministic insight rules', () => {
  it('flags payroll share and a materially growing expense only at their thresholds', () => {
    const both = keys({ ...empty(), pnl: pnl() });
    expect(both).toContain('payroll_share_up');
    expect(both).toContain('category_up_material');

    const nearRows = amend(amend(pnlRows(), 'L10', { currentCents: 319_999 }), 'L4', { currentCents: 1_500_000 });
    const lines = buildTree(nearRows);
    const near = keys({ ...empty(), pnl: { current: pnlMetrics(report(), lines), lines } });
    expect(near).not.toContain('payroll_share_up');
    expect(THRESHOLDS.categoryUpMinCents).toBe(50_000);
  });

  it('flags liabilities growing materially faster than assets', () => {
    const rows = amend(amend(balanceRows(), 'B18', { currentCents: 1_000_000 }), 'B21', { currentCents: 1_000_000 });
    const balance = balanceSheetMetrics(balanceReport(), buildTree(rows));
    expect(keys({ ...empty(), balance })).toContain('liabilities_outpacing_assets');
  });

  it('flags an open sales-tax deadline within 14 days but not settled or later ones', () => {
    const due = { reminderType: 'sales_tax_deadline', status: 'upcoming', dueDate: '2026-06-15', amountCents: 10_000 };
    expect(keys({ ...empty(), reminders: [due] })).toContain('sales_tax_due_soon');
    expect(keys({ ...empty(), reminders: [{ ...due, dueDate: '2026-06-16' }] })).not.toContain('sales_tax_due_soon');
    expect(keys({ ...empty(), reminders: [{ ...due, status: 'paid' }] })).not.toContain('sales_tax_due_soon');
  });

  it('flags margin movement of at least five points', () => {
    expect(keys({ ...empty(), pnl: pnl() })).toContain('margin_changed');
  });

  it('keeps review counts identifier-only and returns at most five in priority order', () => {
    expect(generateInsights({ ...empty(), reportsNeedingReview: 2 })).toEqual([
      { ruleKey: 'report_needs_review', severity: 'info', priority: 4, linkPath: '/dashboard', params: { count: 2 } },
    ]);

    const all = generateInsights({
      ...empty(),
      pnl: pnl(),
      balance: balanceSheetMetrics(balanceReport(), buildTree(amend(amend(balanceRows(), 'B18', { currentCents: 1_000_000 }), 'B21', { currentCents: 1_000_000 }))),
      reminders: [{ reminderType: 'sales_tax_deadline', status: 'upcoming', dueDate: '2026-06-02', amountCents: null }],
      reportsNeedingReview: 3,
    });
    expect(all.length).toBeLessThanOrEqual(MAX_INSIGHTS);
    expect(all.map((i) => i.priority)).toEqual([...all.map((i) => i.priority)].sort((a, b) => a - b));
    expect(all[0]?.ruleKey).toBe('sales_tax_due_soon');
  });
});
