// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';

import { CitationRegistry } from '@/lib/ai/nick/citations';
import { parsePeriodInput, pickReport } from '@/lib/ai/nick/tools/context';
import { expenseBreakdown, pnlSummary, statementLines } from '@/lib/ai/nick/tools/statements';
import { buildTree } from '@/lib/reports/tree';

import { pnlRows, report, resetPositions } from '../reports/fixtures';

function shape() {
  return { locale: 'en' as const, currency: 'USD', registry: new CitationRegistry() };
}

describe('Nick statement shaping', () => {
  beforeEach(() => resetPositions());

  it('pnlSummary quotes printed totals with formatted money and a citation per figure', () => {
    const ctx = shape();
    const r = report();
    const summary = pnlSummary(ctx, r, buildTree(pnlRows()));
    expect(summary.netIncome.current).not.toBeNull();
    expect(summary.netIncome.current?.formatted).toMatch(/^\$[\d,]+\.\d{2}$/);
    expect(summary.netIncome.current?.cite).toMatch(/^c\d+$/);
    const cited = ctx.registry.get(summary.netIncome.current?.cite ?? '');
    expect(cited?.reportId).toBe(r.id);
    expect(cited?.label).toContain('Profit & Loss');
    expect(cited?.href).toBe(`/statements/profit-and-loss?period=${r.periodStart}_${r.periodEnd}`);
    // Margins are computed in TypeScript and cite the statement, not a line.
    expect(ctx.registry.get(summary.margins.cite)?.lineId).toBeNull();
  });

  it('statementLines filters by account name and caps the result', () => {
    const ctx = shape();
    const all = statementLines(ctx, report(), buildTree(pnlRows()), null);
    expect(all.lines.length).toBeGreaterThan(3);
    expect(all.truncated).toBe(false);
    const payroll = statementLines(ctx, report(), buildTree(pnlRows()), 'payroll');
    expect(payroll.lines.some((line) => /payroll/i.test(line.name))).toBe(true);
    expect(payroll.lines.every((line) => /payroll/i.test(line.name) || line.isTotal)).toBe(true);
    for (const line of payroll.lines) expect(ctx.registry.get(line.cite)).toBeDefined();
  });

  it('expenseBreakdown returns shares that add up against the printed total', () => {
    const ctx = shape();
    const breakdown = expenseBreakdown(ctx, report(), buildTree(pnlRows()), 3);
    expect(breakdown.categories.length).toBeLessThanOrEqual(3);
    const shares = [...breakdown.categories.map((c) => c.sharePct ?? 0), breakdown.other?.sharePct ?? 0];
    const total = shares.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(90);
    expect(total).toBeLessThanOrEqual(100.5);
    expect(breakdown.categories[0]?.amount).toMatch(/^\d+\.\d{2}$/);
  });
});

describe('period helpers', () => {
  it('parsePeriodInput accepts start_end and rejects garbage from the model', () => {
    expect(parsePeriodInput('2026-01-01_2026-06-30')).toEqual({ start: '2026-01-01', end: '2026-06-30' });
    expect(parsePeriodInput('2026-06-30_2026-01-01')).toBeNull();
    expect(parsePeriodInput('June 2026')).toBeNull();
    expect(parsePeriodInput(null)).toBeNull();
  });

  it('pickReport prefers the request, then the page period, then the newest — and says no for an unknown request', () => {
    const newest = report({ id: 'new', periodStart: '2026-04-01', periodEnd: '2026-06-30' });
    const older = report({ id: 'old', periodStart: '2026-01-01', periodEnd: '2026-03-31' });
    const reports = [newest, older];
    const noPage = { context: { page: 'chat' as const, period: null, line: null } };
    const withPage = { context: { page: 'profit_and_loss' as const, period: { start: '2026-01-01', end: '2026-03-31', label: 'Q1 2026' }, line: null } };
    expect(pickReport(noPage, reports, null)?.id).toBe('new');
    expect(pickReport(withPage, reports, null)?.id).toBe('old');
    expect(pickReport(withPage, reports, '2026-04-01_2026-06-30')?.id).toBe('new');
    expect(pickReport(noPage, reports, '2025-01-01_2025-12-31')).toBeNull();
    expect(pickReport(noPage, reports, 'nonsense')).toBeNull();
  });
});
