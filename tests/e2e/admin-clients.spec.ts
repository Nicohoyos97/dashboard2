import { type APIRequestContext, type Browser, type Page, expect, test } from '@playwright/test';

import { Fixtures, PASSWORD, supabaseEnv } from './helpers/fixtures';
import { totp } from './helpers/totp';

// Acceptance §14.1 through the browser: a master admin creates a client and a
// business, links an existing account, and invites a new person who activates
// through the Supabase invite email (Mailpit) and lands on the business.
const MAILPIT = 'http://127.0.0.1:54324';

test.describe('Firm portal: clients, businesses, people', () => {
  test.skip(!supabaseEnv(), 'Supabase env not available');
  // One long browser journey (TOTP, three forms, two extra sessions, an email
  // round-trip through Mailpit): give it room beyond the 30 s default.
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

  // Firm admin session with TOTP completed in the browser.
  async function adminPage(browser: Browser): Promise<Page> {
    const firm = await fx.makeFirmUser('crud-admin');
    const page = await (await browser.newContext()).newPage();
    await signIn(page, firm.email);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/mfa/);
    const secret = (await page.locator('code').first().textContent())?.trim() ?? '';
    await page.fill('#totp', totp(secret));
    await page.getByRole('button', { name: /activate and continue/i }).click();
    await expect(page).toHaveURL(/\/admin$/);
    return page;
  }

  async function inviteLink(request: APIRequestContext, email: string): Promise<string> {
    for (let attempt = 0; attempt < 30; attempt++) {
      const list = await request.get(
        `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
      );
      const { messages } = (await list.json()) as { messages: Array<{ ID: string }> };
      const latest = messages[0];
      if (latest) {
        const detail = await request.get(`${MAILPIT}/api/v1/message/${latest.ID}`);
        const body = (await detail.json()) as { HTML?: string; Text?: string };
        const match = (body.HTML || body.Text || '').match(
          /https?:\/\/[^\s"']*\/auth\/v1\/verify[^\s"']*/,
        );
        if (match) return match[0].replace(/&amp;/g, '&');
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`No invite email arrived in Mailpit for ${email}`);
  }

  test('create client → business → link existing → invite new', async ({ browser, request }) => {
    const stamp = Date.now().toString(36);
    const page = await adminPage(browser);

    // ── Client + first business + invitation, in one submit ───────────────
    const ownerEmail = `acme-${stamp}@example.com`;
    await page.goto('/admin/clients');
    await page.getByRole('button', { name: /new client/i }).click();
    await page.fill('#clientName', `Acme Holdings ${stamp}`);
    await page.fill('#contactEmail', ownerEmail);
    // The invitation follows the contact until it is edited on its own.
    await expect(page.locator('#inviteEmail')).toHaveValue(ownerEmail);
    await page.fill('#inviteName', 'Ana Owner');
    await page.selectOption('#inviteLocale', 'es');
    await page.fill('#onboarding-entityName', `Acme Bakery ${stamp}`);

    // "Does this business have a DBA?" — saying yes holds the submit until the
    // name is there; saying no puts the question away and lets it through.
    const create = page.getByRole('button', { name: /^create$/i });
    await page.getByRole('radio', { name: /^yes$/i }).check();
    await expect(page.locator('#onboarding-dbaName')).toBeVisible();
    await expect(create).toBeDisabled();
    await page.fill('#onboarding-dbaName', `Acme Bakery Co ${stamp}`);
    await expect(create).toBeEnabled();

    await page.selectOption('#onboarding-basis', 'accrual');

    // Selling sales tax means saying where it is collected: the module holds
    // the submit until a state is chosen, and the city question is its own.
    await page.getByLabel(/^Sales Taxes/).check();
    await expect(create).toBeDisabled();
    await page.selectOption('#onboarding-salesTaxState', 'IL');
    await expect(create).toBeEnabled();
    // The second yes/no on the form — the first is the DBA question above.
    await page.locator('input[name="onboarding-hasCityTax"]').nth(1).check();
    await expect(create).toBeDisabled();
    await page.fill('#onboarding-salesTaxCity', 'City of Niles');
    await page.getByRole('button', { name: /^add$/i }).click();
    await expect(page.getByText('City of Niles')).toBeVisible();
    await expect(create).toBeEnabled();

    await create.click();

    // One submit lands on the business, ready to receive documents.
    await expect(page).toHaveURL(/\/admin\/entities\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: `Acme Bakery ${stamp}` })).toBeVisible();
    await expect(page.getByText('Accrual')).toBeVisible();
    await expect(page.getByText(/Sales Taxes/)).toBeVisible();
    await expect(page.getByText(`Acme Bakery Co ${stamp}`)).toBeVisible();
    await expect(page.getByText('Illinois · City of Niles')).toBeVisible();
    const entityUrl = page.url();

    const { data: entityRow } = await fx.admin
      .from('business_entities')
      .select('has_dba, dba_name')
      .eq('name', `Acme Bakery ${stamp}`)
      .single();
    expect(entityRow?.has_dba).toBe(true);
    expect(entityRow?.dba_name).toBe(`Acme Bakery Co ${stamp}`);

    // The codes the CHECK constraint in 0024 accepts, derived from the state
    // and the typed city name.
    const { data: jurisdictions } = await fx.admin
      .from('tax_jurisdictions')
      .select('level, name, code')
      .eq('business_entity_id', entityUrl.split('/').pop() ?? '')
      .eq('tax_type', 'sales')
      .order('level', { ascending: false });
    expect(jurisdictions).toEqual([
      { level: 'state', name: 'Illinois', code: 'US-IL' },
      { level: 'local', name: 'City of Niles', code: 'US-IL-CITY-OF-NILES' },
    ]);

    // ── The owner is invited in the language the firm chose ───────────────
    const { data: ownerProfile } = await fx.admin
      .from('profiles')
      .select('id, locale')
      .eq('email', ownerEmail)
      .maybeSingle();
    expect(ownerProfile?.locale).toBe('es');
    fx.track(ownerProfile!.id);

    const ownerLink = await inviteLink(request, ownerEmail);
    const invitedOwner = await (await browser.newContext()).newPage();
    await invitedOwner.goto(ownerLink);
    await expect(invitedOwner).toHaveURL(/\/es\/invite/);
    await invitedOwner.fill('#password', PASSWORD);
    await invitedOwner.getByRole('button', { name: /activar cuenta/i }).click();
    // Not merely the page they were sent to: the language is theirs from here
    // on, so the portal itself is Spanish.
    await expect(invitedOwner).toHaveURL(/\/es\/dashboard/);
    const ownerNav = invitedOwner.getByRole('complementary', { name: /navigation|navegación/i });
    await expect(ownerNav.getByRole('link', { name: 'Resumen', exact: true })).toBeVisible();
    await expect(ownerNav.getByRole('link', { name: /pregúntale a nick/i })).toBeVisible();

    // And it survives arriving on an English URL — the middleware sends them
    // back to their own language rather than serving one page in the wrong one.
    await invitedOwner.goto('/dashboard');
    await expect(invitedOwner).toHaveURL(/\/es\/dashboard/);

    // ── Link an existing account (self-signed-up user) ────────────────────
    const existing = await fx.makeUser('crud-existing');
    await page.fill('#memberEmail', existing.email);
    await page.selectOption('#memberRoleNew', 'client_owner');
    await page.getByRole('button', { name: /link existing account/i }).click();
    await expect(page.getByText('Account linked.')).toBeVisible();
    await expect(page.getByText(existing.email)).toBeVisible();

    // The linked user now sees the business on their Overview.
    const ownerPage = await (await browser.newContext()).newPage();
    await signIn(ownerPage, existing.email);
    await expect(ownerPage.getByText(new RegExp(`how Acme Bakery ${stamp} is doing`, 'i'))).toBeVisible();

    // ── Invite someone without an account ─────────────────────────────────
    const invitedEmail = `crud-invited-${stamp}@example.com`;
    await page.goto(entityUrl);
    await page.fill('#memberEmail', invitedEmail);
    await page.fill('#memberName', 'Ivy Invited');
    await page.selectOption('#memberRoleNew', 'client_viewer');
    await page.getByRole('button', { name: /send invitation/i }).click();
    await expect(page.getByText('Invitation sent.')).toBeVisible();

    // Invitees are auth users the fixture must clean up.
    const { data: invitedProfile } = await fx.admin
      .from('profiles')
      .select('id')
      .eq('email', invitedEmail)
      .maybeSingle();
    expect(invitedProfile).not.toBeNull();
    fx.track(invitedProfile!.id);

    const link = await inviteLink(request, invitedEmail);
    const invitee = await (await browser.newContext()).newPage();
    await invitee.goto(link);
    await expect(invitee).toHaveURL(/\/invite/);
    await expect(invitee.getByRole('heading', { name: /invited/i })).toBeVisible();
    await invitee.fill('#password', PASSWORD);
    await invitee.getByRole('button', { name: /activate account/i }).click();
    await expect(invitee).toHaveURL(/\/dashboard/);
    await expect(invitee.getByText(/Hello, Ivy/)).toBeVisible();
    await expect(invitee.getByText(new RegExp(`how Acme Bakery ${stamp} is doing`, 'i'))).toBeVisible();

    // A viewer cannot edit the business profile (existing UI contract).
    await invitee.goto('/settings/business');
    await expect(invitee.locator('#bizName')).toBeDisabled();
  });
});
