// Tax read model (INITIAL_PROMPT.md §7 Income Taxes / Sales Taxes). Every
// figure comes from a firm document or a firm entry and carries the status the
// firm gave it: nothing is final unless `firm_confirmed`. Amounts are summed
// only across rows that actually print the amount — a missing figure stays
// null rather than becoming a zero that reads as "nothing owed".
import { sumCents } from '@/lib/money';

export const TAX_STATUSES = ['estimated', 'firm_confirmed', 'paid', 'payable', 'pending_review'] as const;
export type TaxStatus = (typeof TAX_STATUSES)[number];

export const FILING_STATUSES = ['not_filed', 'filed', 'extended', 'amended'] as const;
export type FilingStatus = (typeof FILING_STATUSES)[number];

export type TaxJurisdiction = {
  name: string;
  level: 'federal' | 'state' | 'local';
  code: string;
  filingFrequency: 'monthly' | 'quarterly' | 'annual' | null;
};

export type TaxPayment = {
  id: string;
  paidOn: string;
  amountCents: number;
  method: string | null;
  confirmationNumber: string | null;
  documentVersionId: string | null;
  pageNumber: number | null;
};

export type TaxObligation = {
  id: string;
  taxType: 'income' | 'sales' | 'payroll';
  taxYear: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  dueDate: string | null;
  filingStatus: FilingStatus | null;
  status: TaxStatus;
  estimatedCents: number | null;
  confirmedCents: number | null;
  paidCents: number | null;
  payableCents: number | null;
  taxableSalesCents: number | null;
  nonTaxableSalesCents: number | null;
  collectedCents: number | null;
  confirmationNumber: string | null;
  notes: string | null;
  source: 'firm_document' | 'firm_entry';
  documentVersionId: string | null;
  pageNumber: number | null;
  jurisdiction: TaxJurisdiction | null;
  payments: TaxPayment[];
};

/** Sum of the rows that print this figure; null when none of them do. */
export function sumField(obligations: readonly TaxObligation[], pick: (o: TaxObligation) => number | null): number | null {
  const values = obligations.flatMap((o) => {
    const value = pick(o);
    return value === null ? [] : [value];
  });
  return values.length === 0 ? null : sumCents(values);
}

/**
 * What is still owed, and on which printed figure that rests. A payable the
 * firm printed always wins; otherwise it is confirmed (or, failing that,
 * estimated) minus what has been paid. Null when nothing supports a number.
 */
export type Remaining = { cents: number; basis: 'payable' | 'confirmed' | 'estimated' } | null;

export function remainingOwed(obligations: readonly TaxObligation[]): Remaining {
  const payable = sumField(obligations, (o) => o.payableCents);
  if (payable !== null) return { cents: payable, basis: 'payable' };
  const paid = sumField(obligations, (o) => o.paidCents) ?? 0;
  const confirmed = sumField(obligations, (o) => o.confirmedCents);
  if (confirmed !== null) return { cents: confirmed - paid, basis: 'confirmed' };
  const estimated = sumField(obligations, (o) => o.estimatedCents);
  if (estimated !== null) return { cents: estimated - paid, basis: 'estimated' };
  return null;
}

/** The earliest due date not yet in the past, so the card points at what is next rather than what is over. */
export function nextDueDate(obligations: readonly TaxObligation[], today: string): string | null {
  return (
    obligations
      .flatMap((o) => (o.dueDate !== null && o.dueDate >= today ? [o.dueDate] : []))
      .sort((a, b) => a.localeCompare(b))[0] ?? null
  );
}

export const TAX_ALERT_KINDS = [
  'past_due',
  'missing_filing',
  'missing_payment_confirmation',
  'upcoming_payment',
  'upcoming_filing',
  'pending_review',
] as const;
export type TaxAlertKind = (typeof TAX_ALERT_KINDS)[number];

export type TaxAlert = {
  kind: TaxAlertKind;
  obligationId: string;
  scope: string;
  dueDate: string | null;
  tone: 'critical' | 'warning' | 'info';
};

const SOON_DAYS = 30;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function owesMoney(o: TaxObligation): boolean {
  const remaining = remainingOwed([o]);
  return remaining !== null && remaining.cents > 0;
}

/**
 * The deterministic alert set for a tax page (§7). One alert per obligation at
 * most, most severe first: a rule decides whether an alert exists, never a
 * model. `today` is passed in so the rules stay pure and testable.
 */
export function taxAlerts(obligations: readonly TaxObligation[], today: string): TaxAlert[] {
  const alerts: TaxAlert[] = [];
  for (const obligation of obligations) {
    const scope = obligation.jurisdiction?.name ?? (obligation.taxYear !== null ? String(obligation.taxYear) : '');
    const base = { obligationId: obligation.id, scope, dueDate: obligation.dueDate };
    const due = obligation.dueDate;
    const days = due === null ? null : daysBetween(today, due);
    const overdue = days !== null && days < 0;
    const filed = obligation.filingStatus === 'filed' || obligation.filingStatus === 'amended';

    if (overdue && (owesMoney(obligation) || !filed)) {
      alerts.push({ ...base, kind: 'past_due', tone: 'critical' });
      continue;
    }
    if (overdue && obligation.filingStatus === 'not_filed') {
      alerts.push({ ...base, kind: 'missing_filing', tone: 'critical' });
      continue;
    }
    if (obligation.status === 'pending_review') {
      alerts.push({ ...base, kind: 'pending_review', tone: 'info' });
      continue;
    }
    // A payment the firm recorded without a confirmation number cannot be
    // evidenced to the authority; flag it rather than treating it as settled.
    if (obligation.payments.some((payment) => payment.confirmationNumber === null)) {
      alerts.push({ ...base, kind: 'missing_payment_confirmation', tone: 'warning' });
      continue;
    }
    if (days !== null && days <= SOON_DAYS) {
      if (owesMoney(obligation)) alerts.push({ ...base, kind: 'upcoming_payment', tone: 'warning' });
      else if (!filed) alerts.push({ ...base, kind: 'upcoming_filing', tone: 'warning' });
    }
  }
  const order = new Map(TAX_ALERT_KINDS.map((kind, index) => [kind, index]));
  return alerts.sort((a, b) => {
    const rank = (order.get(a.kind) ?? 0) - (order.get(b.kind) ?? 0);
    if (rank !== 0) return rank;
    return (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
  });
}

export type SalesTaxPeriod = {
  label: string;
  collectedCents: number | null;
  paidCents: number | null;
  payableCents: number | null;
  taxableSalesCents: number | null;
  nonTaxableSalesCents: number | null;
};

/** Sales-tax filing periods oldest first, for the collections / payments charts. */
export function salesTaxSeries(obligations: readonly TaxObligation[], labelOf: (o: TaxObligation) => string): SalesTaxPeriod[] {
  return [...obligations]
    .filter((o) => o.periodStart !== null && o.periodEnd !== null)
    .sort((a, b) => (a.periodEnd ?? '').localeCompare(b.periodEnd ?? ''))
    .map((o) => ({
      label: labelOf(o),
      collectedCents: o.collectedCents,
      paidCents: o.paidCents,
      payableCents: o.payableCents,
      taxableSalesCents: o.taxableSalesCents,
      nonTaxableSalesCents: o.nonTaxableSalesCents,
    }));
}
