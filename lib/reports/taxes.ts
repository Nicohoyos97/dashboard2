// Tax read model (INITIAL_PROMPT.md §7 Income Taxes / Sales Taxes). Every
// figure comes from a firm document or a firm entry and carries the status the
// firm gave it: nothing is final unless `firm_confirmed`. Amounts are summed
// only across rows that actually print the amount — a missing figure stays
// null rather than becoming a zero that reads as "nothing owed".
import { sumCents } from '@/lib/money';

import { daysBetween } from './dates';

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
 * What is still owed, and on which printed figure that rests. Worked out per
 * obligation and then summed, so a row that prints a payable and one that
 * prints only an estimate both count — summing one column across rows would
 * silently drop whichever rows do not print it. A row the firm marked `paid`
 * owes nothing whatever it still prints. The basis reported is the weakest one
 * any row relied on (estimated < confirmed < payable). Null when no row
 * supports a number.
 */
export type RemainingBasis = 'payable' | 'confirmed' | 'estimated';
export type Remaining = { cents: number; basis: RemainingBasis } | null;

const BASIS_RANK: Record<RemainingBasis, number> = { estimated: 0, confirmed: 1, payable: 2 };

function remainingFor(o: TaxObligation): { cents: number; basis: RemainingBasis } | null {
  if (o.status === 'paid') return { cents: 0, basis: o.payableCents !== null ? 'payable' : o.confirmedCents !== null ? 'confirmed' : 'estimated' };
  if (o.payableCents !== null) return { cents: o.payableCents, basis: 'payable' };
  const paid = o.paidCents ?? 0;
  if (o.confirmedCents !== null) return { cents: o.confirmedCents - paid, basis: 'confirmed' };
  if (o.estimatedCents !== null) return { cents: o.estimatedCents - paid, basis: 'estimated' };
  return null;
}

export function remainingOwed(obligations: readonly TaxObligation[]): Remaining {
  const parts = obligations.flatMap((o) => {
    const part = remainingFor(o);
    return part ? [part] : [];
  });
  if (parts.length === 0) return null;
  return {
    cents: sumCents(parts.map((part) => part.cents)),
    basis: parts.reduce<RemainingBasis>((weakest, part) => (BASIS_RANK[part.basis] < BASIS_RANK[weakest] ? part.basis : weakest), 'payable'),
  };
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

function owesMoney(o: TaxObligation): boolean {
  const remaining = remainingFor(o);
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
    // `extended` is a filing the authority has already granted more time for;
    // an unknown status is not evidence of a missing one. Only `not_filed`
    // past its date is a missing filing.
    const filed = obligation.filingStatus === 'filed' || obligation.filingStatus === 'amended' || obligation.filingStatus === 'extended';
    const unfiled = obligation.filingStatus === 'not_filed';

    if (overdue && owesMoney(obligation)) {
      alerts.push({ ...base, kind: 'past_due', tone: 'critical' });
      continue;
    }
    if (overdue && unfiled) {
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
    if (days !== null && days >= 0 && days <= SOON_DAYS) {
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

/**
 * The four money figures on the Sales Taxes cards.
 *
 * Collected, paid and taxable sales are historical totals: summing them across
 * every published filing is what they mean. "Payable" is not — it is a claim
 * about what the client owes right now, so it goes through `remainingOwed`,
 * which zeroes a filing the firm marked `paid`. Summing the payable column
 * instead printed the gross of every quarter ever filed as money still due.
 */
export function salesTaxCardFigures(obligations: readonly TaxObligation[]): {
  collectedCents: number | null;
  paidCents: number | null;
  payableCents: Remaining;
  taxableSalesCents: number | null;
} {
  return {
    collectedCents: sumField(obligations, (o) => o.collectedCents),
    paidCents: sumField(obligations, (o) => o.paidCents),
    payableCents: remainingOwed(obligations),
    taxableSalesCents: sumField(obligations, (o) => o.taxableSalesCents),
  };
}

/**
 * Whether an amount owed rests entirely on figures the firm stated, rather than
 * on an estimate. `remainingOwed` reports the weakest basis any row relied on,
 * so anything a badge or label says about the total has to be derived from that
 * — asking "is any row confirmed?" reports the strongest, and labels a total
 * that is part estimate as confirmed. Spec §7: nothing is final unless
 * firm_confirmed.
 */
export function isFirmStated(remaining: Remaining): boolean {
  return remaining !== null && remaining.basis !== 'estimated';
}

/**
 * One row per tax year: what was projected, what has been paid, and what is
 * still owed. The bars answer "did we set aside enough?", the line answers
 * "where does the liability stand?".
 *
 * `projected` prefers the confirmed figure over the estimate, per row, because
 * a year that has been confirmed should not keep charting its old estimate.
 * `remaining` reuses remainingOwed, so a settled year sits at zero rather than
 * re-printing what it once owed. A year that prints none of the three is left
 * out rather than drawn as a zero, which would read as "nothing owed".
 */
export type TaxYearPoint = {
  year: number;
  projectedCents: number | null;
  paidCents: number | null;
  remainingCents: number | null;
};

export function taxYearSeries(obligations: readonly TaxObligation[]): TaxYearPoint[] {
  const years = [...new Set(obligations.flatMap((o) => (o.taxYear === null ? [] : [o.taxYear])))].sort(
    (a, b) => a - b,
  );
  return years.flatMap((year) => {
    const rows = obligations.filter((o) => o.taxYear === year);
    const projectedCents = sumField(rows, (o) => o.confirmedCents ?? o.estimatedCents);
    const paidCents = sumField(rows, (o) => o.paidCents);
    const remaining = remainingOwed(rows);
    const remainingCents = remaining === null ? null : remaining.cents;
    if (projectedCents === null && paidCents === null && remainingCents === null) return [];
    return [{ year, projectedCents, paidCents, remainingCents }];
  });
}

/**
 * What was actually paid, one point per filing period, oldest first.
 *
 * Sales tax is filed per period rather than per year, so `taxYearSeries` has
 * nothing to say about it: a client filing monthly would see twelve months
 * collapsed into one column. Rows are grouped by the period they cover and
 * summed across jurisdictions — the same money, owed to two authorities for
 * one month, is one month's payment on this chart.
 *
 * A filing with no period is left out rather than guessed at from its due
 * date, which falls in the month *after* the one it settles. A period whose
 * filings print no payment stays on the axis with a null: the period was filed,
 * and drawing it at zero would say the client paid nothing when the record
 * simply does not state a payment.
 */
export type TaxPaidPoint = { periodStart: string; periodEnd: string; paidCents: number | null };

export function taxPaidSeries(obligations: readonly TaxObligation[], limit: number): TaxPaidPoint[] {
  const byPeriod = new Map<string, TaxObligation[]>();
  for (const obligation of obligations) {
    const { periodStart, periodEnd } = obligation;
    if (periodStart === null || periodEnd === null) continue;
    const key = `${periodStart}|${periodEnd}`;
    byPeriod.set(key, [...(byPeriod.get(key) ?? []), obligation]);
  }
  return [...byPeriod.entries()]
    .map(([key, rows]) => {
      const [periodStart = '', periodEnd = ''] = key.split('|');
      return { periodStart, periodEnd, paidCents: sumField(rows, (o) => o.paidCents) };
    })
    .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd) || a.periodStart.localeCompare(b.periodStart))
    .slice(-limit);
}
