// Deterministic reconciliation (spec §9). Bank and tax checks live here; the
// statement checks are in reconcile-statement.ts. Any failed check or any
// figure under CONFIDENCE_THRESHOLD means the extraction cannot be published.
import { toCents } from '@/lib/money';

import { finishReconciliation, isLowConfidence, makeCheck } from './reconciliation';
import type { Reconciliation, ReconciliationCheck } from './reconciliation';
import type { BankActivity } from './schemas/bank-activity';
import type { SalesReport } from './schemas/sales-report';
import type { TaxRecord } from './schemas/tax-record';

export { reconcileStatement } from './reconcile-statement';
export { CONFIDENCE_THRESHOLD, RECONCILE_TOLERANCE_CENTS } from './reconciliation';
export type { Reconciliation, ReconciliationCheck } from './reconciliation';

function centsOrZero(value: string | null | undefined): number {
  return value === null || value === undefined ? 0 : toCents(value);
}

/**
 * Which way the printed balance moves, from the account's own category.
 *
 * Everything is a debit or a credit depending on whether the account is an
 * asset, a liability, equity, income or an expense. Under this pipeline's
 * extraction convention — debit is money leaving the account, credit is money
 * entering it — a depository balance is an asset and rises with credits, while
 * a credit card or a loan prints the amount *owed*, a liability, which rises
 * with debits. Assuming the asset equation everywhere meant no card or loan
 * statement could ever tie out.
 */
function isLiabilityAccount(kind: BankActivity['account_kind']): boolean {
  return kind === 'credit_card' || kind === 'loan';
}

export function reconcileBankStatement(statement: BankActivity): Reconciliation {
  const owed = isLiabilityAccount(statement.account_kind);
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
    const inflow = centsOrZero(transaction.credit);
    const outflow = centsOrZero(transaction.debit);
    const movement = owed ? outflow - inflow : inflow - outflow;
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
    makeCheck(
      'ending_balance',
      owed
        ? 'Beginning balance + debits − credits = ending balance owed'
        : 'Beginning balance + credits − debits = ending balance',
      computed,
      ending,
    ),
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

/**
 * What a point-of-sale report can be checked against itself.
 *
 * Two identities, each only when the report prints all of its terms — a POS
 * report that omits a figure is normal, and inventing a zero to make an
 * equation balance would turn a missing number into a passing check.
 */
type SalesFigures = Pick<
  SalesReport,
  'gross_sales' | 'net_sales' | 'refunds' | 'discounts' | 'amount_collected' | 'confidence'
>;

export function reconcileSalesReport(report: SalesFigures, tenders: readonly { amount: string }[]): Reconciliation {
  const checks: ReconciliationCheck[] = [];
  // Amounts arrive as decimal strings, never floats (schemas/common.ts).
  const cents = (value: string | null | undefined) => (value === null || value === undefined ? null : toCents(value));

  const gross = cents(report.gross_sales);
  const refunds = cents(report.refunds);
  const discounts = cents(report.discounts);
  const net = cents(report.net_sales);
  if (gross !== null && refunds !== null && net !== null) {
    // Discounts are the third term and were missing: a month with none passed,
    // and the first month with a $15 discount failed by exactly $15 while the
    // extraction had been right all along.
    //
    // A discount the report did not print counts as zero here, which is the
    // safe direction: it can only turn a pass into a failure the firm looks
    // at, never a failure into a false pass.
    const deductions = refunds + (discounts ?? 0);
    checks.push(
      makeCheck('net_sales', 'Gross sales − refunds − discounts = net sales', gross - deductions, net),
    );
  }

  // What the tender lines add up to is what was actually taken in. This is the
  // check that catches a report read from the wrong column.
  const collected = cents(report.amount_collected);
  if (collected !== null && tenders.length > 0) {
    const sum = tenders.reduce((total, tender) => total + toCents(tender.amount), 0);
    checks.push(makeCheck('amount_collected', 'Tender types add up to the amount collected', sum, collected));
  }

  return finishReconciliation(checks, isLowConfidence(report.confidence) ? ['report'] : []);
}

/**
 * What can actually be cross-checked on a CSV transaction export.
 *
 * A transaction export is a ledger, not a report: it prints no beginning or
 * ending balance to tie out against, so the previous code recorded
 * `passed: false` unconditionally — conflating "these figures disagree" with
 * "there is nothing here to check". Since publishBlockers requires a pass, a
 * clean 400-row export could never reach the client, and no correction path
 * existed to clear it.
 *
 * Two invariants do hold, and they are the ones that matter for a ledger:
 * every row the file contained was understood, and where the export prints a
 * running balance it moves by exactly the amount on each line.
 */
export function reconcileCsvExport(
  rows: readonly { debit: string | null; credit: string | null; balance: string | null }[],
  skipped: readonly unknown[],
): Reconciliation {
  // Built by hand rather than through makeCheck: this is a count of rows, and a
  // count admits no tolerance — one dropped line is one transaction missing.
  const present = rows.length + skipped.length;
  const checks: ReconciliationCheck[] = [
    {
      key: 'rows_parsed',
      label: 'Every row in the file was understood',
      expectedCents: present,
      actualCents: rows.length,
      toleranceCents: 0,
      ok: skipped.length === 0,
    },
  ];

  const hasBalances = rows.length > 0 && rows.every((r) => r.balance !== null);
  if (hasBalances) {
    let previous: number | null = null;
    let firstBreak: { expected: number; actual: number } | null = null;
    for (const line of rows) {
      const printed = centsOrZero(line.balance);
      const movement = centsOrZero(line.credit) - centsOrZero(line.debit);
      if (previous !== null && firstBreak === null) {
        const expected = previous + movement;
        if (Math.abs(expected - printed) > 0) firstBreak = { expected, actual: printed };
      }
      previous = printed;
    }
    const at = firstBreak ?? { expected: previous ?? 0, actual: previous ?? 0 };
    checks.push(makeCheck('running_balance', 'Running balance continuity', at.expected, at.actual));
  }

  return finishReconciliation(checks, []);
}
