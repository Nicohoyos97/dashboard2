// The comparison that only exists because the two documents are kept apart.
//
// A point-of-sale report says what was sold; a state filing says what is owed.
// Neither can validate the other on its own, but together they answer the
// question a firm actually has: does what we filed match what the register
// rang up? Warnings only — a legitimate gap is common (marketplace facilitators
// remit their own tax, exempt sales, accrual timing), so this reports the
// difference and leaves the judgement to the firm (owner's call, 2026-09-05).
import { toCents } from '@/lib/money';

export type CrossCheck =
  | { kind: 'no_pair' }
  | { kind: 'ok' }
  | {
      kind: 'difference';
      tax: { collectedCents: number; payableCents: number; differenceCents: number };
    };

export type SalesSide = {
  taxCollected: string | number | null;
};

export type FilingSide = {
  amountPayable: string | number | null;
};

const cents = (value: string | number | null | undefined): number | null =>
  value === null || value === undefined || value === '' ? null : toCents(value);

/**
 * A cent of rounding is not a finding. Filings round to whole dollars, so
 * anything under a dollar is noise rather than a discrepancy worth a banner.
 */
const MATERIAL_CENTS = 100;

/**
 * Tax collected against tax paid, and nothing else.
 *
 * There used to be a sales comparison here too: what the POS sold against the
 * receipts the filing declared. It stopped meaning anything the moment the
 * filing stopped supplying sales figures — `taxable_sales` on the obligation is
 * now written by the POS report itself, so the comparison was the report
 * against its own net sales, and it reported a "difference" of exactly refunds
 * plus discounts on every month that had any. There is no second opinion on
 * sales to have, by design: the register is the only source.
 */
export function crossCheckSalesTax(sales: SalesSide | null, filing: FilingSide): CrossCheck {
  if (sales === null) return { kind: 'no_pair' };

  const collected = cents(sales.taxCollected);
  const payable = cents(filing.amountPayable);
  if (collected === null || payable === null) return { kind: 'no_pair' };
  if (Math.abs(collected - payable) < MATERIAL_CENTS) return { kind: 'ok' };

  return {
    kind: 'difference',
    tax: { collectedCents: collected, payableCents: payable, differenceCents: collected - payable },
  };
}
