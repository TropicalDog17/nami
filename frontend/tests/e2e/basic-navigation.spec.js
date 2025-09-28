import { test, expect } from '@playwright/test';

test.describe('Basic Navigation', () => {
  test('should load the homepage', async ({ page }) => {
    await page.goto('/');

    // Check that the page loads
    await expect(page).toHaveTitle(/Nami/);

    // Check that the main headings are present (both in nav and page)
    await expect(page.locator('h1').first()).toContainText('Nami');
    await expect(
      page.locator('[data-testid="transactions-page-title"]')
    ).toBeVisible();

    // Check that navigation is present
    await expect(page.locator('nav.bg-white.shadow')).toBeVisible();
  });

  test('should navigate between pages', async ({ page }) => {
    await page.goto('/');

    // Test navigation to Transaction page (should already be there)
    await expect(
      page.locator('[data-testid="transactions-page-title"]')
    ).toBeVisible();

    // Test navigation to Admin page
    await page.click('nav a[href="/admin"]');
    await page.waitForURL('**/admin', { timeout: 10000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 });
    await expect(
      page.locator('[data-testid="admin-page-title"]')
    ).toBeVisible({ timeout: 10000 });

    // Test navigation to Reports page
    await page.click('nav a[href="/reports"]');
    await page.waitForURL('**/reports', { timeout: 10000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 });
    await expect(
      page.locator('[data-testid="reports-page-title"]')
    ).toBeVisible({ timeout: 10000 });

    // Navigate back to Transactions
    await page.click('nav a[href="/"]');
    await page.waitForURL('**/', { timeout: 10000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 });
    await expect(
      page.locator('[data-testid="transactions-page-title"]')
    ).toBeVisible({ timeout: 10000 });
  });

  test('should highlight active navigation item', async ({ page }) => {
    await page.goto('/');

    // Check that Transactions is active on homepage
    const transactionsLink = page.locator('nav a[href="/"]');
    await expect(transactionsLink).toHaveClass(/border-blue-500/);

    // Navigate to Admin and check active state
    await page.click('nav a[href="/admin"]');
    const adminLink = page.locator('nav a[href="/admin"]');
    await expect(adminLink).toHaveClass(/border-blue-500/);
  });
});
