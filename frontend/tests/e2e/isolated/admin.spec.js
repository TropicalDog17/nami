import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../utils/test-utils.js';

test.describe('Admin - Minimal', () => {
  test('renders admin page shell and tabs', async ({ page }) => {
    await gotoAndWait(page, '/admin');
    await expect(page.locator('[data-testid="admin-page-title"]')).toBeVisible({ timeout: 10000 });
    // Tabs exist (do not require data): Transaction Types, Accounts, Assets, Tags
    await expect(page.locator('button:has-text("Transaction Types")')).toBeVisible();
    await expect(page.locator('button:has-text("Accounts")')).toBeVisible();
    await expect(page.locator('button:has-text("Assets")')).toBeVisible();
    await expect(page.locator('button:has-text("Tags")')).toBeVisible();
  });
});
