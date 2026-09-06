import { expect, test } from '@playwright/test';

import { Fixtures, PASSWORD, supabaseEnv } from './helpers/fixtures';

// Where a client collects sales tax, named on their own page (0024).
//
// The page used to print how many jurisdictions its filings mentioned — a
// number that was always 0, because nothing had ever written one. The rows the
// firm's provisioning form now writes are read here by the *client*, so this
// also exercises the member half of jurisdictions_member_select.
test.describe('Sales Taxes: the jurisdictions the firm registered', () => {
  test.skip(!supabaseEnv(), 'Supabase env not available');

  const fx = new Fixtures();
  test.afterAll(() => fx.cleanup());

  test('names Illinois and the city under it, in place of a count', async ({ page }) => {
    test.slow();
    const user = await fx.makeUser('salestaxpills');
    const entityId = await fx.makeEntity(await fx.makeClientRow('salestaxpills'), 'Niles Diner Co');
    await fx.addMembership(entityId, user.id, 'client_owner');

    const { error: moduleError } = await fx.admin
      .from('business_entities')
      .update({ sales_tax_enabled: true })
      .eq('id', entityId);
    if (moduleError) throw new Error(`enable sales tax: ${moduleError.message}`);

    // What /admin's provisioning form writes for "Illinois, and the City of
    // Niles collects its own".
    const { error: jurisdictionError } = await fx.admin.from('tax_jurisdictions').insert([
      { business_entity_id: entityId, tax_type: 'sales', level: 'state', name: 'Illinois', code: 'US-IL' },
      { business_entity_id: entityId, tax_type: 'sales', level: 'local', name: 'City of Niles', code: 'US-IL-CITY-OF-NILES' },
    ]);
    if (jurisdictionError) throw new Error(`insert jurisdictions: ${jurisdictionError.message}`);

    // One published filing, so the page is the real one rather than its empty state.
    const { error: obligationError } = await fx.admin.from('tax_obligations').insert({
      business_entity_id: entityId,
      tax_type: 'sales',
      source: 'firm_entry',
      status: 'firm_confirmed',
      filing_status: 'filed',
      period_start: '2026-07-01',
      period_end: '2026-07-31',
      due_date: '2026-08-20',
      amount_payable: 1328,
      published_at: new Date().toISOString(),
    });
    if (obligationError) throw new Error(`insert obligation: ${obligationError.message}`);

    await page.goto('/signin');
    await page.fill('#email', user.email);
    await page.fill('#password', PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto('/taxes/sales');
    const main = page.getByRole('main');
    const registered = main.getByRole('list', { name: /registered in/i });
    await expect(registered.getByText('Illinois', { exact: true })).toBeVisible();
    await expect(registered.getByText('City of Niles', { exact: true })).toBeVisible();

    // The card that counted them is gone, and nothing on the page replaced it
    // with the same number under another label.
    await expect(main.getByText('Jurisdictions', { exact: true })).toHaveCount(0);
  });
});
