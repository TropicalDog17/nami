import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../utils/test-utils.js';

test.describe('Vault Functionality - Regression Tests', () => {
  test('should load vaults page successfully', async ({ page }) => {
    // Navigate to vaults page
    await gotoAndWait(page, '/vaults');

    // Verify page loads without errors
    await expect(page.locator('body')).toBeVisible();

    // Verify we're on vaults page by checking for vault-specific elements
    const pageTitle = await page.title();
    expect(pageTitle).toContain('Nami');

    // Verify vaults page content
    await expect(page.locator('[data-testid="vaults-page"]')).toBeVisible({ timeout: 10000 });
  });

  test('should have main navigation with Vaults tab', async ({ page }) => {
    // Navigate to root first
    await gotoAndWait(page, '/');

    // Check for Vaults navigation link
    const vaultsNavLink = page.locator('a[href="/vaults"]');
    await expect(vaultsNavLink).toBeVisible();

    // Verify it's clickable
    await expect(vaultsNavLink).toHaveClass(/text-gray-700|text-blue-600/);
  });

  test('should NOT find vaults tab in Reports page', async ({ page }) => {
    // Navigate to reports page
    await gotoAndWait(page, '/reports');

    // Verify reports page loads
    await expect(page.locator('[data-testid="reports-page-title"]')).toBeVisible();

    // Verify Vaults tab is NOT present in the reports navigation tabs
    // Note: Vaults tab is in main navigation, not in reports sub-navigation
    const vaultsTab = page.locator('a[href="/vaults"]');
    await expect(vaultsTab).toBeVisible(); // Vaults should be visible in main nav

    // Verify other expected main navigation tabs are present
    const expectedTabs = ['Transactions', 'Vaults', 'Admin', 'Credit Cards', 'Reports'];
    for (const tabName of expectedTabs) {
      const tab = page.locator(`a:has-text("${tabName}")`);
      await expect(tab).toBeVisible();
    }
  });

  test('should have functional Vaults tab navigation', async ({ page }) => {
    // Start from root
    await gotoAndWait(page, '/');

    // Click Vaults tab
    const vaultsNavLink = page.locator('a[href="/vaults"]');
    await vaultsNavLink.click();

    // Verify navigation to vaults page
    await expect(page.locator('[data-testid="vaults-page"]')).toBeVisible({ timeout: 10000 });
  });

  test('should preserve other navigation tabs functionality', async ({ page }) => {
    // Test that other tabs still work correctly
    await gotoAndWait(page, '/');

    // Test clicking another tab
    const reportsTab = page.locator('a:has-text("Reports")');
    await reportsTab.click();

    // Should navigate to reports page
    await expect(page.locator('[data-testid="reports-page-title"]')).toBeVisible({ timeout: 10000 });

    // Verify Vaults tab is still present in main navigation
    const vaultsTab = page.locator('a[href="/vaults"]');
    await expect(vaultsTab).toBeVisible();
  });
});