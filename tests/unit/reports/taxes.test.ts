// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  type TaxObligation,
  isFirmStated,
  nextDueDate,
  remainingOwed,
  salesTaxCardFigures,
  taxYearSeries,
  sumField,
  taxAlerts,
} from '@/lib/reports/taxes';

const TODAY = '2026-09-03';

function obligation(overrides: Partial<TaxObligation> & { id: string }): TaxObligation {
  return {
    taxType: 'sales',
    taxYear: 2026,
    periodStart: '2026-04-01',
    periodEnd: '2026-06-30',
    dueDate: '2026-07-20',
    filingStatus: 'filed',
    status: 'firm_confirmed',
    estimatedCents: null,
    confirmedCents: null,
    paidCents: null,
    payableCents: null,
    taxableSalesCents: null,
    nonTaxableSalesCents: null,
    collectedCents: null,
    confirmationNumber: null,
    notes: null,
    source: 'firm_document',
    documentVersionId: null,
    pageNumber: null,
    jurisdiction: { name: 'Florida DOR', level: 'state', code: 'US-FL', filingFrequency: 'quarterly' },
    payments: [],
    ...overrides,
  };
}

describe('tax totals', () => {
  it('sums only the rows that print a figure and stays null when none do', () => {
    const rows = [
      obligation({ id: 'a', collectedCents: 100_00 }),
      obligation({ id: 'b', collectedCents: 250_00 }),
      obligation({ id: 'c' }),
    ];
    expect(sumField(rows, (o) => o.collectedCents)).toBe(350_00);
    expect(sumField(rows, (o) => o.payableCents)).toBeNull();
    expect(sumField([], (o) => o.collectedCents)).toBeNull();
  });

  it('prefers a printed payable, then confirmed, then estimated — and says which it used', () => {
    expect(remainingOwed([obligation({ id: 'a', payableCents: 40_00, confirmedCents: 90_00, paidCents: 50_00 })])).toEqual({ cents: 40_00, basis: 'payable' });
    expect(remainingOwed([obligation({ id: 'a', confirmedCents: 90_00, paidCents: 50_00 })])).toEqual({ cents: 40_00, basis: 'confirmed' });
    expect(remainingOwed([obligation({ id: 'a', estimatedCents: 90_00 })])).toEqual({ cents: 90_00, basis: 'estimated' });
    expect(remainingOwed([obligation({ id: 'a' })])).toBeNull();
  });

  it('works each obligation out on its own figures and then sums, reporting the weakest basis', () => {
    // Federal prints a payable; State prints only a confirmed amount. Summing the
    // payable column alone would have dropped the state's $500 entirely.
    const rows = [
      obligation({ id: 'federal', payableCents: 1_000_00 }),
      obligation({ id: 'state', confirmedCents: 500_00 }),
    ];
    expect(remainingOwed(rows)).toEqual({ cents: 1_500_00, basis: 'confirmed' });
  });

  it('treats a row the firm marked paid as settled whatever it still prints', () => {
    const settled = obligation({ id: 'a', status: 'paid', payableCents: 1_000_00 });
    expect(remainingOwed([settled])).toEqual({ cents: 0, basis: 'payable' });
    expect(taxAlerts([{ ...settled, dueDate: '2026-09-20' }], TODAY)).toEqual([]);
  });

  it('points at the next due date, ignoring dates already past', () => {
    const rows = [
      obligation({ id: 'a', dueDate: '2026-07-20' }),
      obligation({ id: 'b', dueDate: '2026-10-20' }),
      obligation({ id: 'c', dueDate: '2026-12-20' }),
    ];
    expect(nextDueDate(rows, TODAY)).toBe('2026-10-20');
    expect(nextDueDate([obligation({ id: 'a', dueDate: '2020-01-01' })], TODAY)).toBeNull();
    expect(nextDueDate([obligation({ id: 'a', dueDate: null })], TODAY)).toBeNull();
  });
});

