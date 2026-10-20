import { describe, expect, it } from 'vitest';

import { composeRange, planRange, rangeLineId, sliceStatement, type SlicedPiece } from '@/lib/reports/range';
import { buildTree } from '@/lib/reports/tree';
import type { LineNode, LineRow, ReportRow } from '@/lib/reports/types';

function report(id: string, start: string, end: string, extra: Partial<ReportRow> = {}): ReportRow {
  return {
    id,
    reportType: 'profit_and_loss',
    basis: 'accrual',
    currency: 'USD',
    periodStart: start,
    periodEnd: end,
    comparativeStart: null,
    comparativeEnd: null,
    source: 'firm_document',
    documentVersionId: null,
    publishedAt: '2026-10-01T00:00:00Z',
    ...extra,
  };
}

type Spec = { name: string; cents?: number | null; total?: boolean; section?: boolean; children?: Spec[] };

/** A statement from a nested outline, ids prefixed so two months never share one. */
function statement(prefix: string, specs: Spec[]): LineRow[] {
  const rows: LineRow[] = [];
  const visit = (nodes: Spec[], parent: string | null, depth: number) => {
    for (const spec of nodes) {
      const id = `${prefix}-${rows.length}`;
      rows.push({
        id,
        parentLineId: parent,
        position: rows.length,
        depth,
        section: null,
        accountName: spec.name,
        accountNumber: null,
        currentCents: spec.cents ?? null,
        priorCents: null,
        isSection: spec.section ?? false,
        isTotal: spec.total ?? false,
        pageNumber: null,
        confidence: null,
      });
      visit(spec.children ?? [], id, depth + 1);
    }
  };
  visit(specs, null, 0);
  return rows;
}

/** QuickBooks' layout: sections with their totals inside, the headline totals at the root. */
function month(prefix: string, f: { pos: number; zelle: number; cogs: number; elec: number; water: number; rent: number; interest: number; repairs?: number }): LineRow[] {
  const income = f.pos + f.zelle;
  const utilities = f.elec + f.water;
  const expenses = utilities + f.rent + (f.repairs ?? 0);
  const gross = income - f.cogs;
  return statement(prefix, [
    { name: 'Income', section: true, children: [
      { name: '1001 Sales (POS)', cents: f.pos },
      { name: '1002 Zelle sales', cents: f.zelle },
      { name: 'Total Income', cents: income, total: true },
    ] },
    { name: 'Cost of Goods Sold', section: true, children: [
      { name: '1100 Cost of goods sold', cents: f.cogs },
      { name: 'Total Cost of Goods Sold', cents: f.cogs, total: true },
    ] },
    { name: 'Gross Profit', cents: gross, total: true },
    { name: 'Expenses', section: true, children: [
      { name: '6300 Utilities', section: true, children: [
        { name: '63001 Electricity', cents: f.elec },
        { name: '63002 Water', cents: f.water },
        { name: 'Total 6300 Utilities', cents: utilities, total: true },
      ] },
      ...(f.repairs ? [{ name: '6400 Repairs', cents: f.repairs }] : []),
      { name: '5943 Rent', cents: f.rent },
      { name: 'Total Expenses', cents: expenses, total: true },
    ] },
    { name: 'Net Operating Income', cents: gross - expenses, total: true },
    { name: 'Other Income', section: true, children: [
      { name: 'Interest earned', cents: f.interest },
      { name: 'Total Other Income', cents: f.interest, total: true },
    ] },
    { name: 'Net Other Income', cents: f.interest, total: true },
    { name: 'Net Income', cents: gross - expenses + f.interest, total: true },
  ]);
}

const byName = (rows: readonly LineRow[], values: ReadonlyMap<string, number | null>) =>
  Object.fromEntries(rows.map((row) => [row.accountName, values.get(row.id) ?? null]));

