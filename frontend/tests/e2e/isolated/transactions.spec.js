import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../utils/test-utils.js';

test.describe('Transactions - Minimal', () => {
  test('loads transactions page shell', async ({ page }) => {
    await gotoAndWait(page, '/');
    await expect(page.locator('[data-testid="transactions-page-title"]')).toBeVisible({ timeout: 10000 });
  });
});
