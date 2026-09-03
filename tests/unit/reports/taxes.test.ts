// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  type TaxObligation,
  nextDueDate,
  remainingOwed,
  salesTaxSeries,
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
  it('raises past due only when money is still owed or the filing is missing', () => {
    const owing = obligation({ id: 'a', dueDate: '2026-08-01', payableCents: 500_00 });
    expect(taxAlerts([owing], TODAY).map((alert) => alert.kind)).toEqual(['past_due']);

    const settled = obligation({ id: 'b', dueDate: '2026-08-01', payableCents: 0, filingStatus: 'filed' });
    expect(taxAlerts([settled], TODAY)).toEqual([]);
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

describe('sales tax series', () => {
  it('orders filing periods oldest first and drops rows with no period', () => {
    const rows = [
      obligation({ id: 'q2', periodStart: '2026-04-01', periodEnd: '2026-06-30', collectedCents: 200_00 }),
      obligation({ id: 'q1', periodStart: '2026-01-01', periodEnd: '2026-03-31', collectedCents: 100_00 }),
      obligation({ id: 'none', periodStart: null, periodEnd: null }),
    ];
    expect(salesTaxSeries(rows, (o) => o.id).map((point) => [point.label, point.collectedCents])).toEqual([
      ['q1', 100_00],
      ['q2', 200_00],
    ]);
  });
});
