// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { accountLabel, withAccountLabels } from '@/lib/portal/account-label';

describe('accountLabel', () => {
  it('drops the preparer’s trailing notes', () => {
    expect(accountLabel('Payroll (1 employee, $1,200/week × 5 Mondays, cash)')).toBe('Payroll');
    expect(accountLabel('Rent (cash)')).toBe('Rent');
    expect(accountLabel('Utilities — gas (Peoples Energy)')).toBe('Utilities — gas');
    expect(accountLabel('Net income (loss) (unaudited)')).toBe('Net income');
  });

  it('leaves a name with no trailing note, or nothing but a note, as it is', () => {
    expect(accountLabel('Total operating expenses')).toBe('Total operating expenses');
    expect(accountLabel('Sales (net) retail')).toBe('Sales (net) retail');
    expect(accountLabel('(Unlabeled)')).toBe('(Unlabeled)');
  });

  it('keeps "(POS)", which names the sales rather than annotating them', () => {
    expect(accountLabel('1001- Sales (POS)')).toBe('Sales (POS)');
    expect(accountLabel('Sales (POS) (cash)')).toBe('Sales (POS)');
  });
});

describe('accountLabel — account codes', () => {
  it('drops the chart-of-accounts code in front of the name', () => {
    expect(accountLabel('1001- Sales')).toBe('Sales');
    expect(accountLabel('0099 - Accounting')).toBe('Accounting');
    expect(accountLabel('8801-Delivery Costs')).toBe('Delivery Costs');
    expect(accountLabel('Total for 6300 - Utilities')).toBe('Total for Utilities');
    expect(accountLabel('Total 9020 – Vehicle expense')).toBe('Total Vehicle expense');
  });

  it('leaves a name that merely starts with a number', () => {
    expect(accountLabel('1099 contractors')).toBe('1099 contractors');
    expect(accountLabel('401-k match')).toBe('401-k match');
    expect(accountLabel('24-hour support')).toBe('24-hour support');
  });
});

describe('withAccountLabels', () => {
  it('reads codes off only a statement whose accounts carry them', () => {
    const coded = withAccountLabels([
      { accountName: 'Expenses', isSection: true },
      { accountName: '5943 - Rent' },
      { accountName: '7302 - Insurance' },
      { accountName: 'Total for Expenses', isTotal: true },
    ]);
    expect(coded.map((l) => l.accountName)).toEqual(['Expenses', 'Rent', 'Insurance', 'Total for Expenses']);

    const plain = withAccountLabels([
      { accountName: 'Rent' },
      { accountName: 'Payroll' },
      { accountName: '1099-NEC contractors' },
    ]);
    expect(plain.map((l) => l.accountName)).toEqual(['Rent', 'Payroll', '1099-NEC contractors']);
  });


  it('reads the code off a total when extraction split it off the account above', () => {
    // Que la creo Burger's September P&L, as stored: each account's code in its
    // own column, and the totals that close a parent account still printing it.
    const lines = withAccountLabels([
      { accountName: 'Expenses', isSection: true },
      { accountName: 'Rent', accountNumber: '5943' },
      { accountName: 'Utilities', accountNumber: '6300', isSection: true },
      { accountName: 'Electricity', accountNumber: '63001' },
      { accountName: 'Gas', accountNumber: '63002' },
      { accountName: 'Total for 6300 - Utilities', isTotal: true },
      { accountName: 'Vehicle expense', accountNumber: '9020', isSection: true },
      { accountName: 'Fuel', accountNumber: '99201' },
      { accountName: 'Total for 9020- Vehicle expense', isTotal: true },
      { accountName: 'Total for Expenses', isTotal: true },
    ]);
    expect(lines.filter((l) => l.isTotal).map((l) => l.accountName)).toEqual([
      'Total for Utilities',
      'Total for Vehicle expense',
      'Total for Expenses',
    ]);
  });

  it('reads the code off a total that closes a coded account, even in a mostly uncoded statement', () => {
    const lines = withAccountLabels([
      { accountName: 'Rent' },
      { accountName: 'Payroll' },
      { accountName: 'Insurance' },
      { accountName: 'Utilities', accountNumber: '6300', isSection: true },
      { accountName: 'Electricity' },
      { accountName: 'Total for 6300 - Utilities', isTotal: true },
      { accountName: '1099-NEC contractors' },
    ]);
    expect(lines.map((l) => l.accountName)).toContain('Total for Utilities');
    expect(lines.map((l) => l.accountName)).toContain('1099-NEC contractors');
  });

  it('keeps the note on lines it is the only thing telling apart', () => {
    const lines = withAccountLabels([
      { accountName: 'Food (bank)' },
      { accountName: 'Food (cash)' },
      { accountName: 'Payroll (1 employee)' },
    ]);
    expect(lines.map((l) => l.accountName)).toEqual(['Food (bank)', 'Food (cash)', 'Payroll']);
  });
});
