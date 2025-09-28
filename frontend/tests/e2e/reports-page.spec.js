import { test, expect } from '@playwright/test';

test.describe('Reports Page', () => {
  test('should display reports interface', async ({ page }) => {
    await page.goto('/reports');

    // Check main heading
    await expect(page.locator('[data-testid="reports-page-title"]')).toContainText('Reports & Analytics');

    // Check description
    await expect(page.locator('text=View comprehensive financial reports including holdings, cash flow analysis, and profit & loss statements.')).toBeVisible();

    // Check all report tabs
    await expect(page.locator('button:has-text("Holdings")')).toBeVisible();
    await expect(page.locator('button:has-text("Cash Flow")')).toBeVisible();
    await expect(page.locator('button:has-text("Spending")')).toBeVisible();
    await expect(page.locator('button:has-text("P&L")')).toBeVisible();
  });

  test('should have working report tabs', async ({ page }) => {
    await page.goto('/reports');

    // Test all report tabs are clickable
    const holdingsTab = page.locator('button:has-text("Holdings")');
    await expect(holdingsTab).toBeEnabled();

    const cashflowTab = page.locator('button:has-text("Cash Flow")');
    await expect(cashflowTab).toBeEnabled();

    const spendingTab = page.locator('button:has-text("Spending")');
    await expect(spendingTab).toBeEnabled();

    const pnlTab = page.locator('button:has-text("P&L")');
    await expect(pnlTab).toBeEnabled();
  });
});