describe('planRange', () => {
  const aug = report('aug', '2026-08-01', '2026-08-31');
  const sep = report('sep', '2026-09-01', '2026-09-30');
  const all = () => true;

  it('takes a published statement whole when the range is exactly its period', () => {
    const plan = planRange({ start: '2026-08-01', end: '2026-08-31' }, [sep, aug], all);
    expect(plan).toMatchObject({ ok: true, clamped: false, pieces: [{ report: { id: 'aug' }, whole: true }] });
  });

  it('cuts through the two months a mid-month range spans', () => {
    const plan = planRange({ start: '2026-08-15', end: '2026-09-15' }, [sep, aug], all);
    expect(plan.ok && plan.pieces.map((p) => [p.report.id, p.start, p.end, p.whole])).toEqual([
      ['aug', '2026-08-15', '2026-08-31', false],
      ['sep', '2026-09-01', '2026-09-15', false],
    ]);
  });

  it('refuses to cut a month whose General Ledger is not published', () => {
    const plan = planRange({ start: '2026-08-01', end: '2026-09-15' }, [sep, aug], (r) => r.id === 'aug');
    expect(plan).toMatchObject({ ok: false, reason: 'needs_ledger', at: { start: '2026-09-01', end: '2026-09-30' } });
  });

  it('cuts a range that runs past what is published down to the published days, and says so', () => {
    const plan = planRange({ start: '2026-01-01', end: '2026-12-31' }, [sep, aug], all);
    expect(plan).toMatchObject({ ok: true, clamped: true, range: { start: '2026-08-01', end: '2026-09-30' } });
  });

  it('never reads a month nothing covers as zero', () => {
    const jun = report('jun', '2026-06-01', '2026-06-30');
    const plan = planRange({ start: '2026-06-01', end: '2026-08-31' }, [aug, jun], all);
    expect(plan).toMatchObject({ ok: false, reason: 'gap', at: { start: '2026-07-01', end: '2026-07-31' } });
  });

  it('has nothing to show for a range entirely outside what is published', () => {
    expect(planRange({ start: '2026-10-01', end: '2026-10-31' }, [sep, aug], all)).toMatchObject({ ok: false, reason: 'nothing_published' });
  });

  it('prefers the longest whole statement, and splits the shortest one otherwise', () => {
    const q3 = report('q3', '2026-07-01', '2026-09-30');
    const jul = report('jul', '2026-07-01', '2026-07-31');
    const whole = planRange({ start: '2026-07-01', end: '2026-09-30' }, [q3, sep, aug, jul], all);
    expect(whole.ok && whole.pieces.map((p) => p.report.id)).toEqual(['q3']);
    const split = planRange({ start: '2026-07-01', end: '2026-09-15' }, [q3, sep, aug, jul], all);
    expect(split.ok && split.pieces.map((p) => [p.report.id, p.whole])).toEqual([
      ['jul', true],
      ['aug', true],
      ['sep', false],
    ]);
  });

  it('can split a longer statement when its ledger is the one published', () => {
    const h1 = report('h1', '2026-01-01', '2026-06-30');
    const plan = planRange({ start: '2026-03-01', end: '2026-03-31' }, [h1], all);
    expect(plan.ok && plan.pieces.map((p) => [p.report.id, p.start, p.end, p.whole])).toEqual([['h1', '2026-03-01', '2026-03-31', false]]);
    expect(planRange({ start: '2026-03-01', end: '2026-03-31' }, [h1], () => false)).toMatchObject({ ok: false, reason: 'needs_ledger' });
  });
});

