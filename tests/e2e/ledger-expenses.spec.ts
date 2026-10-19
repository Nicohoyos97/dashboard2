import { expect, test } from '@playwright/test';

import { Fixtures, PASSWORD, supabaseEnv } from './helpers/fixtures';
import { seedPublishedStatement } from './helpers/seed-statements';

// The Expenses table opens an account onto the transactions behind it (0026)
// without the page carrying them: only the account the client arrived for
// comes with the render, and any other is fetched the first time it is opened
// (/api/ledger/lines/[lineId]). Shipping every account's transactions with each
// render put hundreds of kilobytes into a page whose accounts all start closed.
test.describe('Expenses: the transactions behind an account, on demand', () => {
  test.skip(!supabaseEnv(), 'Supabase env not available');

  const fx = new Fixtures();
  test.afterAll(() => fx.cleanup());

  async function signIn(page: import('@playwright/test').Page, email: string) {
    await page.goto('/signin');
    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  }

  // A published P&L, and a published ledger whose accounts carry exactly two of
  // its expense lines: Rent in two payments, Utilities in one.
  async function seed(label: string) {
    const tenant = await fx.makeTenant(label);
    const { reportId } = await seedPublishedStatement(fx, tenant.entityId, 'letter-and-pnl', { uploaded: [] });
    const { data: report } = await fx.admin.from('financial_reports').select('period_start, period_end').eq('id', reportId).single();
    const { data: lines } = await fx.admin.from('financial_statement_lines').select('id, account_name').eq('report_id', reportId);
    const lineId = (name: string) => (lines ?? []).find((l) => l.account_name === name)?.id ?? '';
    const now = new Date().toISOString();
    const { data: ledger } = await fx.admin
      .from('general_ledgers')
      .insert({ business_entity_id: tenant.entityId, period_start: report!.period_start, period_end: report!.period_end, status: 'published', published_at: now })
      .select('id')
      .single();
    const account = async (name: string, total: number, count: number, position: number) => {
      const { data } = await fx.admin
        .from('ledger_accounts')
        .insert({ ledger_id: ledger!.id, business_entity_id: tenant.entityId, name, position, total, transaction_count: count, client_visible: true })
        .select('id')
        .single();
      return data!.id;
    };
    const rent = await account('Rent', 24000, 2, 0);
    const utilities = await account('Utilities', 3480.75, 1, 1);
    const txn = (accountId: string, amount: number, name: string, position: number) => ({
      ledger_id: ledger!.id, account_id: accountId, business_entity_id: tenant.entityId,
      txn_date: report!.period_end, txn_type: 'Expense', name, amount, position,
    });
    const { error } = await fx.admin.from('ledger_transactions').insert([
      txn(rent, 12000, 'Landlord Alpha', 0),
      txn(rent, 12000, 'Landlord Alpha', 1),
      txn(utilities, 3480.75, 'Power Company Beta', 2),
    ]);
    if (error) throw new Error(`insert transactions: ${error.message}`);
    return { tenant, period: `${report!.period_start}_${report!.period_end}`, rentLine: lineId('Rent'), utilitiesLine: lineId('Utilities') };
  }

  test('an account opens onto its transactions, fetched when it is opened', async ({ page }) => {
    const { tenant, period, rentLine } = await seed('glx-open');
    await signIn(page, tenant.email);
    await page.goto(`/expenses?period=${period}`);

    const open = page.getByRole('button', { name: 'Show the transactions behind Rent' });
    await expect(open).toBeVisible();
    await expect(open).toContainText('2 transactions');
    // Nothing of the ledger's rows travelled with the page, not even in the RSC payload.
    expect(await page.content()).not.toContain('Landlord Alpha');

    const fetched = page.waitForResponse((r) => r.url().endsWith(`/api/ledger/lines/${rentLine}`) && r.status() === 200);
    await open.click();
    await fetched;
    await expect(page.getByText(/These 2 transactions add up to \$24,000\.00/)).toBeVisible();
    await expect(page.getByText('Landlord Alpha').first()).toBeVisible();
  });

  test('the account the client arrived for comes with the page, already open', async ({ page }) => {
    const { tenant, period, utilitiesLine } = await seed('glx-arrive');
    await signIn(page, tenant.email);
    const requests: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/ledger/lines/')) requests.push(r.url());
    });
    await page.goto(`/expenses?period=${period}&line=${utilitiesLine}`);

    await expect(page.getByText(/This transaction adds up to \$3,480\.75/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show the transactions behind Utilities' })).toHaveAttribute('aria-expanded', 'true');
    expect(requests).toEqual([]);
  });

  test('another business gets nothing from the route', async ({ page }) => {
    const { utilitiesLine } = await seed('glx-owner');
    const stranger = await fx.makeTenant('glx-stranger');
    await signIn(page, stranger.email);
    expect((await page.request.get(`/api/ledger/lines/${utilitiesLine}`)).status()).toBe(404);
  });
});
