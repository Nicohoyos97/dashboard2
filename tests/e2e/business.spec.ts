import { type Browser, type Page, expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '../../lib/supabase/types';

// Settings → Business: the permission layering must be real, not asserted on
// the admin path alone. Businesses are firm-provisioned (no self-serve RPC), so
// the fixture is created through the service role — exactly how the firm admin
// portal will do it. One business with a real client_owner (can edit) and a real
// client_viewer (cannot), both driven through the browser UI:
//   - owner edits name + address and it persists
//   - viewer sees the fields disabled + the permission banner, no Save button
// RLS (entities_owner_update) is the backstop tested in rls.spec; this asserts
// the UI communicates the permission. Runs against local Supabase.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = 'Str0ng!Pass1';

test.describe('Settings → Business permissions', () => {
  test.skip(!URL || !ANON || !SERVICE, 'Supabase env not available');

  const admin = createClient<Database>(URL!, SERVICE!, { auth: { persistSession: false } });
  const created: string[] = [];

  test.afterAll(async () => {
    for (const id of created) await admin.auth.admin.deleteUser(id);
  });

  async function makeUser(label: string): Promise<{ id: string; email: string }> {
    const email = `biz-${label}-${Date.now()}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
    created.push(data.user.id);
    return { id: data.user.id, email };
  }

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
    const owner = await makeUser('owner');
    const viewer = await makeUser('viewer');

    // Firm-provisioned business + memberships (service role, as the admin portal will).
    const { data: entity, error: entErr } = await admin
      .from('business_entities')
      .insert({ name: 'Acme Books' })
      .select('id')
      .single();
    if (entErr || !entity) throw new Error(`insert entity: ${entErr?.message}`);
    const { error: memErr } = await admin.from('entity_memberships').insert([
      { business_entity_id: entity.id, user_id: owner.id, role: 'client_owner' },
      { business_entity_id: entity.id, user_id: viewer.id, role: 'client_viewer' },
    ]);
    if (memErr) throw new Error(`insert memberships: ${memErr.message}`);

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
