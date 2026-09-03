import { type Page, expect, test } from '@playwright/test';

import { Fixtures, PASSWORD, supabaseEnv } from './helpers/fixtures';
import { seedPublishedStatement } from './helpers/seed-statements';

// Nick acceptance (§14.10–§14.11): a member asks about a selected statement
// line and gets an answer citing the right report, period and page; a
// download link is issued only after an explicit confirmation turn.
//
// The Messages API is mocked by tests/e2e/helpers/anthropic-mock-server.ts,
// which playwright.config starts when NICK_E2E=1 and points the dev server
// at through ANTHROPIC_BASE_URL. Stop any other dev server first, then run:
//   NICK_E2E=1 pnpm test:e2e tests/e2e/nick.spec.ts
test.describe('Nick: cited line explanations and confirmed downloads', () => {
  test.describe.configure({ mode: 'serial' });
  test.skip(
    !supabaseEnv() || process.env.NICK_E2E !== '1',
    'Needs local Supabase and NICK_E2E=1 (mocked Anthropic)',
  );
  test.setTimeout(120_000);

  const fx = new Fixtures();
  const uploaded: string[] = [];
  let entityId = '';
  let memberEmail = '';
  let pnl: Awaited<ReturnType<typeof seedPublishedStatement>>;

  test.beforeAll(async () => {
    entityId = await fx.makeEntity(await fx.makeClientRow('nick'), 'Harbor Coffee Roasters LLC');
    const member = await fx.makeUser('nick-member');
    memberEmail = member.email;
    await fx.addMembership(entityId, member.id, 'client_owner');
    pnl = await seedPublishedStatement(fx, entityId, 'letter-and-pnl', { uploaded });
  });

  test.afterAll(async () => {
    if (uploaded.length) await fx.admin.storage.from('documents').remove(uploaded);
    await fx.cleanup();
  });

  async function signIn(page: Page): Promise<void> {
    await page.goto('/signin');
    await page.fill('#email', memberEmail);
    await page.fill('#password', PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  }

  test('explains the selected line and cites the report, period and page (§14.10)', async ({
    browser,
  }) => {
    const page = await (
      await browser.newContext({ viewport: { width: 1280, height: 900 } })
    ).newPage();
    await signIn(page);
    // Shell (sidebar + top bar) in both themes, for the visual record.
    await expect(page.getByRole('toolbar')).toBeVisible();
    await page.screenshot({ path: 'test-results/shell-overview-light.png' });
    await page
      .getByRole('toolbar')
      .getByRole('button', { name: /switch to dark theme/i })
      .click();
    await page.waitForTimeout(400); // colour transitions settle
    await page.screenshot({ path: 'test-results/shell-overview-dark.png' });
    await page
      .getByRole('toolbar')
      .getByRole('button', { name: /switch to light theme/i })
      .click();
    await page.waitForTimeout(400);
    await page.goto('/statements/profit-and-loss');
    await expect(page.getByRole('heading', { name: /profit & loss/i })).toBeVisible();

    await page
      .getByRole('row', { name: /^Net Income\b/ })
      .first()
      .click();
    const drawer = page.getByRole('dialog', { name: /^Net Income$/ });
    await expect(drawer).toBeVisible();
    await drawer.getByRole('button', { name: /ask nick about this line/i }).click();

    const panel = page.getByRole('dialog', { name: /ask nick/i });
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/About: Net Income/)).toBeVisible();
    await panel.getByRole('button', { name: /^explain this line$/i }).click();

    await expect(panel.getByText(/is the amount printed on your statement/i)).toBeVisible({
      timeout: 30_000,
    });
    const chip = panel.getByRole('link', { name: /Profit & Loss.*Page \d+.*Net Income/ }).first();
    await expect(chip).toBeVisible();
    await page.screenshot({ path: 'test-results/nick-panel-desktop.png' });

    // The persisted citation points at the exact line: same report, same page, same period.
    const { data: line } = await fx.admin
      .from('financial_statement_lines')
      .select('id, page_number')
      .eq('report_id', pnl.reportId)
      .ilike('account_name', 'net income')
      .maybeSingle();
    const { data: citations } = await fx.admin
      .from('chat_citations')
      .select('report_id, line_id, page_number, period_start, period_end, source')
      .eq('business_entity_id', entityId);
    expect(citations?.length).toBeGreaterThan(0);
    const cited = citations?.find((c) => c.line_id === line?.id);
    expect(cited).toBeDefined();
    expect(cited?.report_id).toBe(pnl.reportId);
    expect(cited?.page_number).toBe(line?.page_number);
    expect(cited?.period_start).toBe(pnl.period.start);
    expect(cited?.period_end).toBe(pnl.period.end);
    expect(cited?.source).toBe('firm_document');
    await page.context().close();
  });

  test('issues a download link only after the user confirms (§14.11)', async ({ browser }) => {
    const page = await (
      await browser.newContext({ viewport: { width: 1280, height: 900 } })
    ).newPage();
    await signIn(page);
    await page.goto('/chat');
    await expect(page.getByRole('button', { name: /show conversation history/i })).toBeVisible();

    const composer = page.locator('#nick-composer');
    await expect(composer).toHaveCount(1);
    await composer.fill('Download the P&L');
    await composer.press('Enter');
    await expect(page.getByText(/Do you want me to proceed\?/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('a[href^="/api/documents/"]')).toHaveCount(0);

    await composer.fill('yes please');
    await composer.press('Enter');
    const link = page.getByRole('link', { name: /download file/i });
    await expect(link).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: 'test-results/nick-chat-desktop.png' });
    const href = await link.getAttribute('href');
    expect(href).toBe(`/api/documents/${pnl.versionId}/download`);

    // The link authorizes per click: a signed URL is minted only when followed.
    const response = await page.request.get(href ?? '', { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    expect(response.headers().location).toContain('/storage/v1/object/sign/documents/');

    // §14.20: on a phone the panel is full-screen.
    const phone = await (
      await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })
    ).newPage();
    await signIn(phone);
    await phone.goto('/statements/profit-and-loss');
    await phone.getByRole('button', { name: /ask nick/i }).click();
    const mobilePanel = phone.getByRole('dialog', { name: /ask nick/i });
    await expect(mobilePanel).toBeVisible();
    const box = await mobilePanel.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(380);
    expect(box?.height).toBeGreaterThanOrEqual(800);
    await phone.screenshot({ path: 'test-results/nick-panel-mobile.png' });

    const { data: audit } = await fx.admin
      .from('audit_logs')
      .select('action')
      .eq('business_entity_id', entityId);
    const actions = (audit ?? []).map((row) => row.action);
    expect(actions).toContain('chat.download_link.issued');
    expect(actions).toContain('chat.message.sent');
    await phone.context().close();
    await page.context().close();
  });
});
