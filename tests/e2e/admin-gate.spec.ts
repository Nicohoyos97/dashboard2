import { randomUUID } from 'node:crypto';

import { type Browser, type Page, expect, test } from '@playwright/test';

import { Fixtures, PASSWORD, supabaseEnv } from './helpers/fixtures';
import { seedPublishedCashMonths } from './helpers/seed-statements';
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

  test('firm admin previews the client portal for a business and exits', async ({ browser }) => {
    const entityId = await fx.makeEntity(await fx.makeClientRow('pv'), 'Preview Co');
    await seedPublishedCashMonths(fx, entityId);
    const { data: draftAccount } = await fx.admin
      .from('bank_accounts')
      .insert({ business_entity_id: entityId, institution: 'Draft Bank', masked_number: '••••9999', account_type: 'checking', currency: 'USD' })
      .select('id')
      .single();
    if (!draftAccount) throw new Error('preview draft account was not seeded');
    const { data: draftStatement } = await fx.admin
      .from('bank_statements')
      .insert({ business_entity_id: entityId, bank_account_id: draftAccount.id, period_start: '2026-06-01', period_end: '2026-06-30', source: 'firm_entry', status: 'needs_review' })
      .select('id')
      .single();
    if (!draftStatement) throw new Error('preview draft statement was not seeded');
    const { error: draftTransactionError } = await fx.admin.from('bank_transactions').insert({
      business_entity_id: entityId,
      bank_account_id: draftAccount.id,
      bank_statement_id: draftStatement.id,
      txn_date: '2026-06-10',
      description: 'Draft-only charge',
      debit: 999999.99,
      source: 'firm_entry',
      dedupe_key: randomUUID().replace(/-/g, ''),
    });
    if (draftTransactionError) throw new Error('preview draft transaction was not seeded');
    const firm = await fx.makeFirmUser('pv-admin');
    const page = await freshPage(browser);
    await signIn(page, firm.email);
    await page.goto('/admin');
    const secret = (await page.locator('code').first().textContent())?.trim() ?? '';
    await page.fill('#totp', totp(secret));
    await page.getByRole('button', { name: /activate and continue/i }).click();
    await expect(page).toHaveURL(/\/admin$/);

    await page.goto(`/admin/entities/${entityId}`);
    await page.getByRole('button', { name: /preview as client/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(/previewing the client portal for Preview Co/i)).toBeVisible();
    await expect(page.getByText(/how Preview Co is doing/i)).toBeVisible();

    // The preview must show exactly what the client sees. Bank activity lives
    // on Expenses now, so that is where the published/draft split is checked:
    // the firm's RLS branch can read drafts, and the loaders' explicit
    // published filter is what keeps them out of the preview.
    await page.goto('/expenses');
    await expect(page.getByText('$1,100.00').first()).toBeVisible();
    await expect(page.getByText('$999,999.99')).toHaveCount(0);
    await expect(page.getByText('Draft-only charge')).toHaveCount(0);
    await page.goto('/dashboard');
    await expect(page.getByText(/previewing the client portal for Preview Co/i)).toBeVisible();

    await page.getByRole('button', { name: /exit preview/i }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/entities/${entityId}$`));
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
