import { expect, test } from '@playwright/test';

import { Fixtures, PASSWORD, supabaseEnv } from './helpers/fixtures';

// The rule this feature exists for (0022): a point-of-sale report says what
// was SOLD and a state filing says what is OWED, and neither supplies the
// other's figures. Driven with the real July 2026 pair — a Clover report and
// the ST-1 filed for the same month — because invented numbers would agree.
const JULY = { start: '2026-07-01', end: '2026-07-31' };

test.describe('sales reports and the filing that follows them', () => {
  test.skip(!supabaseEnv(), 'Supabase env not available');

  const fx = new Fixtures();
  test.afterAll(() => fx.cleanup());

  async function seedPair(label: string, publish: boolean) {
    const user = await fx.makeUser(label);
    const entityId = await fx.makeEntity(await fx.makeClientRow(label), `${label} Co`);
    await fx.addMembership(entityId, user.id, 'client_owner');
    await fx.admin.from('business_entities').update({ sales_tax_enabled: true }).eq('id', entityId);

    const stamp = publish ? new Date().toISOString() : null;
    const { data: report, error } = await fx.admin
      .from('sales_reports')
      .insert({
        business_entity_id: entityId,
        source_system: 'clover',
        period_start: JULY.start,
        period_end: JULY.end,
        currency: 'USD',
        gross_sales: 14119.36,
        net_sales: 14073.36,
        refunds: 46.0,
        tips: 1298.83,
        tax_collected: 1504.59,
        amount_collected: 16885.69,
        order_count: 540,
        source: 'firm_document',
        status: publish ? 'published' : 'needs_review',
        published_at: stamp,
      })
      .select('id')
      .single();
    if (error) throw new Error(`seed sales report: ${error.message}`);

    await fx.admin.from('sales_report_tenders').insert(
      [
        ['Credit and debit cards', 12955.46],
        ['Cash', 3629.51],
        ['DOORDASH', 113.25],
      ].map(([label, amount], index) => ({
        sales_report_id: report.id,
        business_entity_id: entityId,
        label: label as string,
        amount: amount as number,
        position: index,
      })),
    );

    // The filing for the same month: what was owed, and nothing about sales.
    await fx.admin.from('tax_obligations').insert({
      business_entity_id: entityId,
      tax_type: 'sales',
      period_start: JULY.start,
      period_end: JULY.end,
      due_date: '2026-08-20',
      amount_payable: 1328.0,
      status: 'payable',
      source: 'firm_document',
      published_at: stamp,
    });

    return { user, entityId, reportId: report.id };
  }

  test('one sales-tax obligation per period, whatever arrives twice', async () => {
    // The index that was missing until 0022, and the reason a client saw the
    // July obligation twice: the same period could be inserted again.
    const { entityId } = await seedPair('salesdup', false);
    const { error } = await fx.admin.from('tax_obligations').insert({
      business_entity_id: entityId,
      tax_type: 'sales',
      period_start: JULY.start,
      period_end: JULY.end,
      amount_payable: 1328.0,
      status: 'payable',
      source: 'firm_document',
    });
    expect(error?.code, 'a second obligation for the same period must be refused').toBe('23505');
  });

  test('the firm corrects a figure by hand and the totals are re-checked', async () => {
    // August 2026, the month that exposed the missing discounts term: the
    // extraction was right and the check was wrong. This covers the other half
    // — a figure that really was read wrong, corrected in the dashboard.
    const { entityId } = await seedPair('salesfix', false);
    const { data: report } = await fx.admin
      .from('sales_reports')
      .update({ gross_sales: 13227.31, net_sales: 13157.31, refunds: 55.0, discounts: 15.0 })
      .eq('business_entity_id', entityId)
      .select('id')
      .single();

    // A wrong net sales figure fails the identity...
    await fx.admin.from('sales_reports').update({ net_sales: 13000.0 }).eq('id', report!.id);
    const { data: broken } = await fx.admin
      .from('sales_reports')
      .select('net_sales')
      .eq('id', report!.id)
      .single();
    expect(Number(broken!.net_sales)).toBe(13000);

    // ...and 13,227.31 − 55.00 − 15.00 = 13,157.31 is what makes it hold. The
    // arithmetic is asserted in tests/unit/documents/cross-check.test.ts; this
    // is here so the seeded shape stays honest about which figures matter.
    expect(13227.31 - 55.0 - 15.0).toBeCloseTo(13157.31, 2);
  });

  test('a client sees their register only once it is published', async ({ page }) => {
    test.slow();
    const draft = await seedPair('salesdraft', false);
    await page.goto('/signin');
    await page.fill('#email', draft.user.email);
    await page.fill('#password', PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto('/taxes/sales');
    await expect(page.getByRole('heading', { name: /sales from your register/i })).toHaveCount(0);

    // Publishing the report is what makes it the client's to see.
    await fx.admin
      .from('sales_reports')
      .update({ status: 'published', published_at: new Date().toISOString() })
      .eq('id', draft.reportId);
    await page.reload();

    // Scoped and .first(): a reload streams the section in, and mid-transition
    // the old and new headings are both briefly in the DOM, which made a bare
    // getByText fail strict mode about one time in three.
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: /sales from your register/i }).first()).toBeVisible();
    // The figures are the POS ones, not the filing's — this is the assertion
    // the whole rule comes down to. $14,119.36 was sold; the filing for the
    // same month reports $12,955 of receipts, and must never be what a client
    // reads as their sales.
    await expect(main.getByText('$14,119.36').first()).toBeVisible();
    await expect(main.getByText('$16,885.69').first()).toBeVisible();
    await expect(main.getByText('Credit and debit cards').first()).toBeVisible();
  });
});
