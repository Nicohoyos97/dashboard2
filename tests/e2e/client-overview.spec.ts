import { type Page, expect, test } from '@playwright/test';

import { Fixtures, PASSWORD, supabaseEnv } from './helpers/fixtures';
import { seedPublishedBankMonths, seedPublishedReminder, seedPublishedStatement } from './helpers/seed-statements';

test.describe('Client portal: Overview, reports and reminders', () => {
  test.skip(!supabaseEnv(), 'Supabase env not available');
  test.setTimeout(120_000);

  const fx = new Fixtures();
  const uploaded: string[] = [];
  test.afterAll(async () => {
    if (uploaded.length) await fx.admin.storage.from('documents').remove(uploaded);
    await fx.cleanup();
  });

  async function signIn(page: Page, email: string): Promise<void> {
    await page.goto('/signin');
    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  }

  const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

  test('shows source-safe KPIs, chart, reminders, library and audited CSV', async ({ browser }) => {
    const entityId = await fx.makeEntity(await fx.makeClientRow('overview'), 'Harbor Coffee Roasters LLC');
    const member = await fx.makeUser('overview-member');
    await fx.addMembership(entityId, member.id, 'client_owner');
    const pnl = await seedPublishedStatement(fx, entityId, 'letter-and-pnl', { uploaded });
    const bank = await seedPublishedBankMonths(fx, entityId);
    await seedPublishedReminder(fx, entityId, '2026-09-05');

    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await signIn(page, member.email);
    await page.goto(`/dashboard?period=${pnl.period.start}_${pnl.period.end}`);

    await expect(page.getByRole('heading', { name: /hello/i })).toBeVisible();

    // The headline KPIs read the published P&L; the bank's own figures live on
    // Expenses and in the insight rules (they moved off the Overview when the
    // owner reshaped it — see docs/ASSUMPTIONS.md, 2026-09-03).
    const netIncome = pnl.totals.netIncome;
    const revenue = pnl.totals.revenue;
    if (netIncome === null || revenue === null) throw new Error('P&L fixture has no headline totals');
    await expect(page.getByText(money(revenue)).first()).toBeVisible();
    await expect(page.getByText(money(netIncome)).first()).toBeVisible();
    await expect(page.getByText(/income minus operating expenses/i)).toBeVisible();
    await expect(page.getByText('Equipment loan payment')).toBeVisible();
    await expect(page.getByText('Schedule the payment.')).toBeVisible();

    // §14.13: the fixture publishes monthly bank statements and one half-year
    // P&L, so Monthly is offered and the other two are disabled — never a month
    // sliced out of the six-month statement. The sentence that used to sit under
    // these tabs was removed at the owner's request; the period picker carries
    // the same information per option now.
    const granularity = page.getByRole('group', { name: /reporting granularity/i });
    await expect(granularity.getByRole('button', { name: 'Monthly' })).not.toHaveAttribute('aria-disabled', 'true');
    await expect(granularity.getByRole('button', { name: 'Quarterly' })).toHaveAttribute('aria-disabled', 'true');
    await expect(granularity.getByRole('button', { name: 'Annual' })).toHaveAttribute('aria-disabled', 'true');
    await granularity.getByRole('button', { name: 'Monthly' }).click();
    await expect(page).toHaveURL(/\/dashboard\?period=\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}/);

    // Bank activity is the Expenses page's source, and it names it. The portal
    // does not report cash flow anywhere.
    await page.goto('/expenses');
    await expect(page.getByText(/debits on published bank statements/i)).toBeVisible();
    // The page opens on the newest published month, so it shows that month's debits.
    await expect(page.getByText(money(bank.monthlyDebitCents)).first()).toBeVisible();
    await page.goto(`/dashboard?period=${pnl.period.start}_${pnl.period.end}`);

    await page.getByRole('link', { name: /view all/i }).click();
    await expect(page).toHaveURL(/\/reports$/);
    await expect(page.getByRole('heading', { name: /reports library/i })).toBeVisible();
    await expect(page.getByText(/letter-and-pnl/i)).toBeVisible();

    const csv = await page.request.get(`/api/reports/${pnl.reportId}/csv`);
    expect(csv.status()).toBe(200);
    expect(csv.headers()['content-type']).toContain('text/csv');
    expect(csv.headers()['content-disposition']).toContain('profit-and-loss_2026-01-01_2026-06-30.csv');
    expect(await csv.text()).toContain('Total Income');
    const { count } = await fx.admin.from('audit_logs').select('id', { count: 'exact', head: true }).eq('action', 'report.export.csv').eq('resource_id', pnl.reportId);
    expect(count).toBe(1);
  });

  test('rejects another tenant report export and works in the mobile drawer', async ({ browser }) => {
    const ownEntity = await fx.makeEntity(await fx.makeClientRow('mobile-own'), 'Mobile Own Co');
    const otherEntity = await fx.makeEntity(await fx.makeClientRow('mobile-other'), 'Mobile Other Co');
    const member = await fx.makeUser('mobile-member');
    await fx.addMembership(ownEntity, member.id, 'client_viewer');
    const other = await seedPublishedStatement(fx, otherEntity, 'letter-and-pnl', { uploaded });

    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await signIn(page, member.email);
    await expect(page.getByRole('heading', { name: /hello/i })).toBeVisible();
    await page.getByRole('button', { name: /open menu/i }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText('Mobile Own Co')).toBeVisible();

    const response = await page.request.get(`/api/reports/${other.reportId}/csv`);
    expect(response.status()).toBe(404);
  });
});
