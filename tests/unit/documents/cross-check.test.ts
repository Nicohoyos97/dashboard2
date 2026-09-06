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

  it('counts discounts as the third term of net sales', () => {
    // August 2026, the month that caught this: gross 13,227.31 − refunds 55.00
    // − discounts 15.00 = net 13,157.31. Without the discounts the check was
    // off by exactly $15 and blocked a report whose extraction was correct.
    const august = SalesReportSchema.parse({
      ...CLOVER,
      period_start: '2026-08-01',
      period_end: '2026-08-31',
      gross_sales: '13227.31',
      net_sales: '13157.31',
      refunds: '55.00',
      discounts: '15.00',
      amount_collected: '15881.93',
      tenders: [{ label: 'Credit and debit cards', amount: '15881.93' }],
    });
    const result = reconcileSalesReport(august, august.tenders ?? []);
    expect(result.checks.find((c) => c.key === 'net_sales')?.ok).toBe(true);
    expect(result.passed).toBe(true);
  });

  it('still fails when the figures genuinely disagree', () => {
    const wrong = SalesReportSchema.parse({ ...CLOVER, net_sales: '13000.00' });
    expect(reconcileSalesReport(wrong, wrong.tenders ?? []).passed).toBe(false);
  });
});

describe('the sales report against the filing', () => {
  it('reports the July gap between tax collected and tax paid', () => {
    // The POS collected $1,504.59 of sales tax in July; the ST-1 paid
    // $1,328.00. That gap is the firm's to explain — marketplace facilitators
    // remit their own, some sales are exempt, timing differs — so it is stated
    // and not blocked.
    const result = crossCheckSalesTax({ taxCollected: '1504.59' }, { amountPayable: '1328.00' });
    expect(result.kind).toBe('difference');
    if (result.kind !== 'difference') return;
    expect(result.tax.differenceCents).toBe(17659);
  });

  it('no longer compares sales, because there is no second opinion on them', () => {
    // It used to compare what the POS sold against the receipts the filing
    // declared. Once the filing stopped supplying sales figures, the
    // obligation's taxable_sales came from the POS report itself — so the
    // check compared a report to its own net sales and reported a difference
    // of exactly refunds plus discounts every month that had any. August:
    // gross 13,227.31, net 13,157.31, and a "$70.00 discrepancy" that was
    // simply $55 of refunds and $15 of discounts.
    expect(crossCheckSalesTax({ taxCollected: '1401.07' }, { amountPayable: '1401.07' }).kind).toBe('ok');
  });

  it('says nothing when the two agree', () => {
    expect(crossCheckSalesTax({ taxCollected: '1328.00' }, { amountPayable: '1328.00' }).kind).toBe('ok');
  });

  it('ignores sub-dollar rounding, because filings round to whole dollars', () => {
    expect(crossCheckSalesTax({ taxCollected: '1328.46' }, { amountPayable: '1328.00' }).kind).toBe('ok');
  });

  it('has nothing to say without both sides', () => {
    expect(crossCheckSalesTax(null, { amountPayable: '1328.00' }).kind).toBe('no_pair');
    // A period the firm has not filed yet is not a discrepancy.
    expect(crossCheckSalesTax({ taxCollected: '1401.07' }, { amountPayable: null }).kind).toBe('no_pair');
  });
});
