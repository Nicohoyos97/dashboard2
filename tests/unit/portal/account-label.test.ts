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
});

describe('withAccountLabels', () => {
  it('keeps the note on lines it is the only thing telling apart', () => {
    const lines = withAccountLabels([
      { accountName: 'Food (bank)' },
      { accountName: 'Food (cash)' },
      { accountName: 'Payroll (1 employee)' },
    ]);
    expect(lines.map((l) => l.accountName)).toEqual(['Food (bank)', 'Food (cash)', 'Payroll']);
  });
});
