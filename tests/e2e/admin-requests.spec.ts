import { type Browser, type Page, expect, test } from '@playwright/test';

import { Fixtures, PASSWORD, supabaseEnv } from './helpers/fixtures';
import { totp } from './helpers/totp';

// The round trip a data-export request makes (INITIAL_PROMPT.md §7): the client
// raises it in Settings → Data & privacy, the firm sees it waiting from every
// admin page, answers it, and the client reads the answer back. Nothing here
// deletes or exports on its own — "completed" is the firm saying it did the work.
test.describe('Account requests: client raises, firm answers', () => {
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

  async function adminPage(browser: Browser): Promise<Page> {
    const firm = await fx.makeFirmUser('req-admin');
    const page = await (await browser.newContext()).newPage();
    await signIn(page, firm.email);
    await page.goto('/admin');
    const secret = (await page.locator('code').first().textContent())?.trim() ?? '';
    await page.fill('#totp', totp(secret));
    await page.getByRole('button', { name: /activate and continue/i }).click();
    await expect(page).toHaveURL(/\/admin$/);
    return page;
  }

  test('a request reaches the firm queue and its answer reaches the client', async ({ browser }) => {
    const entityId = await fx.makeEntity(await fx.makeClientRow('req'), 'Request Co');
    const member = await fx.makeUser('req-member');
    await fx.addMembership(entityId, member.id, 'client_owner');

    const client = await (await browser.newContext()).newPage();
    await signIn(client, member.email);
    await client.goto('/settings/privacy');
    await client.getByRole('textbox', { name: /message for your accountant/i }).first().fill('Everything for 2026, please');
    await client.getByRole('button', { name: /request my data/i }).click();
    await expect(client.getByText(/waiting for your accountant/i)).toBeVisible();

    // The firm learns about it without being told: the nav item counts open
    // requests, and the dashboard names them.
    const admin = await adminPage(browser);
    await expect(admin.getByRole('link', { name: /requests 1 waiting/i })).toBeVisible();
    const card = admin.getByRole('link', { name: /open requests/i });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('href', /\/admin\/requests$/);
    // Navigated rather than clicked: this route's first compile under a loaded
    // dev server outruns the click assertion, and the link itself is asserted.
    await admin.goto('/admin/requests');
    await expect(admin.getByRole('heading', { name: /data export/i })).toBeVisible();
    await expect(admin.getByText('Everything for 2026, please')).toBeVisible();

    await admin.getByRole('textbox', { name: /reply to the client/i }).fill('Sent to your email today.');
    await admin.getByRole('button', { name: /^complete$/i }).click();
    // The action, its revalidate and the router refresh are one round trip the
    // dev server can take a while over when the suite runs in parallel.
    await expect(admin.getByText(/no open requests/i)).toBeVisible({ timeout: 30_000 });
    await expect(admin.getByRole('link', { name: /requests 1 waiting/i })).toHaveCount(0);

    // Resolution is stamped by the database, not by the caller.
    const { data: stored } = await fx.admin
      .from('account_requests')
      .select('status, resolved_at, resolved_by, message')
      .eq('business_entity_id', entityId)
      .single();
    expect(stored?.status).toBe('completed');
    expect(stored?.resolved_at).not.toBeNull();
    expect(stored?.resolved_by).not.toBeNull();
    expect(stored?.message).toBe('Everything for 2026, please');

    // And the client reads the firm's answer in their own history.
    await client.reload();
    await expect(client.getByText(/earlier requests/i)).toBeVisible();
    await expect(client.getByText(/sent to your email today/i)).toBeVisible();
  });
});
