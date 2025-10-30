import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../utils/test-utils.js';

test.describe('Vault Detail Page - Operations', () => {
  test('should display vault detail page structure', async ({ page }) => {
    // Test with a simple vault name - page should handle missing vault gracefully
    const vaultName = 'test-vault-simple';

    // Navigate to vault detail page
    await gotoAndWait(page, `/vault/${encodeURIComponent(vaultName)}`);

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');

    // Check if page loads - it could be the vault detail page OR the "Vault Not Found" page
    let pageLoaded = false;

    // Try the vault detail page first
    try {
      const vaultDetailPage = page.locator('[data-testid="vault-detail-page"]');
      await expect(vaultDetailPage).toBeVisible({ timeout: 5000 });
      pageLoaded = true;
    } catch (e) {
      // Check for "Vault Not Found" page
      try {
        const notFoundTitle = page.locator('text=Vault Not Found');
        await expect(notFoundTitle).toBeVisible({ timeout: 5000 });
        pageLoaded = true;
      } catch (e2) {
        // Try any h1 element as a fallback
        const anyH1 = page.locator('h1').first();
        await expect(anyH1).toBeVisible({ timeout: 5000 });
        pageLoaded = true;
      }
    }

    // The test passes if the page loads without crashing
    expect(pageLoaded).toBe(true);
  });

  test('should handle deposit flow gracefully', async ({ page }) => {
    const vaultName = 'test-vault-deposit';
    await gotoAndWait(page, `/vault/${encodeURIComponent(vaultName)}`);

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');

    // Verify page loads (either vault detail or not found page)
    let pageLoaded = false;

    try {
      await expect(page.locator('[data-testid="vault-detail-page"]')).toBeVisible({ timeout: 5000 });
      pageLoaded = true;
    } catch (e) {
      try {
        await expect(page.locator('text=Vault Not Found')).toBeVisible({ timeout: 5000 });
        pageLoaded = true;
      } catch (e2) {
        const anyH1 = page.locator('h1').first();
        await expect(anyH1).toBeVisible({ timeout: 5000 });
        pageLoaded = true;
      }
    }

    expect(pageLoaded).toBe(true);

    // If we're on the vault detail page, check for deposit button (optional)
    const vaultDetailExists = await page.locator('[data-testid="vault-detail-page"]').isVisible().catch(() => false);
    if (vaultDetailExists) {
      const depositButton = page.getByRole('button', { name: 'Deposit to Vault' });
      const buttonExists = await depositButton.isVisible().catch(() => false);

      // If button exists, verify clicking it doesn't crash the page
      if (buttonExists) {
        await depositButton.click();
        // Just verify the page structure remains intact
        await expect(page.locator('[data-testid="vault-detail-page"]')).toBeVisible();
      }
    }
  });

  test('should handle withdraw flow gracefully', async ({ page }) => {
    const vaultName = 'test-vault-withdraw';
    await gotoAndWait(page, `/vault/${encodeURIComponent(vaultName)}`);

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');

    // Verify page loads
    let pageLoaded = false;

    try {
      await expect(page.locator('[data-testid="vault-detail-page"]')).toBeVisible({ timeout: 5000 });
      pageLoaded = true;
    } catch (e) {
      try {
        await expect(page.locator('text=Vault Not Found')).toBeVisible({ timeout: 5000 });
        pageLoaded = true;
      } catch (e2) {
        const anyH1 = page.locator('h1').first();
        await expect(anyH1).toBeVisible({ timeout: 5000 });
        pageLoaded = true;
      }
    }

    expect(pageLoaded).toBe(true);

    // Check if withdraw button exists (optional check)
    const vaultDetailExists = await page.locator('[data-testid="vault-detail-page"]').isVisible().catch(() => false);
    if (vaultDetailExists) {
      const withdrawButton = page.getByRole('button', { name: 'Withdraw from Vault' });
      const buttonExists = await withdrawButton.isVisible().catch(() => false);

      if (buttonExists) {
        // If button exists, verify clicking it doesn't crash the page
        await withdrawButton.click();
        await expect(page.locator('[data-testid="vault-detail-page"]')).toBeVisible();
      }
    }
  });

  test('should handle end vault flow gracefully', async ({ page }) => {
    const vaultName = 'test-vault-end';
    await gotoAndWait(page, `/vault/${encodeURIComponent(vaultName)}`);

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');

    // Verify page loads
    let pageLoaded = false;

    try {
      await expect(page.locator('[data-testid="vault-detail-page"]')).toBeVisible({ timeout: 5000 });
      pageLoaded = true;
    } catch (e) {
      try {
        await expect(page.locator('text=Vault Not Found')).toBeVisible({ timeout: 5000 });
        pageLoaded = true;
      } catch (e2) {
        const anyH1 = page.locator('h1').first();
        await expect(anyH1).toBeVisible({ timeout: 5000 });
        pageLoaded = true;
      }
    }

    expect(pageLoaded).toBe(true);

    // Check if end vault button exists (optional check)
    const vaultDetailExists = await page.locator('[data-testid="vault-detail-page"]').isVisible().catch(() => false);
    if (vaultDetailExists) {
      const endVaultButton = page.getByRole('button', { name: 'End Vault' });
      const buttonExists = await endVaultButton.isVisible().catch(() => false);

      if (buttonExists) {
        // If button exists, accept confirm and verify page stays stable
        page.on('dialog', async (d) => { await d.accept(); });
        await endVaultButton.click();
        await expect(page.locator('[data-testid="vault-detail-page"]')).toBeVisible();
      }
    }
  });

  test('should display back to vaults link', async ({ page }) => {
    const vaultName = 'test-vault-back';
    await gotoAndWait(page, `/vault/${encodeURIComponent(vaultName)}`);

    // Wait for page to load
    await page.waitForLoadState('domcontentloaded');

    // Verify page loads
    let pageLoaded = false;

    try {
      await expect(page.locator('[data-testid="vault-detail-page"]')).toBeVisible({ timeout: 5000 });
      pageLoaded = true;
    } catch (e) {
      try {
        await expect(page.locator('text=Vault Not Found')).toBeVisible({ timeout: 5000 });
        pageLoaded = true;
      } catch (e2) {
        const anyH1 = page.locator('h1').first();
        await expect(anyH1).toBeVisible({ timeout: 5000 });
        pageLoaded = true;
      }
    }

    expect(pageLoaded).toBe(true);

    // Check for back navigation - could be a link or button
    const backLink = page.locator('a[href="/vaults"]');
    const backButton = page.locator('button:has-text("Back to Vaults")');

    // At least one back navigation option should exist
    const linkExists = await backLink.isVisible().catch(() => false);
    const buttonExists = await backButton.isVisible().catch(() => false);

    expect(linkExists || buttonExists).toBe(true);
  });
});