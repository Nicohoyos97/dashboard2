// @vitest-environment node
import { describe, expect, it } from 'vitest';

import type { LedgerTxn } from '@/lib/ledger/display';
import { ledgerCsv, ledgerCsvFilename } from '@/lib/ledger/csv';

const tx = (over: Partial<LedgerTxn>): LedgerTxn => ({
  id: 'x', accountId: 'a', date: '2026-09-03', type: 'Bill', num: null, name: 'Cafe Import Co',
  description: 'Ethiopia, 60 kg', split: 'Chase Checking ••4410', amountCents: 241_000, ...over,
});

describe('ledger CSV', () => {
  it('writes one row per transaction with plain decimals and the sign the ledger printed', () => {
    const csv = ledgerCsv('Coffee beans', [tx({}), tx({ type: 'Journal Entry', num: '1004', name: null, description: null, split: null, amountCents: -10_520 })], 'en');
    expect(csv.split('\r\n')).toEqual([
      'Account,Date,Name,Description,Type,Num,Other account,Amount',
      'Coffee beans,2026-09-03,Cafe Import Co,"Ethiopia, 60 kg",Bill,,Chase Checking ••4410,2410.00',
      'Coffee beans,2026-09-03,,,Journal Entry,1004,,-105.20',
    ]);
  });

  it('heads its columns in the reader’s language', () => {
    expect(ledgerCsv('Ventas', [], 'es')).toBe('Cuenta,Fecha,Nombre,Descripción,Tipo,Número,Otra cuenta,Monto');
  });

  it('never lets a payee or a description become a spreadsheet formula', () => {
    const csv = ledgerCsv('=HYPERLINK("x")', [tx({ name: '=cmd|calc', description: '@SUM(A1)' })], 'en');
    expect(csv).not.toMatch(/(^|,)=|(^|,)@/m);
    expect(csv).toContain("'=cmd|calc");
    expect(csv).toContain("'@SUM(A1)");
  });

  it('names the file after the account and the period, in plain ASCII', () => {
    expect(ledgerCsvFilename('Coffee & food sales', { periodStart: '2026-09-01', periodEnd: '2026-09-30' })).toBe('coffee-food-sales_2026-09-01_2026-09-30.csv');
    expect(ledgerCsvFilename('Teneduría', { periodStart: '2026-09-01', periodEnd: '2026-09-30' })).toBe('teneduria_2026-09-01_2026-09-30.csv');
  });
});
