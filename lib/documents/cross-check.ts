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
      /** Present only when both sides printed the figure. */
      sales?: { soldCents: number; filedCents: number; differenceCents: number };
      tax?: { collectedCents: number; payableCents: number; differenceCents: number };
    };

export type SalesSide = {
  netSales: string | number | null;
  grossSales: string | number | null;
  taxCollected: string | number | null;
};

export type FilingSide = {
  taxableSales: string | number | null;
  amountPayable: string | number | null;
};

const cents = (value: string | number | null | undefined): number | null =>
  value === null || value === undefined || value === '' ? null : toCents(value);

/**
 * A cent of rounding is not a finding. Filings round to whole dollars, so
 * anything under a dollar is noise rather than a discrepancy worth a banner.
 */
const MATERIAL_CENTS = 100;

export function crossCheckSalesTax(sales: SalesSide | null, filing: FilingSide): CrossCheck {
  if (sales === null) return { kind: 'no_pair' };

  const sold = cents(sales.grossSales) ?? cents(sales.netSales);
  const filed = cents(filing.taxableSales);
  const collected = cents(sales.taxCollected);
  const payable = cents(filing.amountPayable);

  const result: Extract<CrossCheck, { kind: 'difference' }> = { kind: 'difference' };
  if (sold !== null && filed !== null && Math.abs(sold - filed) >= MATERIAL_CENTS) {
    result.sales = { soldCents: sold, filedCents: filed, differenceCents: sold - filed };
  }
  if (collected !== null && payable !== null && Math.abs(collected - payable) >= MATERIAL_CENTS) {
    result.tax = { collectedCents: collected, payableCents: payable, differenceCents: collected - payable };
  }
  return result.sales || result.tax ? result : { kind: 'ok' };
}
