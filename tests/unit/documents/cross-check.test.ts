// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { crossCheckSalesTax } from '@/lib/documents/cross-check';
import { SalesReportSchema } from '@/lib/ingestion/schemas/sales-report';
import { reconcileSalesReport } from '@/lib/ingestion/reconcile';

// Real figures, from the two July 2026 documents this feature was built for:
// a Clover sales report and the Illinois ST-1 filed for the same month. Using
// the real pair is the point — invented numbers would have balanced.
const CLOVER = {
  source_system: 'clover',
  period_start: '2026-07-01',
  period_end: '2026-07-31',
  currency: 'USD',
  gross_sales: '14119.36',
  net_sales: '14073.36',
  refunds: '46.00',
  tips: '1298.83',
  tax_collected: '1504.59',
  tax_expected: '1513.50',
  amount_collected: '16885.69',
  order_count: 540,
  tenders: [
    { label: 'Credit and debit cards', amount: '12955.46' },
    { label: 'Cash', amount: '3629.51' },
    { label: 'DOORDASH', amount: '113.25' },
    { label: 'Uber Eats', amount: '95.81' },
    { label: 'Grubhub', amount: '91.66' },
  ],
  page: 1,
  confidence: 0.97,
};

describe('a real Clover sales report', () => {
  it('is expressible by the schema exactly as printed', () => {
    const parsed = SalesReportSchema.safeParse(CLOVER);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it('reconciles against itself', () => {
    const report = SalesReportSchema.parse(CLOVER);
    const result = reconcileSalesReport(report, report.tenders ?? []);
    // 14,119.36 − 46.00 = 14,073.36, and the five tender lines add to
    // 16,885.69. Both hold on the real document.
    expect(result.passed).toBe(true);
    expect(result.checks.map((c) => c.key).sort()).toEqual(['amount_collected', 'net_sales']);
  });
});

describe('the sales report against the filing', () => {
  it('reports the July gap that started all of this', () => {
    // The ST-1 filed $12,955.00 of receipts and paid $1,328.00. The POS says
    // $14,119.36 was sold and $1,504.59 collected. The filed receipts match one
    // tender line — cards, $12,955.46 — with the cash left out.
    const result = crossCheckSalesTax(
      { grossSales: '14119.36', netSales: '14073.36', taxCollected: '1504.59' },
      { taxableSales: '12955.00', amountPayable: '1328.00' },
    );
    expect(result.kind).toBe('difference');
    if (result.kind !== 'difference') return;
    expect(result.sales?.differenceCents).toBe(116436);
    expect(result.tax?.differenceCents).toBe(17659);
  });

  it('says nothing when the two agree', () => {
    expect(
      crossCheckSalesTax(
        { grossSales: '14119.36', netSales: null, taxCollected: '1328.00' },
        { taxableSales: '14119.36', amountPayable: '1328.00' },
      ).kind,
    ).toBe('ok');
  });

  it('ignores sub-dollar rounding, because filings round to whole dollars', () => {
    expect(
      crossCheckSalesTax(
        { grossSales: '12955.46', netSales: null, taxCollected: null },
        { taxableSales: '12955.00', amountPayable: '1328.00' },
      ).kind,
    ).toBe('ok');
  });

  it('has nothing to say without a sales report for the period', () => {
    expect(crossCheckSalesTax(null, { taxableSales: '12955.00', amountPayable: '1328.00' }).kind).toBe('no_pair');
  });
});
