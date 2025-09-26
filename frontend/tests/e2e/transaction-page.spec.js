import { test, expect } from '@playwright/test';

test.describe('Transaction Page', () => {
  test('should display transaction management interface', async ({ page }) => {
    await page.goto('/');
    
    // Check main heading
    await expect(page.locator('h2')).toContainText('Transaction Management');
    
    // Check description
    await expect(page.locator('text=Create, edit, and manage your financial transactions')).toBeVisible();
    
    // Check quick actions section
    await expect(page.locator('h3')).toContainText('Quick Actions');
    
    // Check action buttons
    await expect(page.locator('button:has-text("New Transaction")')).toBeVisible();
    await expect(page.locator('button:has-text("Import CSV")')).toBeVisible();
    await expect(page.locator('button:has-text("Export Data")')).toBeVisible();
  });

  test('should display recent transactions section', async ({ page }) => {
    await page.goto('/');
    
    // Check recent transactions section
    await expect(page.locator('text=Recent Transactions')).toBeVisible();
    await expect(page.locator('text=No transactions found')).toBeVisible();
  });

  test('should have working buttons', async ({ page }) => {
    await page.goto('/');
    
    // Test that buttons are clickable (they don't have functionality yet, but should be interactive)
    const newTransactionBtn = page.locator('button:has-text("New Transaction")');
    await expect(newTransactionBtn).toBeEnabled();
    await newTransactionBtn.click();
    
    const importBtn = page.locator('button:has-text("Import CSV")');
    await expect(importBtn).toBeEnabled();
    
    const exportBtn = page.locator('button:has-text("Export Data")');
    await expect(exportBtn).toBeEnabled();
  });
});
