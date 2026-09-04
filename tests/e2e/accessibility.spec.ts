import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';

import { Fixtures, PASSWORD, supabaseEnv } from './helpers/fixtures';
import { seedPublishedBankMonths, seedPublishedReminder, seedPublishedStatement } from './helpers/seed-statements';

// Phase 6 accessibility and mobile pass (§12, §14.20). Every client-portal
// route is checked against WCAG 2.1 A/AA with axe on a desktop viewport, and
// the shell is checked on a phone: the sidebar must become a drawer and no
// page may scroll sideways.
test.describe('Phase 6: accessibility and mobile', () => {
  test.skip(!supabaseEnv(), 'Supabase env not available');
  test.setTimeout(180_000);

  const fx = new Fixtures();
  const uploaded: string[] = [];
  test.afterAll(async () => {
    if (uploaded.length) await fx.admin.storage.from('documents').remove(uploaded);
    await fx.cleanup();
  });

  const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

  async function signIn(page: Page, email: string): Promise<void> {
    await page.goto('/signin');
    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  }

  /** A business with a published P&L, six months of bank activity and a reminder. */
  async function seedPortal(label: string) {
    const entityId = await fx.makeEntity(await fx.makeClientRow(label), `${label} Coffee LLC`);
    const member = await fx.makeUser(`${label}-member`);
    await fx.addMembership(entityId, member.id, 'client_owner');
    const pnl = await seedPublishedStatement(fx, entityId, 'letter-and-pnl', { uploaded });
    await seedPublishedBankMonths(fx, entityId);
    await seedPublishedReminder(fx, entityId, '2026-12-05');
    return { entityId, member, pnl };
  }

  test('every client-portal route passes WCAG 2.1 A/AA', async ({ browser }) => {
    const { member, pnl } = await seedPortal('a11y');
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await signIn(page, member.email);

    const period = `${pnl.period.start}_${pnl.period.end}`;
    const routes = [
      `/dashboard?period=${period}`,
      '/expenses',
      '/statements/profit-and-loss',
      '/statements/balance-sheet',
      '/taxes/income',
      '/reports',
      '/settings/profile',
      '/settings/notifications',
      '/settings/privacy',
      '/help',
      '/chat',
    ];

    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      const { violations } = await new AxeBuilder({ page })
        .withTags(TAGS)
        // Next's dev overlay is not part of the product.
        .exclude('nextjs-portal')
        .analyze();
      const summary = violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`);
      expect(summary, `${route} has accessibility violations`).toEqual([]);
    }
  });

  test('the sign-in page passes WCAG 2.1 A/AA', async ({ page }) => {
    await page.goto('/signin');
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).exclude('nextjs-portal').analyze();
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test('on a phone the sidebar is a drawer and nothing scrolls sideways', async ({ browser }) => {
    const { member, pnl } = await seedPortal('mobile');
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await signIn(page, member.email);

    for (const route of [`/dashboard?period=${pnl.period.start}_${pnl.period.end}`, '/expenses', '/statements/profit-and-loss']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      // The nav is not on screen at 390px: it lives behind the hamburger.
      await expect(page.getByRole('complementary', { name: /navigation/i })).toBeHidden();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${route} scrolls horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
    }

    // The drawer opens, traps focus in a dialog, and closes on Escape.
    await page.getByRole('button', { name: /open menu|menu/i }).first().click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('link', { name: /expenses/i })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });
});
