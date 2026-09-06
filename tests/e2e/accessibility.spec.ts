import AxeBuilder from '@axe-core/playwright';
import { type Page, expect, test } from '@playwright/test';

import { Fixtures, PASSWORD, supabaseEnv } from './helpers/fixtures';
import {
  seedPublishedBankMonths,
  seedPublishedReminder,
  seedPublishedStatement,
} from './helpers/seed-statements';

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

  /**
   * Fields small enough for iOS Safari to zoom into. It zooms the page in when
   * it focuses text under 16px and never zooms back out, so on a phone the
   * answer has to be none — see the media query at the foot of globals.css.
   */
  async function fieldsUnder16px(page: Page): Promise<string[]> {
    return page.evaluate(() =>
      [...document.querySelectorAll('input, select, textarea')]
        .filter((el) => !['checkbox', 'radio', 'hidden'].includes((el as HTMLInputElement).type))
        .filter((el) => Number.parseFloat(getComputedStyle(el).fontSize) < 16)
        .map(
          (el) =>
            `${el.tagName.toLowerCase()}#${el.id || (el as HTMLInputElement).name || '?'} ` +
            `at ${getComputedStyle(el).fontSize}`,
        ),
    );
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
    const page = await (
      await browser.newContext({ viewport: { width: 1280, height: 900 } })
    ).newPage();
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
    const { violations } = await new AxeBuilder({ page })
      .withTags(TAGS)
      .exclude('nextjs-portal')
      .analyze();
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  /** A conversation long enough to overflow any viewport. */
  async function seedLongThread(entityId: string, userId: string): Promise<string> {
    const { data } = await fx.admin
      .from('chat_sessions')
      .insert({ business_entity_id: entityId, user_id: userId, title: 'Long thread' })
      .select('id')
      .single();
    const sessionId = data?.id;
    if (!sessionId) throw new Error('could not seed a conversation');
    const base = Date.parse('2026-09-04T10:00:00Z');
    const rows = Array.from({ length: 14 }, (_, i) => [
      {
        session_id: sessionId,
        business_entity_id: entityId,
        role: 'user' as const,
        content: { text: `Question ${i + 1}: how did the business do, and what should I watch?` },
        created_at: new Date(base + i * 120_000).toISOString(),
      },
      {
        session_id: sessionId,
        business_entity_id: entityId,
        role: 'assistant' as const,
        content: {
          text: 'Revenue held up and expenses were flat. '.repeat(6),
          citations: [],
          toolCalls: [],
          model: 'fast',
          pendingAction: null,
          usage: { input: 10, output: 20 },
        },
        created_at: new Date(base + i * 120_000 + 60_000).toISOString(),
      },
    ]).flat();
    const { error } = await fx.admin.from('chat_messages').insert(rows);
    if (error) throw new Error(`could not seed the thread: ${error.message}`);
    return sessionId;
  }

  // A long conversation used to grow the document instead of the thread, which
  // pushed the composer off the bottom of the screen: the page had only a
  // min-height, so the thread's own overflow never engaged.
  test('a long conversation scrolls inside the thread, never past the composer', async ({
    browser,
  }) => {
    const { entityId, member } = await seedPortal('chatscroll');
    const sessionId = await seedLongThread(entityId, member.id);

    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 390, height: 780 },
    ]) {
      const page = await (await browser.newContext({ viewport })).newPage();
      await signIn(page, member.email);
      await page.goto(`/chat?session=${sessionId}`);
      await expect(page.getByRole('textbox', { name: /ask nick/i })).toBeVisible();
      await page.waitForLoadState('networkidle');

      const layout = await page.evaluate(() => {
        const composer = document.querySelector('textarea')?.getBoundingClientRect();
        const thread = document.querySelector('[aria-live="polite"]');
        return {
          documentOverflow: document.documentElement.scrollHeight - window.innerHeight,
          threadScrolls: thread ? thread.scrollHeight > thread.clientHeight : false,
          composerBottom: composer ? composer.bottom : Number.POSITIVE_INFINITY,
          viewportHeight: window.innerHeight,
        };
      });
      const size = `${viewport.width}x${viewport.height}`;
      expect(layout.documentOverflow, `${size}: the document itself scrolls`).toBeLessThanOrEqual(
        1,
      );
      expect(layout.threadScrolls, `${size}: the thread does not scroll`).toBe(true);
      expect(layout.composerBottom, `${size}: the composer is below the fold`).toBeLessThanOrEqual(
        layout.viewportHeight + 1,
      );
      await page.close();
    }
  });

  test('on a phone no field is small enough for iOS to zoom into', async ({ browser }) => {
    // The sign-in form is where this was reported: tapping Email zoomed the
    // page in and left it there, with the form half off screen.
    const page = await (
      await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      })
    ).newPage();

    for (const route of ['/signin', '/forgot-password', '/es/signin']) {
      await page.goto(route);
      expect(await fieldsUnder16px(page), `${route} has fields iOS will zoom into`).toEqual([]);
    }

    // And the designed sizes come back above the breakpoint, where no browser
    // zooms and 16px everywhere would be a heavier form than the design asks for.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/signin');
    expect(await fieldsUnder16px(page)).not.toEqual([]);
    await page.close();
  });

  test('on a phone the sidebar is a drawer and nothing scrolls sideways', async ({ browser }) => {
    const { member, pnl } = await seedPortal('mobile');
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await signIn(page, member.email);

    for (const route of [
      `/dashboard?period=${pnl.period.start}_${pnl.period.end}`,
      '/expenses',
      '/statements/profit-and-loss',
    ]) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      // The nav is not on screen at 390px: it lives behind the hamburger.
      await expect(page.getByRole('complementary', { name: /navigation/i })).toBeHidden();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${route} scrolls horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
      expect(await fieldsUnder16px(page), `${route} has fields iOS will zoom into`).toEqual([]);
    }

    // Back on the Overview: the desktop top bar is `hidden` at this width, so
    // the controls that live in it ride the compact bar instead — the bell
    // keeping its place at the theme toggle's left — and the Overview's own
    // Download Reports action becomes the right-aligned "Reports" button.
    // Exactly one of the two variants is on screen at any width.
    await page.goto(`/dashboard?period=${pnl.period.start}_${pnl.period.end}`);
    await expect(page.getByRole('button', { name: 'Download Reports' })).toBeHidden();
    const controls = await page
      .locator('header')
      .first()
      .evaluate((bar) =>
        [...bar.querySelectorAll('button')].map(
          (button) => button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '',
        ),
      );
    expect(controls).toHaveLength(4);
    expect(controls[1]).toMatch(/notification/i);
    expect(controls[2]).toMatch(/theme/i);
    expect(controls[3]).toBe('Reports');

    // Notifications open as a bar out of the header, spanning it: on a phone
    // there is no room for a card floating under the bell, and a panel aligned
    // to a bell that sits 56px from the right edge is a panel hanging off it.
    await page.getByRole('button', { name: /notification/i }).click();
    const panel = page.locator('[data-radix-popper-content-wrapper] > *').first();
    await expect(panel).toBeVisible();
    const bar = await panel.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const header = document.querySelector('header')!.getBoundingClientRect();
      return {
        x: box.x,
        width: box.width,
        top: box.y,
        headerBottom: header.bottom,
        viewport: window.innerWidth,
      };
    });
    expect(bar.x).toBe(0);
    expect(bar.width).toBe(bar.viewport);
    expect(Math.abs(bar.top - bar.headerBottom)).toBeLessThanOrEqual(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await page.keyboard.press('Escape');

    // Nick's composer opens without its placeholder on a phone: at the 16px iOS
    // demands, "Ask Nick about your finances…" reaches the edge of the box at
    // 390px and is cut on anything narrower.
    await page.getByRole('button', { name: /ask nick/i }).click();
    const composer = page.locator('#nick-composer');
    await expect(composer).toBeVisible();
    expect(await composer.evaluate((el) => getComputedStyle(el, '::placeholder').color)).toBe(
      'rgba(0, 0, 0, 0)',
    );
    await page.keyboard.press('Escape');

    // The drawer opens, traps focus in a dialog, and closes on Escape.
    await page
      .getByRole('button', { name: /open menu|menu/i })
      .first()
      .click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('link', { name: /expenses/i })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();

    // On a desktop it is the anchored card it has always been: narrower than
    // the window, and aligned to the bell rather than to the left edge.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`/dashboard?period=${pnl.period.start}_${pnl.period.end}`);
    await page.getByRole('button', { name: /notification/i }).click();
    const card = await page
      .locator('[data-radix-popper-content-wrapper] > *')
      .first()
      .evaluate((el) => {
        const box = el.getBoundingClientRect();
        return { x: box.x, width: box.width, viewport: window.innerWidth };
      });
    expect(card.width).toBeLessThan(card.viewport);
    expect(card.x).toBeGreaterThan(0);
    await page.keyboard.press('Escape');

    // …and the composer's placeholder is back, where there is room for it.
    await page
      .getByRole('button', { name: /ask nick/i })
      .first()
      .click();
    expect(
      await page
        .locator('#nick-composer')
        .evaluate((el) => getComputedStyle(el, '::placeholder').color),
    ).not.toBe('rgba(0, 0, 0, 0)');
  });
});
