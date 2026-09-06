import { expect, test } from '@playwright/test';

import { Fixtures, PASSWORD, supabaseEnv } from './helpers/fixtures';

// Sign in, sign out — and the door that is now shut. There is no self-serve
// sign-up: the account below is made the way the firm makes one (the auth admin
// API, which is what an invitation uses), and /signup leaves for the plans on
// the marketing site instead of offering a form.
test.describe('Auth', () => {
  test.skip(!supabaseEnv(), 'Supabase env not available');

  const fx = new Fixtures();
  test.afterAll(() => fx.cleanup());

  test('sign in → sign out → sign in again', async ({ page }) => {
    const { email } = await fx.makeUser('auth');

    await page.goto('/signin');
    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.getByRole('button', { name: /account menu/i }).click();
    await page.getByRole('menuitem', { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/signin/);

    // Load the page rather than typing into the one the redirect just handed
    // us: a click that beats hydration submits the form natively and goes
    // nowhere, which is what made this flaky.
    await page.goto('/signin');
    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('sign-up is closed and points at the plans', async ({ page, request }) => {
    // The way out for a visitor with no account is a link, not a second form.
    await page.goto('/signin');
    await expect(page.getByRole('link', { name: /choose a plan/i })).toHaveAttribute(
      'href',
      'https://hoyosbaker.com/get-started/bookkeeping?start=plans',
    );
    await expect(page.locator('#firstName')).toHaveCount(0);

    // The old route follows it, in the reader's own language.
    for (const [path, destination] of [
      ['/signup', 'https://hoyosbaker.com/get-started/bookkeeping?start=plans'],
      ['/es/signup', 'https://hoyosbaker.com/es/get-started/bookkeeping?start=plans'],
    ]) {
      const response = await request.get(path!, { maxRedirects: 0 });
      expect(response.status()).toBeGreaterThanOrEqual(300);
      expect(response.status()).toBeLessThan(400);
      expect(response.headers()['location']).toBe(destination);
    }

    // And the app is not the only lock: the Auth server refuses a walk-in too,
    // which is what closes Google as well. (Needs a local stack restarted since
    // `enable_signup = false` landed in supabase/config.toml.)
    const env = supabaseEnv()!;
    const refused = await request.post(`${env.url}/auth/v1/signup`, {
      headers: { apikey: env.anon, 'content-type': 'application/json' },
      data: { email: `walk-in-${Date.now()}@example.com`, password: PASSWORD },
    });
    expect(refused.status()).toBe(422);
    expect(((await refused.json()) as { error_code?: string }).error_code).toBe('signup_disabled');
  });
});
