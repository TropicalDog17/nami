import { test, expect } from '@playwright/test';

test.describe('Vault Management Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="transactions-page-title"]', { timeout: 15000 });
  });

  test('should navigate to vault management page', async ({ page }) => {
    // Click on Vaults navigation
    await page.click('a[href="/vaults"]');

    // Should navigate to /vaults
    await expect(page).toHaveURL(/vaults$/);

    // Should show vault management header - scope to main content to avoid duplicate headings
    const main = page.locator('main');
    await expect(main.getByRole('heading', { level: 1, name: /Vault Management|Vaults/i })).toBeVisible();
  });

  test('should show vault cards when vaults exist', async ({ page }) => {
    // This test assumes there are vaults in the system
    // In a real test, you would first create test vaults via the API

    // Navigate to vault management page
    await page.goto('/vaults');

    // Check for vault management section - scope to main to avoid strict-mode violation
    const main = page.locator('main');
    await expect(main.getByRole('heading', { level: 1, name: /Vault Management/i })).toBeVisible();

    // Should either show vault cards or "No vaults found" message
    const hasVaultCards = await page.locator('[data-testid="vault-card"]').count();
    const hasEmptyMessage = await page.locator('text=No vaults found').count();

    // Should have either vault cards or empty message
    expect(hasVaultCards + hasEmptyMessage).toBeGreaterThan(0);
  });

  test('should have clickable vault elements when vaults exist', async ({ page }) => {
    // Navigate to vault management page
    await page.goto('/vaults');

    // Wait for potential vault cards to load
    await page.waitForTimeout(2000);

    // Check if there are vault cards
    const vaultCards = page.locator('[data-testid="vault-card"]');
    const cardCount = await vaultCards.count();

    if (cardCount > 0) {
      // Check that vault cards are clickable
      const firstVault = vaultCards.first();
      await expect(firstVault).toBeVisible();

      // Check for view details button
      const viewDetailsButton = firstVault.locator('button[title*="View Details"]');
      await expect(viewDetailsButton).toBeVisible();

      // Should be able to click view details
      await viewDetailsButton.click();

      // Should navigate to vault detail page
      await expect(page).toHaveURL(/vault\//);
    }
  });

  test('should return to transactions page from vault detail', async ({ page }) => {
    // Go to vault detail page (using a sample vault name)
    await page.goto('/vault/test-vault');

    // Should show back button
    const backButton = page.locator('text=Back to Transactions');
    await expect(backButton).toBeVisible();

    // Click back button
    await backButton.click();

    // Should return to transactions page (explicit route)
    await expect(page).toHaveURL(/\/transactions$/);
  });
});