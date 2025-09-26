import { test, expect } from '@playwright/test';

test.describe('Admin Page', () => {
  test('should display admin panel interface', async ({ page }) => {
    await page.goto('/admin');
    
    // Check main heading
    await expect(page.locator('h2')).toContainText('Admin Panel');
    
    // Check description
    await expect(page.locator('text=Manage transaction types, accounts, assets, and tags')).toBeVisible();
    
    // Check all management cards
    await expect(page.locator('text=Transaction Types')).toBeVisible();
    await expect(page.locator('text=Accounts')).toBeVisible();
    await expect(page.locator('text=Assets')).toBeVisible();
    await expect(page.locator('text=Tags')).toBeVisible();
  });

  test('should display management cards with descriptions', async ({ page }) => {
    await page.goto('/admin');
    
    // Check Transaction Types card
    await expect(page.locator('text=Manage configurable transaction categories')).toBeVisible();
    await expect(page.locator('button:has-text("Manage Types")')).toBeVisible();
    
    // Check Accounts card
    await expect(page.locator('text=Manage cash, bank, and investment accounts')).toBeVisible();
    await expect(page.locator('button:has-text("Manage Accounts")')).toBeVisible();
    
    // Check Assets card
    await expect(page.locator('text=Manage currencies and tokens')).toBeVisible();
    await expect(page.locator('button:has-text("Manage Assets")')).toBeVisible();
    
    // Check Tags card
    await expect(page.locator('text=Manage categorization tags')).toBeVisible();
    await expect(page.locator('button:has-text("Manage Tags")')).toBeVisible();
  });

  test('should have working management buttons', async ({ page }) => {
    await page.goto('/admin');
    
    // Test all management buttons are clickable
    const manageTypesBtn = page.locator('button:has-text("Manage Types")');
    await expect(manageTypesBtn).toBeEnabled();
    
    const manageAccountsBtn = page.locator('button:has-text("Manage Accounts")');
    await expect(manageAccountsBtn).toBeEnabled();
    
    const manageAssetsBtn = page.locator('button:has-text("Manage Assets")');
    await expect(manageAssetsBtn).toBeEnabled();
    
    const manageTagsBtn = page.locator('button:has-text("Manage Tags")');
    await expect(manageTagsBtn).toBeEnabled();
  });
});
