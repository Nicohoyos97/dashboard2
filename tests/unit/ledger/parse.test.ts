// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { IngestionError } from '@/lib/ingestion/errors';
import { parseLedgerPeriod } from '@/lib/ledger/period';
import { parseGeneralLedger } from '@/lib/ledger/parse';
import { accountTotals, reconcileLedger } from '@/lib/ledger/reconcile';
import { looksLikeGeneralLedger } from '@/lib/ledger/persist';

import { LEDGER_CSV, withLine } from './fixtures';

const detail = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    if (error instanceof IngestionError && error.code === 'ledger_unrecognized') return error.message;
    throw error;
  }
  throw new Error('expected ledger_unrecognized');
};

describe('parseGeneralLedger', () => {
  const ledger = parseGeneralLedger(LEDGER_CSV);

  it('reads the title lines, the period and the basis footer', () => {
    expect(ledger.company).toBe('Demo Coffee Co.');
    expect(ledger.periodLabel).toBe('September 2026');
    expect(ledger.period).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    expect(ledger.basis).toBe('accrual');
  });

  it('nests sub-accounts under their parent and keeps the printed totals', () => {
    const names = ledger.accounts.map((a) => a.name);
    expect(names).toEqual([
      'Checking ••4410',
      'Sales tax payable',
      '4000 - Coffee & food sales',
      '5000 - Coffee beans',
      '6300 - Utilities',
      '63001 - Electricity',
      '63005 - Internet',
    ]);
    const utilities = names.indexOf('6300 - Utilities');
    const electricity = ledger.accounts[names.indexOf('63001 - Electricity')];
    expect(electricity?.parentIndex).toBe(utilities);
    expect(electricity?.depth).toBe(1);
    expect(ledger.accounts[utilities]?.printedTotalCents).toBe(64_040);
    // "-$1,648.22": the sign before the symbol.
    expect(ledger.accounts[0]?.printedTotalCents).toBe(-164_822);
  });

  it('reads every transaction with its own sign and its fields as printed', () => {
    expect(ledger.transactions).toHaveLength(11);
    const adjustment = ledger.transactions.find((tx) => tx.type === 'Journal Entry' && tx.amountCents < 0);
    expect(adjustment).toMatchObject({ date: '2026-09-30', num: '1004', name: null, description: null, split: null, amountCents: -10_520 });
    const deposit = ledger.transactions.find((tx) => tx.name === 'Toast POS');
    expect(deposit).toMatchObject({ date: '2026-09-09', type: 'Deposit', description: 'Card sales payout', split: 'Checking ••4410', amountCents: 119_840 });
  });

  it('adds every account up to the total the file prints', () => {
    const rec = reconcileLedger(ledger, ledger.period);
    expect(rec.passed).toBe(true);
    expect(accountTotals(ledger)[ledger.accounts.findIndex((a) => a.name === '6300 - Utilities')]).toBe(64_040);
  });

  it('fails the account whose transactions no longer reach its printed total', () => {
    const changed = parseGeneralLedger(
      withLine(',63005 - Internet,09/20/2026,Expense,,,COMCAST BUSINESS,Checking ••4410,128.00,128.00', ',63005 - Internet,09/20/2026,Expense,,,COMCAST BUSINESS,Checking ••4410,128.01,128.01'),
    );
    const rec = reconcileLedger(changed, changed.period);
    expect(rec.passed).toBe(false);
    // To the cent, no tolerance: the internet account and its parent both fail.
    expect(rec.checks.filter((c) => !c.ok).map((c) => c.label)).toEqual(['6300 - Utilities', '63005 - Internet']);
  });

  it('fails a transaction dated outside the period, and a ledger with no period at all', () => {
    const late = parseGeneralLedger(withLine('09/20/2026,Expense,,,COMCAST BUSINESS,Checking ••4410,128.00', '10/01/2026,Expense,,,COMCAST BUSINESS,Checking ••4410,128.00'));
    expect(reconcileLedger(late, late.period).checks.find((c) => c.key === 'dates_in_period')).toMatchObject({ ok: false, actualCents: 1 });
    expect(reconcileLedger(ledger, null).passed).toBe(false);
  });

  it('refuses files that are not a General Ledger in this layout, naming only where', () => {
    expect(detail(() => parseGeneralLedger('Date,Amount\n09/01/2026,1.00'))).toContain('title');
    expect(detail(() => parseGeneralLedger(withLine('Total for 5000 - Coffee beans,', 'Total for 5001 - Beans,')))).toContain('total');
    expect(detail(() => parseGeneralLedger(withLine('09/12/2026,Expense,,FPL,ELECTRIC PAYMENT,Checking', '13/12/2026,Expense,,FPL,ELECTRIC PAYMENT,Checking')))).toContain('date');
    expect(detail(() => parseGeneralLedger(withLine(',63001 - Electricity,09/12', ',63005 - Internet,09/12')))).toContain('account');
    expect(detail(() => parseGeneralLedger(LEDGER_CSV.replace(',Distribution account,Transaction date', ',Distribution account,When')))).toContain('header');
  });

  it('recognises an untyped upload as a ledger by its title lines', () => {
    expect(looksLikeGeneralLedger(LEDGER_CSV)).toBe(true);
    expect(looksLikeGeneralLedger('﻿Date,Description,Amount\n09/01/2026,Coffee,1.00')).toBe(false);
  });
});

describe('parseLedgerPeriod', () => {
  it.each([
    ['September 2026', '2026-09-01', '2026-09-30'],
    ['February 2028', '2028-02-01', '2028-02-29'],
    ['September 1-30, 2026', '2026-09-01', '2026-09-30'],
    ['January 1-October 18, 2026', '2026-01-01', '2026-10-18'],
    ['December 1, 2025 - January 31, 2026', '2025-12-01', '2026-01-31'],
    ['January - March, 2026', '2026-01-01', '2026-03-31'],
    ['Sep 1–30, 2026', '2026-09-01', '2026-09-30'],
  ])('%s', (label, start, end) => {
    expect(parseLedgerPeriod(label)).toEqual({ start, end });
  });

  it.each(['', 'This fiscal year', 'September 31, 2026', 'October 18 - September 1, 2026'])('refuses %j', (label) => {
    expect(parseLedgerPeriod(label)).toBeNull();
  });
});
