// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { groupByPayee, knownType, txnTitle, type LedgerTxn } from '@/lib/ledger/display';
import { type LedgerAccountTotal, accountKey, matchLedger, statementAccountLines } from '@/lib/ledger/match';
import { buildTree } from '@/lib/reports/tree';

import { line, resetPositions } from '../reports/fixtures';

// A September P&L as extraction hands it over: numbers split from names on
// some lines, sub-accounts under their heading, totals flagged.
function pnl() {
  resetPositions();
  return buildTree([
    line('S1', 'Income', { isSection: true }),
    line('A1', 'Coffee & food sales', { parent: 'S1', number: '4000', current: 249_538 }),
    line('T1', 'Total Income', { parent: 'S1', isTotal: true, current: 249_538 }),
    line('S2', 'Cost of Goods Sold', { isSection: true }),
    line('A2', '5000 - Coffee beans', { parent: 'S2', current: 241_000 }),
    line('S3', 'Expenses', { isSection: true }),
    line('H1', 'Utilities', { parent: 'S3', isSection: true, number: '6300' }),
    line('A3', 'Electricity', { parent: 'H1', number: '63001', current: 51_240 }),
    line('A4', 'Internet', { parent: 'H1', current: 12_800 }),
    line('T2', 'Total Utilities', { parent: 'H1', isTotal: true, current: 64_040 }),
    line('Z1', 'Rent', { parent: 'S3', current: 0 }),
    line('N1', 'Net Income', { isTotal: true, current: -56_302 }),
  ]);
}

const accounts = (overrides: Partial<Record<string, number>> = {}): LedgerAccountTotal[] => [
  { id: 'g-checking', name: 'Checking ••4410', parentId: null, totalCents: -164_822 },
  { id: 'g-sales', name: '4000 - Coffee & food sales', parentId: null, totalCents: overrides['g-sales'] ?? 249_538 },
  { id: 'g-beans', name: '5000 - Coffee beans', parentId: null, totalCents: 241_000 },
  { id: 'g-util', name: '6300 - Utilities', parentId: null, totalCents: 64_040 },
  { id: 'g-elec', name: '63001 - Electricity', parentId: 'g-util', totalCents: 51_240 },
  { id: 'g-net', name: '63005 - Internet', parentId: 'g-util', totalCents: 12_800 },
];

describe('matchLedger', () => {
  it('reads the P&L account lines only: no headings, no totals, no empty lines', () => {
    expect(statementAccountLines(pnl()).map((l) => l.id)).toEqual(['A1', 'A2', 'A3', 'A4']);
  });

  it('finds each line by number and name, or by name alone when it is unique', () => {
    const result = matchLedger(pnl(), accounts());
    expect(result.lines.map((l) => [l.lineId, l.accountId, l.status])).toEqual([
      ['A1', 'g-sales', 'matched'],
      ['A2', 'g-beans', 'matched'],
      ['A3', 'g-elec', 'matched'],
      ['A4', 'g-net', 'matched'],
    ]);
    expect(result.passed).toBe(true);
  });

  it('treats a single cent of difference as a mismatch', () => {
    const result = matchLedger(pnl(), accounts({ 'g-sales': 249_537 }));
    expect(result.lines[0]).toMatchObject({ status: 'mismatch', statementCents: 249_538, ledgerCents: 249_537 });
    expect(result.passed).toBe(false);
  });

  it('reports a line with no account, and refuses to guess between two accounts of one name', () => {
    const twoInternets = [...accounts(), { id: 'g-net2', name: '63006 - Internet', parentId: 'g-util', totalCents: 0 }];
    const result = matchLedger(pnl(), twoInternets.filter((a) => a.id !== 'g-beans'));
    expect(result.lines.find((l) => l.lineId === 'A2')?.status).toBe('missing');
    expect(result.lines.find((l) => l.lineId === 'A4')?.status).toBe('missing');
  });

  it('leaves out of the client side every account no line points at, parents of matched ones excepted', () => {
    expect(matchLedger(pnl(), accounts()).unmatched.map((a) => a.id)).toEqual(['g-checking']);
  });

  it('keys accounts the way QuickBooks and extraction both write them', () => {
    expect(accountKey('1001- Sales (POS)')).toBe(accountKey('1001 Sales (POS)'));
    expect(accountKey('6300 - Utilities')).toBe('6300 utilities');
    expect(accountKey('Café')).toBe('cafe');
  });
});

describe('how a transaction reads', () => {
  const tx = (over: Partial<LedgerTxn>): LedgerTxn => ({
    id: 'x', accountId: 'a', date: '2026-09-01', type: 'Expense', num: null, name: null, description: null, split: null, amountCents: 100, ...over,
  });

  it('is titled by its payee, else by the bank description exactly as printed', () => {
    expect(txnTitle(tx({ name: 'Cafe Import Co', description: 'Ethiopia 60kg' }))).toEqual({ title: 'Cafe Import Co', detail: 'Ethiopia 60kg' });
    expect(txnTitle(tx({ description: 'CCD MERCHANT SERVICE MERCH DEP' }))).toEqual({ title: 'CCD MERCHANT SERVICE MERCH DEP', detail: null });
    expect(txnTitle(tx({}))).toEqual({ title: null, detail: null });
  });

  it('names the QuickBooks types it knows and leaves the rest as printed', () => {
    expect(knownType('Journal Entry')).toBe('journal_entry');
    expect(knownType('Bill Payment (Check)')).toBe('bill_payment');
    expect(knownType('Inventory Qty Adjust')).toBeNull();
  });

  it('groups by payee, largest first, adjustments included', () => {
    const groups = groupByPayee(
      [tx({ name: 'Meta', amountCents: 30_000 }), tx({ name: 'Print Hub', amountCents: 10_000 }), tx({ name: 'Meta', amountCents: 20_309 }), tx({ type: 'Journal Entry', amountCents: -5_000 })],
      (t) => (t.type === 'Journal Entry' ? 'Bookkeeper adjustment' : 'No description'),
    );
    expect(groups).toEqual([
      { label: 'Meta', count: 2, totalCents: 50_309 },
      { label: 'Print Hub', count: 1, totalCents: 10_000 },
      { label: 'Bookkeeper adjustment', count: 1, totalCents: -5_000 },
    ]);
  });
});
