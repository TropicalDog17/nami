import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../utils/test-utils.js';

test.describe('Isolated Smoke', () => {
  test('frontend loads and shows Nami header', async ({ page }) => {
    await gotoAndWait(page, '/');
    await expect(page).toHaveTitle(/Nami/);
    // Accept either a visible h1 or app root exists
    const hasHeader = await page.locator('h1').first().isVisible().catch(() => false);
    const hasRoot = await page.locator('#root').isVisible().catch(() => false);
    expect(hasHeader || hasRoot).toBeTruthy();
  });
});


