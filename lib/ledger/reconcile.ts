// The checks a General Ledger must pass before it can be published, all
// arithmetic on the file's own figures and all to the cent: the portal tells a
// client that these transactions add up to their statement, so a tolerance
// would make that sentence false.
//
//   account:<n>      every account's transactions (and its sub-accounts) sum
//                    to the "Total for …" the export prints for it
//   dates_in_period  no transaction falls outside the ledger's period
//                    (actualCents counts the ones that do)
import type { Reconciliation, ReconciliationCheck } from '@/lib/ingestion/reconciliation';
import { sumCents } from '@/lib/money';

import type { LedgerPeriod } from './period';
import type { ParsedLedger } from './parse';

function exact(key: string, label: string, expectedCents: number, actualCents: number): ReconciliationCheck {
  return { key, label, expectedCents, actualCents, toleranceCents: 0, ok: expectedCents === actualCents };
}

/** Each account's own transactions plus everything under it, in file order. */
export function accountTotals(ledger: Pick<ParsedLedger, 'accounts' | 'transactions'>): number[] {
  const own = ledger.accounts.map(() => 0);
  for (const tx of ledger.transactions) own[tx.accountIndex] = (own[tx.accountIndex] ?? 0) + tx.amountCents;
  const totals = [...own];
  // Children always follow their parent in the file, so walking backwards
  // folds every sub-account into its parent before the parent is folded up.
  for (let i = ledger.accounts.length - 1; i >= 0; i -= 1) {
    const parent = ledger.accounts[i]?.parentIndex;
    if (parent !== null && parent !== undefined) totals[parent] = sumCents([totals[parent] ?? 0, totals[i] ?? 0]);
  }
  return totals;
}

export function reconcileLedger(ledger: ParsedLedger, period: LedgerPeriod | null): Reconciliation {
  const totals = accountTotals(ledger);
  const checks = ledger.accounts.map((account, index) =>
    exact(`account:${index}`, account.name, account.printedTotalCents ?? 0, totals[index] ?? 0),
  );
  if (period) {
    const outside = ledger.transactions.filter((tx) => tx.date < period.start || tx.date > period.end).length;
    checks.push(exact('dates_in_period', 'Transactions dated outside the period', 0, outside));
  } else {
    // No period, nothing to hold the dates against and nothing to match to a
    // P&L: a failing check, so the ledger cannot be published until the firm
    // sets one.
    checks.push(exact('period', 'Ledger period', 1, 0));
  }
  return { passed: checks.every((check) => check.ok), checks, lowConfidence: { count: 0, refs: [] } };
}
