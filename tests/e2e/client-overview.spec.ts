import { type Page, expect, test } from '@playwright/test';

import { Fixtures, PASSWORD, supabaseEnv } from './helpers/fixtures';
import { seedPublishedCashMonths, seedPublishedReminder, seedPublishedStatement } from './helpers/seed-statements';

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
    const cash = await seedPublishedCashMonths(fx, entityId);
    await seedPublishedReminder(fx, entityId, '2026-09-05');

    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await signIn(page, member.email);
    await page.goto(`/dashboard?period=${pnl.period.start}_${pnl.period.end}`);

    await expect(page.getByRole('heading', { name: /hello/i })).toBeVisible();
    await expect(page.getByText(money(cash.totalInCents)).first()).toBeVisible();
    await expect(page.getByText(money(cash.totalOutCents)).first()).toBeVisible();
    await expect(page.getByText(money(cash.netCents)).first()).toBeVisible();
    const netIncome = pnl.totals.netIncome;
    if (netIncome === null) throw new Error('P&L fixture has no net income total');
    await expect(page.getByText(money(netIncome)).first()).toBeVisible();
    await expect(page.getByText(/source: bank statements/i).first()).toBeVisible();
    await expect(page.getByText(/source: profit & loss/i).first()).toBeVisible();
    await expect(page.getByText(/over 6 months/i)).toBeVisible();
    await expect(page.getByText(/more cash went out than came in/i)).toBeVisible();
    await expect(page.getByText('Equipment loan payment')).toBeVisible();
    await expect(page.getByText('Schedule the payment.')).toBeVisible();

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
