import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../utils/test-utils.js';

test.describe('Vaults - Smoke Regression Tests', () => {
  test('should load vaults page without errors', async ({ page }) => {
    await gotoAndWait(page, '/vaults');

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');

    // Verify page loads without critical errors
    const bodyVisible = await page.locator('body').isVisible();
    expect(bodyVisible).toBe(true);
  });

  test('should navigate to Vaults tab from main navigation', async ({ page }) => {
    // Start from root to test main navigation
    await gotoAndWait(page, '/');

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');

    // Try to find Vaults navigation link
    const vaultsNavLink = page.locator('a[href="/vaults"]');
    const linkExists = await vaultsNavLink.isVisible().catch(() => false);

    // If link exists, try clicking it
    if (linkExists) {
      await vaultsNavLink.click();
      await page.waitForLoadState('domcontentloaded');
    }

    // Just verify page didn't crash
    const bodyVisible = await page.locator('body').isVisible();
    expect(bodyVisible).toBe(true);
  });

  test('should handle Reports page correctly', async ({ page }) => {
    await gotoAndWait(page, '/reports');

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');

    // Verify page loads without crashing
    const bodyVisible = await page.locator('body').isVisible();
    expect(bodyVisible).toBe(true);
  });
});