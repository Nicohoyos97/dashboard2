import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { Fixtures, PASSWORD, supabaseEnv } from './helpers/fixtures';

// An avatar is stored at the size the portal shows it, not as picked
// (lib/images/downscale.ts): the portal draws it at 32–48 px on every page, and
// without Storage image transforms (a Pro-plan feature) what is stored is what
// every page downloads. Driven through the real form, because the resizing is
// a canvas in the browser.
test.describe('profile photo', () => {
  test.skip(!supabaseEnv(), 'Supabase env not available');

  const fx = new Fixtures();
  test.afterAll(() => fx.cleanup());

  test('is stored as a small WebP, not the file that was picked', async ({ page }) => {
    const tenant = await fx.makeTenant('avatar');
    await page.goto('/signin');
    await page.fill('#email', tenant.email);
    await page.fill('#password', PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto('/settings/profile');
    // The form will not save a profile without a name, and a fixture user has none.
    await page.locator('#fullName').fill('Avatar Owner');
    const picked = readFileSync('public/brand/icon.png'); // 512 × 512 PNG, ~110 kB
    await page.locator('input[type="file"]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: picked });
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();

    const { data: profile } = await fx.admin.from('profiles').select('avatar_url').eq('id', tenant.userId).single();
    expect(profile?.avatar_url).toMatch(/\.webp$/);
    const stored = await fetch(profile!.avatar_url!);
    expect(stored.headers.get('content-type')).toBe('image/webp');
    const bytes = (await stored.arrayBuffer()).byteLength;
    expect(bytes).toBeLessThan(picked.length / 2);

    // At most 256 px on a side: read back what the browser can decode of it.
    const side = await page.evaluate(async (url) => {
      const bitmap = await createImageBitmap(await (await fetch(url)).blob());
      return Math.max(bitmap.width, bitmap.height);
    }, profile!.avatar_url!);
    expect(side).toBe(256);
  });
});
