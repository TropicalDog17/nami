import { test, expect } from '@playwright/test';

test.describe('Reports Page', () => {
  test('should display reports interface', async ({ page }) => {
    await page.goto('/reports');
    
    // Check main heading
    await expect(page.locator('h2')).toContainText('Reports & Analytics');
    
    // Check description
    await expect(page.locator('text=View holdings, cash flow, spending analysis, and P&L reports')).toBeVisible();
    
    // Check all report cards
    await expect(page.locator('text=Holdings')).toBeVisible();
    await expect(page.locator('text=Cash Flow')).toBeVisible();
    await expect(page.locator('text=Spending')).toBeVisible();
    await expect(page.locator('text=P&L')).toBeVisible();
  });

  test('should display report cards with descriptions', async ({ page }) => {
    await page.goto('/reports');
    
    // Check Holdings card
    await expect(page.locator('text=Current asset positions and valuations')).toBeVisible();
    await expect(page.locator('button:has-text("View Holdings")')).toBeVisible();
    
    // Check Cash Flow card
    await expect(page.locator('text=Income and expense flow analysis')).toBeVisible();
    await expect(page.locator('button:has-text("View Cash Flow")')).toBeVisible();
    
    // Check Spending card
    await expect(page.locator('text=Spending breakdown by category')).toBeVisible();
    await expect(page.locator('button:has-text("View Spending")')).toBeVisible();
    
    // Check P&L card
    await expect(page.locator('text=Profit & loss with ROI analysis')).toBeVisible();
    await expect(page.locator('button:has-text("View P&L")')).toBeVisible();
  });

  test('should display currency toggle section', async ({ page }) => {
    await page.goto('/reports');
    
    // Check currency toggle section
    await expect(page.locator('text=Currency Toggle')).toBeVisible();
    await expect(page.locator('button:has-text("USD View")')).toBeVisible();
    await expect(page.locator('button:has-text("VND View")')).toBeVisible();
  });

  test('should have working report buttons', async ({ page }) => {
    await page.goto('/reports');
    
    // Test all report buttons are clickable
    const viewHoldingsBtn = page.locator('button:has-text("View Holdings")');
    await expect(viewHoldingsBtn).toBeEnabled();
    
    const viewCashFlowBtn = page.locator('button:has-text("View Cash Flow")');
    await expect(viewCashFlowBtn).toBeEnabled();
    
    const viewSpendingBtn = page.locator('button:has-text("View Spending")');
    await expect(viewSpendingBtn).toBeEnabled();
    
    const viewPnLBtn = page.locator('button:has-text("View P&L")');
    await expect(viewPnLBtn).toBeEnabled();
    
    // Test currency toggle buttons
    const usdViewBtn = page.locator('button:has-text("USD View")');
    await expect(usdViewBtn).toBeEnabled();
    
    const vndViewBtn = page.locator('button:has-text("VND View")');
    await expect(vndViewBtn).toBeEnabled();
  });
});
