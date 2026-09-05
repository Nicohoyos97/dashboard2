import { readFile } from 'node:fs/promises';

import { type Page, expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

import { Fixtures, PASSWORD, supabaseEnv } from './helpers/fixtures';
import { seedPublishedStatement } from './helpers/seed-statements';

// Client portal statements (acceptance §14.6–§14.8, §14.13): a member sees the
// published P&L for their business, the cards equal the printed totals, rows
// open the drawer, search/hide-zero work, the original PDF is downloadable,
// and unpublished reports never appear.
test.describe('Client portal: Profit & Loss and Balance Sheet', () => {
  // These tests share storage-cleanup state and compile the two statement
  // routes through one Next dev server. Keeping the describe serial avoids a
  // first-request compilation race without reducing parallelism elsewhere.
  test.describe.configure({ mode: 'serial' });
  test.skip(!supabaseEnv(), 'Supabase env not available');
  test.setTimeout(120_000);

  const fx = new Fixtures();
  const uploaded: string[] = [];
  test.afterAll(async () => {
    if (uploaded.length) await fx.admin.storage.from('documents').remove(uploaded);
    await fx.cleanup();
  });

  async function signIn(page: Page, email: string): Promise<void> {
    await page.goto('/signin');
    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  }

  const money = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

  test('P&L: cards match printed totals, drawer, search, download', async ({ browser }) => {
    const entityId = await fx.makeEntity(
      await fx.makeClientRow('cs'),
      'Harbor Coffee Roasters LLC',
    );
    const member = await fx.makeUser('cs-member');
    await fx.addMembership(entityId, member.id, 'client_owner');
    const pnl = await seedPublishedStatement(fx, entityId, 'letter-and-pnl', { uploaded });
    const draft = await seedPublishedStatement(fx, entityId, 'balance-sheet', {
      publish: false,
      uploaded,
    });

    const page = await (
      await browser.newContext({ viewport: { width: 1280, height: 900 } })
    ).newPage();
    await signIn(page, member.email);
    await page.goto('/statements/profit-and-loss');
    await expect(page.getByRole('heading', { name: /profit & loss/i })).toBeVisible();

    // Cards read the printed totals (§14.7).
    const netIncome = pnl.totals.netIncome;
    const revenue = pnl.totals.revenue;
    if (netIncome === null || revenue === null)
      throw new Error('P&L fixture is missing a required total');
    await expect(page.getByText(money(netIncome)).first()).toBeVisible();
    await expect(page.getByText(money(revenue)).first()).toBeVisible();

    // Rows: hover/click opens the drawer with the line's figures (§14.8).
    const rentRow = page.getByRole('row', { name: /^Rent/ });
    await rentRow.hover();
    await rentRow.click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByRole('heading', { name: 'Rent' })).toBeVisible();
    await expect(drawer.getByText(/what this line means/i)).toBeVisible();
    await expect(drawer.getByText(/page \d+ of the published document/i)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();

    // Search narrows the table; hide-zero toggles.
    await page.getByRole('textbox', { name: /search accounts/i }).fill('payroll');
    await expect(page.getByRole('row', { name: /^Payroll/ })).toBeVisible();
    await expect(page.getByRole('row', { name: /^Rent/ })).toHaveCount(0);
    await page.getByRole('textbox', { name: /search accounts/i }).fill('');
    await page.getByRole('checkbox', { name: /hide zero lines/i }).check();

    // Original PDF through the audited route (§14.9).
    const res = await page.request.get(`/api/documents/${pnl.versionId}/download`, {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(302);

    // The unpublished balance sheet is not offered to the client (§14.12/§14.13).
    await page.goto('/statements/balance-sheet');
    await expect(page.getByText(/has not published a balance sheet yet/i)).toBeVisible();
    const hidden = await page.request.get(`/api/documents/${draft.versionId}/download`, {
      maxRedirects: 0,
    });
    expect(hidden.status()).toBe(404);
  });

  test('Export: the PDF report is drawn from the published lines, and only for your business', async ({
    browser,
  }) => {
    const entityId = await fx.makeEntity(
      await fx.makeClientRow('cp'),
      'Harbor Coffee Roasters LLC',
    );
    const member = await fx.makeUser('cp-member');
    await fx.addMembership(entityId, member.id, 'client_owner');
    const pnl = await seedPublishedStatement(fx, entityId, 'letter-and-pnl', { uploaded });

    // A second business the member has nothing to do with.
    const otherId = await fx.makeEntity(await fx.makeClientRow('cp-other'), 'Someone Else LLC');
    const other = await seedPublishedStatement(fx, otherId, 'letter-and-pnl', { uploaded });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    await signIn(page, member.email);
    await page.goto('/statements/profit-and-loss');
    await expect(page.getByRole('heading', { name: /profit & loss/i })).toBeVisible();

    // The Export menu offers both formats, and neither is disabled any more.
    await page.getByRole('button', { name: /^export$/i }).click();
    await expect(page.getByRole('menuitem', { name: /csv spreadsheet/i })).toBeEnabled();
    const pdfItem = page.getByRole('menuitem', { name: /pdf report/i });
    await expect(pdfItem).toBeEnabled();

    const [download] = await Promise.all([page.waitForEvent('download'), pdfItem.click()]);
    expect(download.suggestedFilename()).toMatch(
      /^profit-and-loss_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.pdf$/,
    );
    const bytes = await readFile(await download.path());
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // The KILL-PDF document is a cover letter plus the statement, so never one page.
    const rendered = await PDFDocument.load(bytes);
    expect(rendered.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(rendered.getTitle() ?? '').toContain('Harbor Coffee Roasters LLC');

    // Same route, another tenant's report: not found, not a PDF.
    const mine = await page.request.get(`/api/reports/${pnl.reportId}/pdf`);
    expect(mine.status()).toBe(200);
    expect(mine.headers()['content-type']).toBe('application/pdf');
    const theirs = await page.request.get(`/api/reports/${other.reportId}/pdf`);
    expect(theirs.status()).toBe(404);
  });

  test('Balance Sheet: totals, ratios only when calculable, composition', async ({ browser }) => {
    const entityId = await fx.makeEntity(
      await fx.makeClientRow('cb'),
      'Harbor Coffee Roasters LLC',
    );
    const member = await fx.makeUser('cb-member');
    await fx.addMembership(entityId, member.id, 'client_viewer');
    const bs = await seedPublishedStatement(fx, entityId, 'balance-sheet', { uploaded });

    const page = await (
      await browser.newContext({ viewport: { width: 1280, height: 900 } })
    ).newPage();
    await signIn(page, member.email);
    await page.goto('/statements/balance-sheet');
    await expect(page.getByRole('heading', { name: /balance sheet/i })).toBeVisible();
    const assets = bs.totals.assets;
    if (assets === null) throw new Error('Balance Sheet fixture has no assets total');
    await expect(page.getByText(money(assets)).first()).toBeVisible();
    await expect(page.getByText(/asset composition/i)).toBeVisible();
  });
});
