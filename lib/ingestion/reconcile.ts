// Deterministic reconciliation (spec §9). Bank and tax checks live here; the
// statement checks are in reconcile-statement.ts. Any failed check or any
// figure under CONFIDENCE_THRESHOLD means the extraction cannot be published.
import { toCents } from '@/lib/money';

import { finishReconciliation, isLowConfidence, makeCheck } from './reconciliation';
import type { Reconciliation, ReconciliationCheck } from './reconciliation';
import type { BankActivity } from './schemas/bank-activity';
import type { TaxRecord } from './schemas/tax-record';

export { reconcileStatement } from './reconcile-statement';
export { CONFIDENCE_THRESHOLD, RECONCILE_TOLERANCE_CENTS } from './reconciliation';
export type { Reconciliation, ReconciliationCheck } from './reconciliation';

function centsOrZero(value: string | null | undefined): number {
  return value === null || value === undefined ? 0 : toCents(value);
}

export function reconcileBankStatement(statement: BankActivity): Reconciliation {
  const beginning = toCents(statement.beginning_balance);
  const ending = toCents(statement.ending_balance);
  const hasRunning =
    statement.transactions.length > 0 &&
    statement.transactions.every((t) => t.running_balance !== null && t.running_balance !== undefined);

  let computed = beginning;
  let previousPrinted = beginning;
  let firstBreak: { expected: number; actual: number } | null = null;
  const lowConfidence: string[] = [];

  statement.transactions.forEach((transaction, index) => {
    const movement = centsOrZero(transaction.credit) - centsOrZero(transaction.debit);
    computed += movement;
    if (hasRunning) {
      const printed = centsOrZero(transaction.running_balance);
      const expected = previousPrinted + movement;
      if (firstBreak === null && Math.abs(expected - printed) > 0) firstBreak = { expected, actual: printed };
      previousPrinted = printed;
    }
    if (isLowConfidence(transaction.confidence)) lowConfidence.push(`T${index + 1}`);
  });

  const checks: ReconciliationCheck[] = [
    makeCheck('ending_balance', 'Beginning balance + credits − debits = ending balance', computed, ending),
  ];
  if (hasRunning) {
    // Continuity is line-to-line only; whether the last balance is the ending balance is the check above.
    const at: { expected: number; actual: number } = firstBreak ?? { expected: previousPrinted, actual: previousPrinted };
    checks.push(makeCheck('running_balance', 'Running balance continuity', at.expected, at.actual));
  }
  return finishReconciliation(checks, lowConfidence);
}

/** Works for any tax record; the collected − paid = payable check only applies when all three are printed. */
export function reconcileSalesTax(record: TaxRecord): Reconciliation {
  const checks: ReconciliationCheck[] = [];
  if (record.tax_collected !== undefined && record.amount_paid !== undefined && record.amount_payable !== undefined) {
    checks.push(
      makeCheck(
        'sales_tax_payable',
        'Tax collected − amount paid = amount payable',
        toCents(record.tax_collected) - toCents(record.amount_paid),
        toCents(record.amount_payable),
      ),
    );
  }
  return finishReconciliation(checks, isLowConfidence(record.confidence) ? ['record'] : []);
}
