import { type APIRequestContext, expect, test } from '@playwright/test';

// Full auth flow against local Supabase: sign up, confirm the email (read from
// the local mail catcher — Mailpit, shipped by Supabase CLI v2), sign in, and
// sign out. Requires `pnpm supabase:start`.
const MAILPIT = 'http://127.0.0.1:54324';
const PASSWORD = 'Str0ng!Pass1';

test('signup → email confirm → signin → signout', async ({ page, request }) => {
  const stamp = Date.now();
  const mailbox = `e2e-${stamp}`;
  const email = `${mailbox}@example.com`;

  // ── Sign up ──────────────────────────────────────────────────────────
  await page.goto('/signup');
  await page.fill('#firstName', 'E2E');
  await page.fill('#lastName', 'Tester');
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: /create my account/i }).click();
  await expect(page.getByText(/check your email/i)).toBeVisible();

  // ── Confirm via the Mailpit message ──────────────────────────────────
  const confirmUrl = await confirmationLink(request, email);
  await page.goto(confirmUrl);
  await expect(page).toHaveURL(/\/dashboard/);

  // ── Sign out ─────────────────────────────────────────────────────────
  await page.getByRole('button', { name: /account menu/i }).click();
  await page.getByRole('menuitem', { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/signin/);

  // ── Sign in with the confirmed credentials ───────────────────────────
  await page.goto('/signin');
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // ── Sign out again ───────────────────────────────────────────────────
  await page.getByRole('button', { name: /account menu/i }).click();
  await page.getByRole('menuitem', { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/signin/);
});

async function confirmationLink(request: APIRequestContext, email: string): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const list = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
    const { messages } = (await list.json()) as { messages: Array<{ ID: string }> };
    const latest = messages[0];
    if (latest) {
      const detail = await request.get(`${MAILPIT}/api/v1/message/${latest.ID}`);
      const body = (await detail.json()) as { HTML?: string; Text?: string };
      const html = body.HTML || body.Text || '';
      const match = html.match(/https?:\/\/[^\s"']*\/auth\/v1\/verify[^\s"']*/);
      if (match) return match[0].replace(/&amp;/g, '&');
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No confirmation email arrived in Mailpit for ${email}`);
}
