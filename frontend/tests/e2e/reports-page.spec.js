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

  test('should display spending charts and daily breakdown', async ({ page }) => {
    await page.goto('/reports');
    await page.locator('button:has-text("Spending")').click();

    // Filters should be visible for spending
    await expect(page.locator('[data-testid="reports-filters-title"]')).toContainText('Filters');

    // Charts containers should render (if backend returns data)
    // We only assert presence of section title to avoid flakiness when data empty
    await expect(page.locator('text=Spending by Tag')).toBeVisible();
    await expect(page.locator('text=Daily Spending Trend')).toBeVisible();
  });

  test('should display P&L summary cards', async ({ page }) => {
    await page.goto('/reports');
    await page.locator('button:has-text("P&L")').click();
    await expect(page.locator('text=Realized P&L')).toBeVisible();
    await expect(page.locator('text=Total P&L')).toBeVisible();
  });

  test('should display asset allocation charts and table', async ({ page }) => {
    await page.goto('/reports');
    await page.locator('button:has-text("Asset Allocation")').click();

    // Filters visible
    await expect(page.locator('[data-testid="reports-filters-title"]')).toContainText('Filters');

    // Sections present even if data is empty (titles visible)
    await expect(page.locator('text=Asset Distribution')).toBeVisible();
    await expect(page.locator('text=Breakdown by Asset')).toBeVisible();
  });

  test('should display investments list UI', async ({ page }) => {
    await page.goto('/reports');
    await page.locator('button:has-text("Investments")').click();

    // Columns headers present
    await expect(page.locator('text=Asset')).toBeVisible();
    await expect(page.locator('text=Account')).toBeVisible();
    await expect(page.locator('text=Deposit Qty')).toBeVisible();
    await expect(page.locator('text=Remaining Qty')).toBeVisible();
  });
});
