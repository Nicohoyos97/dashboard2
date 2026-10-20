// Whether a document's figures are on a different accounting method than the
// business keeps its books on. QuickBooks runs a report on whichever method is
// selected at the moment, so a month exported on accrual for a cash client
// reaches the review queue looking like any other — and once published, the
// client reads accrual figures labelled accrual on a portal that otherwise
// speaks cash (Que la creo Burger's September, 2026-10-19). It is a warning,
// not a blocker: a firm can have a reason to publish on the other method, and
// the publish bar's own checks already keep a ledger on the same method as its
// statement.
export type Basis = 'cash' | 'accrual';

/**
 * The method the document is on when it is not the business's, or null when
 * they agree or the document prints none (a statement without a printed
 * method is read on the business's, so it cannot disagree).
 */
export function basisMismatch(business: string | null, documentBases: readonly (string | null)[]): Basis | null {
  if (business !== 'cash' && business !== 'accrual') return null;
  const other = documentBases.find((basis): basis is Basis => (basis === 'cash' || basis === 'accrual') && basis !== business);
  return other ?? null;
}