describe('tax alerts', () => {
  it('raises past due when money is still owed, and missing filing when only the filing is late', () => {
    const owing = obligation({ id: 'a', dueDate: '2026-08-01', payableCents: 500_00 });
    expect(taxAlerts([owing], TODAY).map((alert) => alert.kind)).toEqual(['past_due']);

    const settled = obligation({ id: 'b', dueDate: '2026-08-01', payableCents: 0, filingStatus: 'filed' });
    expect(taxAlerts([settled], TODAY)).toEqual([]);

    const unfiled = obligation({ id: 'c', dueDate: '2026-08-01', payableCents: 0, filingStatus: 'not_filed' });
    expect(taxAlerts([unfiled], TODAY).map((alert) => alert.kind)).toEqual(['missing_filing']);

    // An extension is not a missing filing, and an unknown status is not evidence of one.
    const extended = obligation({ id: 'd', dueDate: '2026-08-01', payableCents: 0, filingStatus: 'extended' });
    const unknown = obligation({ id: 'e', dueDate: '2026-08-01', payableCents: 0, filingStatus: null });
    expect(taxAlerts([extended, unknown], TODAY)).toEqual([]);
  });

  it('flags a recorded payment that carries no confirmation number', () => {
    const row = obligation({
      id: 'a',
      dueDate: '2026-12-20',
      payments: [{ id: 'p1', paidOn: '2026-07-18', amountCents: 500_00, method: 'ACH', confirmationNumber: null, documentVersionId: null, pageNumber: null }],
    });
    expect(taxAlerts([row], TODAY).map((alert) => alert.kind)).toEqual(['missing_payment_confirmation']);
  });

  it('warns about a payment due within thirty days and a filing not yet made', () => {
    const payment = obligation({ id: 'a', dueDate: '2026-09-20', payableCents: 300_00 });
    expect(taxAlerts([payment], TODAY).map((alert) => alert.kind)).toEqual(['upcoming_payment']);

    const filing = obligation({ id: 'b', dueDate: '2026-09-20', filingStatus: 'not_filed', payableCents: 0 });
    expect(taxAlerts([filing], TODAY).map((alert) => alert.kind)).toEqual(['upcoming_filing']);

    const distant = obligation({ id: 'c', dueDate: '2026-12-20', payableCents: 300_00 });
    expect(taxAlerts([distant], TODAY)).toEqual([]);
  });

  it('surfaces a pending-review row and orders the most severe alert first', () => {
    const rows = [
      obligation({ id: 'soon', dueDate: '2026-09-20', payableCents: 300_00 }),
      obligation({ id: 'review', dueDate: '2026-11-20', status: 'pending_review' }),
      obligation({ id: 'late', dueDate: '2026-06-20', payableCents: 100_00 }),
    ];
    expect(taxAlerts(rows, TODAY).map((alert) => [alert.obligationId, alert.kind])).toEqual([
      ['late', 'past_due'],
      ['soon', 'upcoming_payment'],
      ['review', 'pending_review'],
    ]);
  });
});

describe('sales tax card figures', () => {
  // Eight quarterly Florida filings, every one of them settled: the client
  // owes nothing. The page used to sum the payable column straight across
  // every published row, so it printed the gross of eight quarters as money
  // still due.
  const settledQuarters = Array.from({ length: 8 }, (_, i) =>
    obligation({
      id: `q${i}`,
      status: 'paid',
      collectedCents: 9_150_00,
      paidCents: 9_150_00,
      payableCents: 9_150_00,
      taxableSalesCents: 130_714_00,
    }),
  );

  it('reports nothing still owed once every filing is settled', () => {
    const cards = salesTaxCardFigures(settledQuarters);
    expect(cards.payableCents).toEqual({ cents: 0, basis: 'payable' });
  });

  it('reports what is still owed when one quarter is not settled', () => {
    const open = obligation({ id: 'open', status: 'payable', payableCents: 2_400_00 });
    expect(salesTaxCardFigures([...settledQuarters, open]).payableCents).toEqual({
      cents: 2_400_00,
      basis: 'payable',
    });
  });

  it('still reports collected, paid and taxable sales cumulatively', () => {
    // Those three are historical totals of what was filed; only "payable" is a
    // statement about the present.
    const cards = salesTaxCardFigures(settledQuarters);
    expect(cards.collectedCents).toBe(73_200_00);
    expect(cards.paidCents).toBe(73_200_00);
    expect(cards.taxableSalesCents).toBe(1_045_712_00);
  });

  it('leaves a figure null when no row prints it', () => {
    const cards = salesTaxCardFigures([obligation({ id: 'a' })]);
    expect(cards.collectedCents).toBeNull();
    expect(cards.payableCents).toBeNull();
  });
});