describe('sliceStatement', () => {
  const rows = month('aug', { pos: 100_000, zelle: 50_000, cogs: 40_000, elec: 10_000, water: 5_000, rent: 30_000, interest: 1_000 });
  const half = (node: LineNode) => Math.round((node.currentCents ?? 0) / 2);

  it('gives back every printed total from the printed accounts', () => {
    const values = sliceStatement(rows, (node) => node.currentCents ?? 0);
    expect(values).not.toBeNull();
    for (const row of rows) expect(values!.get(row.id) ?? null).toBe(row.currentCents);
  });

  it('re-adds the totals from the accounts a date range carries', () => {
    const values = sliceStatement(rows, half)!;
    expect(byName(rows, values)).toMatchObject({
      'Total Income': 75_000,
      'Total Cost of Goods Sold': 20_000,
      'Gross Profit': 55_000,
      'Total 6300 Utilities': 7_500,
      'Total Expenses': 22_500,
      'Net Operating Income': 32_500,
      'Net Other Income': 500,
      'Net Income': 33_000,
      Income: null,
      '6300 Utilities': null,
    });
  });

  it('refuses a statement whose printed totals do not follow from its accounts', () => {
    const broken = rows.map((row) => (row.accountName === 'Total Income' ? { ...row, currentCents: 150_001 } : row));
    expect(sliceStatement(broken, half)).toBeNull();
  });

  it('reads a loose line between operating and net income by the sign the statement prints', () => {
    const loose = statement('loose', [
      { name: 'Income', section: true, children: [
        { name: 'Sales', cents: 10_000 },
        { name: 'Total Income', cents: 10_000, total: true },
      ] },
      { name: 'Expenses', section: true, children: [
        { name: 'Rent', cents: 4_000 },
        { name: 'Total Expenses', cents: 4_000, total: true },
      ] },
      { name: 'Unclassified expenses', cents: 1_000 },
      { name: 'Net Income', cents: 5_000, total: true },
    ]);
    const values = sliceStatement(loose, half)!;
    expect(byName(loose, values)['Net Income']).toBe(2_500);
  });
});

describe('composeRange', () => {
  const augRows = month('aug', { pos: 100_000, zelle: 50_000, cogs: 40_000, elec: 10_000, water: 5_000, rent: 30_000, interest: 1_000 });
  const sepRows = month('sep', { pos: 120_000, zelle: 60_000, cogs: 45_000, elec: 11_000, water: 6_000, rent: 30_000, interest: 0, repairs: 2_500 });
  const piece = (id: string, rows: LineRow[], start: string, end: string): SlicedPiece => ({
    piece: { report: report(id, start, end), start, end, whole: true },
    rows,
    values: new Map(rows.map((row) => [row.id, row.currentCents])),
  });

  it('adds two months line by line, keeping an account only one of them prints', () => {
    const composed = composeRange([
      piece('aug', augRows, '2026-08-01', '2026-08-31'),
      piece('sep', sepRows, '2026-09-01', '2026-09-30'),
    ])!;
    const tree = buildTree(composed.rows);
    const totals = Object.fromEntries(composed.rows.map((row) => [row.accountName, row.currentCents]));
    expect(totals).toMatchObject({
      '1001 Sales (POS)': 220_000,
      'Total Income': 330_000,
      'Gross Profit': 245_000,
      '6400 Repairs': 2_500,
      'Total Expenses': 94_500,
      'Interest earned': 1_000,
      'Net Income': 151_500,
    });
    // The new account sits where September prints it, above the section total.
    const expenses = tree.find((node) => node.accountName === 'Expenses')!;
    expect(expenses.children.map((node) => node.accountName)).toEqual(['6300 Utilities', '6400 Repairs', '5943 Rent', 'Total Expenses']);
    expect(composed.sources.get(rangeLineId('expenses › 6400 repairs'))).toEqual([{ piece: 1, lineId: expect.stringMatching(/^sep-/) }]);
  });

  it('gives the same account the same id in any range', () => {
    const one = composeRange([piece('aug', augRows, '2026-08-01', '2026-08-31')])!;
    const two = composeRange([piece('aug', augRows, '2026-08-01', '2026-08-31'), piece('sep', sepRows, '2026-09-01', '2026-09-30')])!;
    const rent = (rows: LineRow[]) => rows.find((row) => row.accountName === '5943 Rent')!.id;
    expect(rent(one.rows)).toBe(rent(two.rows));
  });

  it('refuses to add an account printed as one line to the same account broken into sub-accounts', () => {
    const collapsed = statement('col', [
      { name: 'Expenses', section: true, children: [
        { name: '6300 Utilities', cents: 15_000 },
        { name: 'Total Expenses', cents: 15_000, total: true },
      ] },
    ]);
    expect(composeRange([piece('jul', collapsed, '2026-07-01', '2026-07-31'), piece('aug', augRows, '2026-08-01', '2026-08-31')])).toBeNull();
  });
});
