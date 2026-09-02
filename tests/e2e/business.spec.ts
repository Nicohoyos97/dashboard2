import { type Browser, type Page, expect, test } from '@playwright/test';

import { Fixtures, PASSWORD, supabaseEnv } from './helpers/fixtures';

// Settings → Business: the permission layering must be real, not asserted on
// the admin path alone. Businesses are firm-provisioned (no self-serve RPC), so
// the fixture is created through the service role — exactly how the firm admin
// portal will do it. One business with a real client_owner (can edit) and a real
// client_viewer (cannot), both driven through the browser UI:
//   - owner edits name + address and it persists
//   - viewer sees the fields disabled + the permission banner, no Save button
// RLS (entities_owner_update) is the backstop tested in rls.spec; this asserts
// the UI communicates the permission. Runs against local Supabase.
test.describe('Settings → Business permissions', () => {
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

  async function browserSession(browser: Browser, email: string): Promise<Page> {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, email);
    return page;
  }

  test('owner edits business; viewer sees disabled fields + banner', async ({ browser }) => {
    const owner = await fx.makeUser('owner');
    const viewer = await fx.makeUser('viewer');

    // Firm-provisioned client + business + memberships (service role, as the admin portal will).
    const clientId = await fx.makeClientRow('acme');
    const entityId = await fx.makeEntity(clientId, 'Acme Books');
    await fx.addMembership(entityId, owner.id, 'client_owner');
    await fx.addMembership(entityId, viewer.id, 'client_viewer');

    // ── Owner: edit name + address, expect it to persist ─────────────────
    const ownerPage = await browserSession(browser, owner.email);
    await ownerPage.goto('/settings/business');
    await expect(ownerPage.locator('#bizName')).toBeEnabled();
    await ownerPage.fill('#bizName', 'Acme Bookkeeping LLC');
    await ownerPage.fill('#legalName', 'Acme Bookkeeping, LLC');
    await ownerPage.fill('#line1', '123 Ledger St');
    await ownerPage.fill('#city', 'Bogotá');
    await ownerPage.fill('#state', 'Cundinamarca');
    await ownerPage.getByRole('button', { name: /save changes/i }).click();
    await expect(ownerPage.getByText('Saved.')).toBeVisible();

    // Persisted across a reload.
    await ownerPage.reload();
    await expect(ownerPage.locator('#bizName')).toHaveValue('Acme Bookkeeping LLC');
    await expect(ownerPage.locator('#city')).toHaveValue('Bogotá');

    // ── Viewer: fields disabled, banner shown, no Save button ────────────
    const viewerPage = await browserSession(browser, viewer.email);
    await viewerPage.goto('/settings/business');
    await expect(viewerPage.locator('#bizName')).toBeDisabled();
    await expect(viewerPage.locator('#line1')).toBeDisabled();
    await expect(
      viewerPage.getByText('Only the business owner can edit these details.'),
    ).toBeVisible();
    await expect(viewerPage.getByRole('button', { name: /save changes/i })).toHaveCount(0);
    // The viewer still reads the owner's saved values (entities_member_select).
    await expect(viewerPage.locator('#bizName')).toHaveValue('Acme Bookkeeping LLC');
  });
});
