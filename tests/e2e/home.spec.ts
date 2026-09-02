import { expect, test } from '@playwright/test';

test('home page loads and has the correct title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Hoyos Baker/);
});
