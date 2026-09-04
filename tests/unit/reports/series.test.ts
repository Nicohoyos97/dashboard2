// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { comparableSeries } from '@/lib/reports/series';

type R = {
  id: string;
  reportType: 'profit_and_loss' | 'balance_sheet';
  currency: string;
  periodStart: string;
  periodEnd: string;
};

const report = (over: Partial<R> & { id: string }): R => ({
  reportType: 'profit_and_loss',
  currency: 'USD',
  periodStart: '2026-01-01',
  periodEnd: '2026-01-31',
  ...over,
});

describe('comparableSeries', () => {
  const jan = report({ id: 'jan' });
  const feb = report({ id: 'feb', periodStart: '2026-02-01', periodEnd: '2026-02-28' });
  const mar = report({ id: 'mar', periodStart: '2026-03-01', periodEnd: '2026-03-31' });
  const fy2025 = report({ id: 'fy2025', periodStart: '2025-01-01', periodEnd: '2025-12-31' });

  it('keeps only periods of the same length as the reference', () => {
    // A trend that puts a $2.4M annual bar beside six ~$200K monthly ones reads
    // as a 92% collapse; the shape is the message, so the granularity has to
    // hold across every bar.
    expect(comparableSeries([mar, feb, jan, fy2025], mar).map((r) => r.id)).toEqual(['mar', 'feb', 'jan']);
  });

  it('keeps only the reference currency', () => {
    const cad = report({ id: 'cad', currency: 'CAD', periodStart: '2026-02-01', periodEnd: '2026-02-28' });
    expect(comparableSeries([mar, cad, jan], mar).map((r) => r.id)).toEqual(['mar', 'jan']);
  });

  it('keeps only the same statement type', () => {
    const bs = report({ id: 'bs', reportType: 'balance_sheet', periodStart: '2026-02-01', periodEnd: '2026-02-28' });
    expect(comparableSeries([mar, bs, jan], mar).map((r) => r.id)).toEqual(['mar', 'jan']);
  });

  it('never reaches past the reference period', () => {
    const apr = report({ id: 'apr', periodStart: '2026-04-01', periodEnd: '2026-04-30' });
    expect(comparableSeries([apr, mar, feb], mar).map((r) => r.id)).toEqual(['mar', 'feb']);
  });

  it('includes the reference itself', () => {
    expect(comparableSeries([jan], jan).map((r) => r.id)).toEqual(['jan']);
  });
});
