// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { pnlExpenseLines, shareOf } from '@/lib/reports/pnl-expenses';
import { buildTree } from '@/lib/reports/tree';

import { line, pnlRows, resetPositions } from './fixtures';

describe('pnlExpenseLines', () => {
  it('lists the accounts under cost of goods sold and expenses, largest first, never a total or a heading', () => {
    const lines = pnlExpenseLines(buildTree(pnlRows()));
    expect(lines.map((l) => [l.label, l.kind, l.cents])).toEqual([
      ['Payroll Expenses', 'operating', 500_000],
      ['Materials', 'cogs', 400_000],
      ['Rent', 'operating', 200_000],
    ]);
  });

  it('names the group a nested account sits under and keeps a credit', () => {
    resetPositions();
    const rows = [
      line('E1', 'Expenses', { isSection: true }),
      line('E2', 'Rent', { parent: 'E1', current: 20_000 }),
      line('E3', 'Utilities', { parent: 'E1', isSection: true }),
      line('E4', 'Electricity', { parent: 'E3', current: 10_000 }),
      line('E5', 'Refund', { parent: 'E3', current: -2_000 }),
      line('E6', 'Total for Utilities', { parent: 'E3', current: 8_000, isTotal: true }),
      line('E7', 'Total for Expenses', { parent: 'E1', current: 28_000, isTotal: true }),
    ];
    expect(pnlExpenseLines(buildTree(rows))).toEqual([
      { id: 'E2', label: 'Rent', group: null, kind: 'operating', cents: 20_000 },
      { id: 'E4', label: 'Electricity', group: 'Utilities', kind: 'operating', cents: 10_000 },
      { id: 'E5', label: 'Refund', group: 'Utilities', kind: 'operating', cents: -2_000 },
    ]);
  });
});

describe('shareOf', () => {
  it('is a share of the printed total, and nothing when no total is printed', () => {
    expect(shareOf(20_000, 28_000)).toBe(71.4);
    expect(shareOf(20_000, null)).toBeNull();
    expect(shareOf(20_000, 0)).toBeNull();
  });
});
