import { test, expect } from '@playwright/test';

test.describe('Basic Navigation', () => {
  test('should load the homepage', async ({ page }) => {
    await page.goto('/');
    
    // Check that the page loads
    await expect(page).toHaveTitle(/Nami/);
    
    // Check that the main heading is present
    await expect(page.locator('h1')).toContainText('Nami');
    
    // Check that navigation is present
    await expect(page.locator('nav')).toBeVisible();
  });

  test('should navigate between pages', async ({ page }) => {
    await page.goto('/');
    
    // Test navigation to Transaction page
    await page.click('text=Transactions');
    await expect(page.locator('h2')).toContainText('Transaction Management');
    
    // Test navigation to Admin page
    await page.click('text=Admin');
    await expect(page.locator('h2')).toContainText('Admin Panel');
    
    // Test navigation to Reports page
    await page.click('text=Reports');
    await expect(page.locator('h2')).toContainText('Reports & Analytics');
    
    // Navigate back to Transactions
    await page.click('text=Transactions');
    await expect(page.locator('h2')).toContainText('Transaction Management');
  });

  test('should highlight active navigation item', async ({ page }) => {
    await page.goto('/');
    
    // Check that Transactions is active on homepage
    const transactionsLink = page.locator('nav a[href="/"]');
    await expect(transactionsLink).toHaveClass(/border-blue-500/);
    
    // Navigate to Admin and check active state
    await page.click('text=Admin');
    const adminLink = page.locator('nav a[href="/admin"]');
    await expect(adminLink).toHaveClass(/border-blue-500/);
  });
});
