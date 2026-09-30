// Which side of a tax obligation a document speaks for.
//
// Decided by the type the firm chose at upload, never by what the model read:
// a sales-tax return (Illinois ST-1 and its peers) prints a Confirmation Number
// and a Date Submitted, which read like a payment and are not one. When the
// model was left to decide, a return and the payment confirmation for the same
// month both wrote the whole obligation, and whichever processed last claimed
// it — the return then read "nothing was extracted" and could not be
// published, and the confirmation had written its blanks over the amount owed
// and the due date.
import type { TaxStatus } from './schemas/tax-record';

/**
 * `filing` — the return: what is owed, for which period, due when. It owns the
 *   obligation's provenance pointer and never records a payment.
 * `payment` — the confirmation that money left: a `tax_payments` row and the
 *   obligation marked paid, and nothing the return owns.
 * `any` — a type that does not say which side (income-tax documents); kept as
 *   it was, writing whatever the document prints.
 */
export type TaxDocumentRole = 'filing' | 'payment' | 'any';

export function taxDocumentRole(documentType: string): TaxDocumentRole {
  if (documentType === 'sales_tax_filing') return 'filing';
  if (documentType === 'sales_tax_payment') return 'payment';
  return 'any';
}

/**
 * A return never says paid. Submitting it is not paying it, and the status that
 * says settled comes from a payment — a confirmation or one the firm records.
 */
export function filingStatus(extracted: TaxStatus): TaxStatus {
  return extracted === 'paid' ? 'payable' : extracted;
}
