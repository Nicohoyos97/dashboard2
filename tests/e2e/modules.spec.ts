import { expect, test } from '@playwright/test';

import { Fixtures, PASSWORD, supabaseEnv } from './helpers/fixtures';
import { seedPublishedStatement } from './helpers/seed-statements';

// What the firm sold is what the client sees (§5, §8). Until 0018 the portal
// read only sales_tax_enabled, so the Expenses and Income Taxes switches in
// /admin were recorded and then ignored — the nav showed every page whatever
// the firm had configured. These drive it through the browser, because a route
// that still answers is a way around the sale even when the link is gone.
// 0019 collapsed `statements` + `expenses` into one `bookkeeping` key.
test.describe('the portal shows the modules the firm sold', () => {
  test.skip(!supabaseEnv(), 'Supabase env not available');

  const fx = new Fixtures();
  test.afterAll(() => fx.cleanup());

  async function clientOn(
    label: string,
    modules: { bookkeeping: boolean; income_taxes: boolean },
    salesTax: boolean,
  ) {
    const user = await fx.makeUser(label);
    const entityId = await fx.makeEntity(await fx.makeClientRow(label), `${label} Co`);
    const { error } = await fx.admin
      .from('business_entities')
      .update({ enabled_modules: modules, sales_tax_enabled: salesTax })
      .eq('id', entityId);
    if (error) throw new Error(`configure: ${error.message}`);
    await fx.addMembership(entityId, user.id, 'client_owner');
    // Every client here gets a published P&L, so "the Overview shows no
    // statement cards" means the module hid them — not that there was nothing
    // to show. The report id is what the export specs need.
    const { reportId } = await seedPublishedStatement(fx, entityId, 'letter-and-pnl', { uploaded: [] });
    return { user, entityId, reportId };
  }

  async function signIn(page: import('@playwright/test').Page, email: string) {
    await page.goto('/signin');
    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  }

  // The two figures a sales-tax-only client's Overview is built from: what the
  // register rang up, and what was paid on it. Written straight to the tables
  // because the point is the portal's reading of them, not the pipeline.
  async function seedSalesAndFilings(entityId: string) {
    const published = new Date().toISOString();
    const months = [
      { start: '2026-06-01', end: '2026-06-30', net: 54210, tax: 4607.85 },
      { start: '2026-07-01', end: '2026-07-31', net: 56990.35, tax: 4844.18 },
    ];
    for (const month of months) {
      const { error } = await fx.admin.from('sales_reports').insert({
        business_entity_id: entityId, source_system: 'clover', period_start: month.start,
        period_end: month.end, currency: 'USD', net_sales: month.net, tax_collected: month.tax,
        source: 'firm_document', status: 'published', published_at: published,
      });
      if (error) throw new Error(`insert sales report: ${error.message}`);
      const { error: filingError } = await fx.admin.from('tax_obligations').insert({
        business_entity_id: entityId, tax_type: 'sales', period_start: month.start,
        period_end: month.end, due_date: '2026-08-20', filing_status: 'filed',
        amount_payable: month.tax, amount_paid: month.tax, status: 'paid',
        source: 'firm_document', published_at: published,
      });
      if (filingError) throw new Error(`insert obligation: ${filingError.message}`);
    }
  }

  test('a sales-tax-only client gets Sales Taxes and Nick, and nothing else', async ({ page }) => {
    // Visits four routes this run has not compiled yet; each first request
    // costs seconds on the dev server, which is real work rather than waiting.
    test.slow();
    const { user, entityId } = await clientOn('salesonly', { bookkeeping: false, income_taxes: false }, true);
    await seedSalesAndFilings(entityId);
    await signIn(page, user.email);

    const nav = page.getByRole('complementary', { name: /navigation/i });
    await expect(nav.getByRole('link', { name: 'Sales', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: /ask nick/i })).toBeVisible();
    await expect(nav.getByRole('link', { name: /expenses/i })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: /income taxes/i })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: /financial statements/i })).toHaveCount(0);

    // The Overview is the home of every package, so it stays — but its cards
    // are module-scoped too. This is the half the nav check misses: the page
    // kept rendering Profit & Loss KPIs for a client with no Profit & Loss.
    const main = page.getByRole('main');
    await expect(main.getByText(/reminders & obligations/i)).toBeVisible();
    // And in their place, the two this client's engagement is made of.
    await expect(main.getByRole('heading', { name: 'Net sales' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Sales tax paid' })).toBeVisible();
    await expect(main.getByText('Gross Income')).toHaveCount(0);
    await expect(main.getByText('Net Income')).toHaveCount(0);
    await expect(main.getByText(/income vs expense/i)).toHaveCount(0);
    await expect(main.getByText(/income tax, projected/i)).toHaveCount(0);

    // The link is gone; the URL has to be gone too. Asserted on what renders
    // rather than the status code: notFound() inside a streamed Server
    // Component does not reliably change the HTTP status, which is why every
    // other 404 assertion in this suite targets a route handler.
    for (const path of ['/expenses', '/taxes/income', '/statements/profit-and-loss', '/statements/balance-sheet']) {
      await page.goto(path);
      await expect(page.getByText(/could not be found/i), path).toBeVisible();
    }
  });

  test('a bookkeeping client gets everything except Sales Taxes', async ({ page }) => {
    test.slow();
    const { user } = await clientOn('bookkeeping', { bookkeeping: true, income_taxes: true }, false);
    await signIn(page, user.email);

    const nav = page.getByRole('complementary', { name: /navigation/i });
    await expect(nav.getByRole('link', { name: /expenses/i })).toBeVisible();
    await expect(nav.getByRole('link', { name: /income taxes/i })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Sales', exact: true })).toHaveCount(0);

    await page.goto('/taxes/sales');
    await expect(page.getByText(/could not be found/i)).toBeVisible();

    await page.goto('/expenses');
    await expect(page.getByRole('heading', { name: /expenses/i }).first()).toBeVisible();

    // And the Overview keeps the statement cards this client did buy.
    await page.goto('/dashboard');
    await expect(page.getByRole('main').getByText('Gross Income')).toBeVisible();
  });

  test('a client without bookkeeping cannot export the statement either', async ({ page }) => {
    test.slow();
    // The pages 404, but the export routes are the way around them: they
    // answer on a report id alone, and a firm that stops selling bookkeeping
    // would otherwise leave every published statement one URL away. Asserted
    // on the status code, which route handlers report honestly.
    const { user, reportId } = await clientOn('noexport', { bookkeeping: false, income_taxes: true }, false);
    await signIn(page, user.email);

    for (const format of ['csv', 'pdf']) {
      const response = await page.request.get(`/api/reports/${reportId}/${format}`);
      expect(response.status(), format).toBe(404);
    }
  });
});
