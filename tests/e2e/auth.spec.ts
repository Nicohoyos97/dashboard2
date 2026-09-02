import { type APIRequestContext, expect, test } from '@playwright/test';

// Full Phase 1 auth flow against local Supabase: sign up, confirm the email
// (read from Inbucket), sign in, and sign out. Requires `pnpm supabase:start`.
const INBUCKET = 'http://127.0.0.1:54324';
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

  // ── Confirm via the Inbucket message ─────────────────────────────────
  const confirmUrl = await confirmationLink(request, mailbox);
  await page.goto(confirmUrl);
  await expect(page).toHaveURL(/\/dashboard/);

  // ── Sign out ─────────────────────────────────────────────────────────
  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/signin/);

  // ── Sign in with the confirmed credentials ───────────────────────────
  await page.goto('/signin');
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // ── Sign out again ───────────────────────────────────────────────────
  await page.getByRole('button', { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/signin/);
});

async function confirmationLink(request: APIRequestContext, mailbox: string): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const list = await request.get(`${INBUCKET}/api/v1/mailbox/${mailbox}`);
    const messages = (await list.json()) as Array<{ id: string }>;
    const latest = messages.at(-1);
    if (latest) {
      const detail = await request.get(`${INBUCKET}/api/v1/mailbox/${mailbox}/${latest.id}`);
      const body = (await detail.json()) as { body?: { html?: string; text?: string } };
      const html = body.body?.html ?? body.body?.text ?? '';
      const match = html.match(/https?:\/\/[^\s"']*\/auth\/v1\/verify[^\s"']*/);
      if (match) return match[0].replace(/&amp;/g, '&');
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No confirmation email arrived in Inbucket for ${mailbox}`);
}
