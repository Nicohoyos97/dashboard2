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


  it('keeps the note on lines it is the only thing telling apart', () => {
    const lines = withAccountLabels([
      { accountName: 'Food (bank)' },
      { accountName: 'Food (cash)' },
      { accountName: 'Payroll (1 employee)' },
    ]);
    expect(lines.map((l) => l.accountName)).toEqual(['Food (bank)', 'Food (cash)', 'Payroll']);
  });
});
