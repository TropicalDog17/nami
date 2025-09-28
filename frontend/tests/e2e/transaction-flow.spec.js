import { test, expect } from '@playwright/test'

test.describe('Transaction Management Flow', () => {
  test('should navigate to transaction page and show basic UI', async ({ page }) => {
    await page.goto('/')

    // Should be on transactions page by default
    await expect(page.locator('[data-testid="transactions-page-title"]')).toContainText('Transactions')

    // Should have basic UI elements
    await expect(page.locator('button:has-text("New Transaction")')).toBeVisible()
    await expect(page.locator('button:has-text("Export")')).toBeVisible()
  })

  test('should show currency toggle buttons', async ({ page }) => {
    await page.goto('/')

    // Should show USD and VND view buttons
    await expect(page.locator('button:has-text("USD View")')).toBeVisible()
    await expect(page.locator('button:has-text("VND View")')).toBeVisible()

    // USD should be selected by default
    await expect(page.locator('button:has-text("USD View")')).toHaveClass(/bg-blue-600/)
  })

  test('should navigate to admin page', async ({ page }) => {
    await page.goto('/')

    // Click admin navigation link
    await page.click('a:has-text("Admin")')
    await page.waitForURL('**/admin', { timeout: 10000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 });

    // Should navigate to admin page
    await expect(page.locator('h1:has-text("Admin Panel")')).toBeVisible({ timeout: 10000 })

    // Should show admin tabs
    await expect(page.locator('button:has-text("Transaction Types")')).toBeVisible({ timeout: 5000 })
  })

  test('should navigate to reports page', async ({ page }) => {
    await page.goto('/')

    // Click reports navigation link
    await page.click('a:has-text("Reports")')

    // Should navigate to reports page
    await expect(page.locator('h1:has-text("Reports & Analytics")')).toBeVisible()

    // Should show report tabs
    await expect(page.locator('button:has-text("Holdings")')).toBeVisible()
  })
})