describe('is the amount owed firm-stated?', () => {
  // The badge sits directly above the figure remainingOwed() produced, so it
  // has to report the same basis. It used to ask "is ANY row confirmed?",
  // which is the strongest basis, while the figure below it reports the
  // weakest — a total straddling a confirmed federal amount and an estimated
  // state one was labelled "Confirmed by your accountant".
  it('is not firm-stated when any part of the total rests on an estimate', () => {
    const rows = [
      obligation({ id: 'federal', status: 'firm_confirmed', confirmedCents: 12_000_00 }),
      obligation({ id: 'state', status: 'estimated', estimatedCents: 3_500_00 }),
    ];
    const remaining = remainingOwed(rows);
    expect(remaining).toEqual({ cents: 15_500_00, basis: 'estimated' });
    expect(isFirmStated(remaining)).toBe(false);
  });

  it('is firm-stated when every part is confirmed or payable', () => {
    expect(isFirmStated({ cents: 100, basis: 'confirmed' })).toBe(true);
    expect(isFirmStated({ cents: 100, basis: 'payable' })).toBe(true);
  });

  it('is not firm-stated when nothing prints an amount', () => {
    expect(isFirmStated(null)).toBe(false);
  });
});

describe('taxYearSeries', () => {
  it('charts projected against paid, and the liability that is left', () => {
    const rows = [
      obligation({ id: '25', taxYear: 2025, status: 'paid', confirmedCents: 18_000_00, paidCents: 18_000_00 }),
      obligation({ id: '26f', taxYear: 2026, status: 'firm_confirmed', confirmedCents: 12_000_00, paidCents: 4_000_00 }),
      obligation({ id: '26s', taxYear: 2026, status: 'estimated', estimatedCents: 3_500_00 }),
    ];
    expect(taxYearSeries(rows)).toEqual([
      // A settled year owes nothing, whatever it still prints.
      { year: 2025, projectedCents: 18_000_00, paidCents: 18_000_00, remainingCents: 0 },
      { year: 2026, projectedCents: 15_500_00, paidCents: 4_000_00, remainingCents: 11_500_00 },
    ]);
  });

  it('prefers a confirmed figure over the estimate it replaced', () => {
    const rows = [obligation({ id: 'a', taxYear: 2026, confirmedCents: 9_000_00, estimatedCents: 7_000_00 })];
    expect(taxYearSeries(rows)[0]?.projectedCents).toBe(9_000_00);
  });

  it('drops a year that prints nothing rather than drawing it at zero', () => {
    // A zero bar reads as "nothing owed"; a missing figure is not a zero.
    const rows = [obligation({ id: 'empty', taxYear: 2024 }), obligation({ id: 'real', taxYear: 2025, estimatedCents: 100 })];
    expect(taxYearSeries(rows).map((p) => p.year)).toEqual([2025]);
  });

  it('ignores a record the firm entered without a tax year', () => {
    expect(taxYearSeries([obligation({ id: 'x', taxYear: null, estimatedCents: 500 })])).toEqual([]);
  });

  it('runs oldest first, so the line reads left to right', () => {
    const rows = [
      obligation({ id: 'b', taxYear: 2026, estimatedCents: 1 }),
      obligation({ id: 'a', taxYear: 2024, estimatedCents: 1 }),
    ];
    expect(taxYearSeries(rows).map((p) => p.year)).toEqual([2024, 2026]);
  });
});
