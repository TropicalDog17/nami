import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../utils/test-utils.js';

test.describe('Reports - Minimal', () => {
  test('renders reports page shell and summary sections', async ({ page }) => {
    await gotoAndWait(page, '/reports');
    await expect(page.locator('[data-testid="reports-page-title"]')).toBeVisible({ timeout: 10000 });
    // Summaries/charts may be empty but containers should render
    const hasSummary = await page.locator('text=/Summary|P&L|Asset Allocation/i').first().isVisible().catch(() => false);
    expect(hasSummary).toBeTruthy();
  });
});
