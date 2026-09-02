import { type Browser, type Page, expect, test } from '@playwright/test';

import { Fixtures, PASSWORD, supabaseEnv } from './helpers/fixtures';
import { totp } from './helpers/totp';

// Firm portal gate (INITIAL_PROMPT.md §3, §8, acceptance §14.21) and the
// entity switcher (§7), driven through the browser:
//   anonymous → /signin · client user → /dashboard · firm user at aal1 →
//   /admin/mfa (enroll) · after TOTP → /admin · a fresh session is challenged
//   again (verify) · switching business updates the Overview and persists.
test.describe('Firm portal gate + entity switcher', () => {
  test.skip(!supabaseEnv(), 'Supabase env not available');

  const fx = new Fixtures();
  test.afterAll(() => fx.cleanup());

  async function signIn(page: Page, email: string): Promise<void> {
    await page.goto('/signin');
    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  }

  async function freshPage(browser: Browser): Promise<Page> {
    return (await browser.newContext()).newPage();
  }

  test('/admin requires a firm role and a second factor', async ({ browser }) => {
    // Anonymous → sign-in.
    const anon = await freshPage(browser);
    await anon.goto('/admin');
    await expect(anon).toHaveURL(/\/signin/);

    // A client (no firm role) → back to the client portal.
    const tenant = await fx.makeTenant('gate-client');
    const clientPage = await freshPage(browser);
    await signIn(clientPage, tenant.email);
    await clientPage.goto('/admin');
    await expect(clientPage).toHaveURL(/\/dashboard/);

    // A firm admin at aal1 → must enroll TOTP first.
    const firm = await fx.makeFirmUser('gate-admin');
    const page = await freshPage(browser);
    await signIn(page, firm.email);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/mfa/);
    await expect(page.getByRole('heading', { name: /two-factor/i })).toBeVisible();

    // The enroll screen shows the secret for manual entry; that is enough to
    // compute a valid code without an authenticator app.
    const secret = (await page.locator('code').first().textContent())?.trim() ?? '';
    expect(secret.length).toBeGreaterThan(10);
    await page.fill('#totp', totp(secret));
    await page.getByRole('button', { name: /activate and continue/i }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: /firm dashboard/i })).toBeVisible();

    // A new session (new browser context) is challenged again — verify mode.
    const again = await freshPage(browser);
    await signIn(again, firm.email);
    await again.goto('/admin');
    await expect(again).toHaveURL(/\/admin\/mfa/);
    await expect(again.getByRole('heading', { name: /confirm it is you/i })).toBeVisible();
    await again.fill('#totp', totp(secret));
    await again.getByRole('button', { name: /^continue$/i }).click();
    await expect(again).toHaveURL(/\/admin$/);
  });

  test('entity switcher changes the current business and persists', async ({ browser }) => {
    const user = await fx.makeUser('switch');
    const alpha = await fx.makeEntity(await fx.makeClientRow('sw-a'), 'Alpha Co');
    const beta = await fx.makeEntity(await fx.makeClientRow('sw-b'), 'Beta Co');
    await fx.addMembership(alpha, user.id, 'client_owner');
    await fx.addMembership(beta, user.id, 'client_viewer');

    const page = await freshPage(browser);
    await signIn(page, user.email);
    // Earliest-joined membership is the default.
    await expect(page.getByText(/how Alpha Co is doing/i)).toBeVisible();

    await page.getByRole('button', { name: /switch business/i }).click();
    await page.getByRole('menuitem', { name: /beta co/i }).click();
    await expect(page.getByText(/how Beta Co is doing/i)).toBeVisible();

    // The choice is a cookie validated against memberships; it survives a reload.
    await page.reload();
    await expect(page.getByText(/how Beta Co is doing/i)).toBeVisible();
  });
});
