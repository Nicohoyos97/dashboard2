// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { buildTree, findLine, flattenTree } from '@/lib/reports/tree';

import { amend, line, pnlRows, resetPositions } from './fixtures';

describe('buildTree', () => {
  it('nests children under parents in printed order', () => {
    const roots = buildTree(pnlRows());
    expect(roots.map((r) => r.id)).toEqual(['L1', 'L5', 'L8', 'L9', 'L14', 'L15']);
    expect(roots[0]?.children.map((c) => c.id)).toEqual(['L2', 'L3', 'L4']);
  });

  it('keeps printed order even when rows arrive shuffled', () => {
    const roots = buildTree([...pnlRows()].reverse());
    expect(roots.map((r) => r.id)).toEqual(['L1', 'L5', 'L8', 'L9', 'L14', 'L15']);
    expect(roots[3]?.children.map((c) => c.id)).toEqual(['L10', 'L11', 'L12', 'L13']);
  });

  it('computes the variance per line', () => {
    const sales = findLine(buildTree(pnlRows()), 'L2');
    expect(sales?.deltaCents).toBe(200_000);
    expect(sales?.deltaPct).toBe(25);
  });

  it('leaves the percent null when the prior figure is zero, and both null when it is missing', () => {
    const roots = buildTree(amend(pnlRows(), 'L11', { priorCents: null }));
    expect(findLine(roots, 'L12')).toMatchObject({ deltaCents: 0, deltaPct: null });
    expect(findLine(roots, 'L11')).toMatchObject({ deltaCents: null, deltaPct: null });
  });

  it('shows a line whose parent is missing at the top level instead of dropping it', () => {
    resetPositions();
    const roots = buildTree([line('A', 'Orphan', { parent: 'missing', current: 100 }), line('B', 'Root', { current: 200 })]);
    expect(roots.map((r) => r.id)).toEqual(['A', 'B']);
  });

  it('breaks a parent cycle instead of losing the lines', () => {
    resetPositions();
    const roots = buildTree([line('A', 'One', { parent: 'B' }), line('B', 'Two', { parent: 'A' })]);
    expect(roots.map((r) => r.id).sort()).toEqual(['A', 'B']);
  });
});

describe('flattenTree', () => {
  it('returns every line in printed order with the depth recomputed from the structure', () => {
    const rows = amend(pnlRows(), 'L10', { depth: 7 });
    const flat = flattenTree(buildTree(rows));
    expect(flat.map((l) => l.id)).toEqual(rows.map((r) => r.id));
    expect(flat.find((l) => l.id === 'L10')?.depth).toBe(1);
    expect(flat.find((l) => l.id === 'L9')?.depth).toBe(0);
  });

  it('hides zero lines but keeps the sections that still have visible lines', () => {
    const flat = flattenTree(buildTree(pnlRows()), { hideZero: true });
    expect(flat.map((l) => l.id)).not.toContain('L12');
    expect(flat.map((l) => l.id)).toContain('L9');
  });

  it('hides a section whose lines are all zero', () => {
    const rows = pnlRows().map((row) =>
      row.section === 'Expenses' ? { ...row, currentCents: row.isSection ? null : 0, priorCents: row.isSection ? null : 0 } : row,
    );
    const ids = flattenTree(buildTree(rows), { hideZero: true }).map((l) => l.id);
    expect(ids).not.toContain('L9');
    expect(ids).toContain('L1');
  });

  it('keeps the ancestors of a search match and nothing else', () => {
    const ids = flattenTree(buildTree(pnlRows()), { query: 'RENT' }).map((l) => l.id);
    expect(ids).toEqual(['L9', 'L11']);
  });

  it('shows the whole group when a section matches, and matches account numbers', () => {
    const roots = buildTree(pnlRows());
    expect(flattenTree(roots, { query: 'income' }).map((l) => l.id)).toEqual(['L1', 'L2', 'L3', 'L4', 'L14', 'L15']);
    expect(flattenTree(roots, { query: '6000' }).map((l) => l.id)).toEqual(['L9', 'L10']);
  });

  it('combines search with the zero filter', () => {
    const ids = flattenTree(buildTree(pnlRows()), { query: 'expenses', hideZero: true }).map((l) => l.id);
    expect(ids).toEqual(['L9', 'L10', 'L11', 'L13']);
  });
});

describe('findLine', () => {
  it('finds nested lines and returns null for unknown ids', () => {
    const roots = buildTree(pnlRows());
    expect(findLine(roots, 'L6')?.accountName).toBe('Materials');
    expect(findLine(roots, 'nope')).toBeNull();
  });
});
