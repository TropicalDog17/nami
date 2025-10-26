import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../utils/test-utils.js';

test.describe('Credits - Minimal', () => {
  test('renders credit dashboard page shell and summary sections', async ({ page }) => {
    await gotoAndWait(page, '/credit');
    await expect(page.locator('[data-testid="credit-dashboard-page-title"]')).toBeVisible({ timeout: 10000 });
  });
});
