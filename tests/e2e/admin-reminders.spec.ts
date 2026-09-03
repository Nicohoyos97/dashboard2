import { type Page, expect, test } from '@playwright/test';

import { Fixtures, PASSWORD, supabaseEnv } from './helpers/fixtures';
import { totp } from './helpers/totp';

test.describe('Firm portal: client reminders', () => {
  test.skip(!supabaseEnv(), 'Supabase env not available');
  test.setTimeout(120_000);

  const fx = new Fixtures();
  test.afterAll(() => fx.cleanup());

  async function signIn(page: Page, email: string): Promise<void> {
    await page.goto('/signin');
    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  }

  test('admin publishes a reminder and the assigned client sees its derived status', async ({ browser }) => {
    const entityId = await fx.makeEntity(await fx.makeClientRow('reminder'), 'Reminder Co');
    const member = await fx.makeUser('reminder-client');
    const firm = await fx.makeFirmUser('reminder-admin');
    await fx.addMembership(entityId, member.id, 'client_owner');

    const admin = await (await browser.newContext()).newPage();
    await signIn(admin, firm.email);
    await admin.goto('/admin');
    const secret = (await admin.locator('code').first().textContent())?.trim() ?? '';
    await admin.fill('#totp', totp(secret));
    await admin.getByRole('button', { name: /activate and continue/i }).click();
    await expect(admin).toHaveURL(/\/admin$/);
    await admin.goto(`/admin/entities/${entityId}`);
    await admin.getByRole('button', { name: /new reminder/i }).click();
    await admin.fill('#remTitle', 'Quarterly loan payment');
    await admin.selectOption('#remType', 'loan_payment');
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await admin.fill('#remDue', tomorrow);
    await admin.fill('#remAmount', '450.00');
    await admin.fill('#remAction', 'Approve the scheduled transfer.');
    await admin.locator('#remTitle').locator('xpath=ancestor::form').getByRole('button', { name: /^save$/i }).click();
    await expect(admin.getByText('Quarterly loan payment')).toBeVisible();

    const client = await (await browser.newContext()).newPage();
    await signIn(client, member.email);
    await expect(client.getByText('Quarterly loan payment')).toBeVisible();
    await expect(client.getByText('Approve the scheduled transfer.')).toBeVisible();
    await expect(client.getByText('Due soon')).toBeVisible();
    await expect(client.getByText('$450.00')).toBeVisible();
  });
});
