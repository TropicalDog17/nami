import { test, expect } from '@playwright/test'

test.describe('Transaction Management Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('http://localhost:3000')
  })

  test('should navigate to transaction page and show empty state', async ({ page }) => {
    // Should be on transactions page by default
    await expect(page.locator('h1')).toContainText('Transactions')
    
    // Should show empty state message
    await expect(page.locator('text=No transactions found')).toBeVisible()
    
    // Should have new transaction button
    await expect(page.locator('button:has-text("New Transaction")')).toBeVisible()
  })

  test('should open transaction form when clicking new transaction', async ({ page }) => {
    // Click new transaction button
    await page.click('button:has-text("New Transaction")')
    
    // Should navigate to form
    await expect(page.locator('h3:has-text("New Transaction")')).toBeVisible()
    
    // Should show form fields
    await expect(page.locator('label:has-text("Date")')).toBeVisible()
    await expect(page.locator('label:has-text("Transaction Type")')).toBeVisible()
    await expect(page.locator('label:has-text("Asset")')).toBeVisible()
    await expect(page.locator('label:has-text("Account")')).toBeVisible()
    await expect(page.locator('label:has-text("Quantity")')).toBeVisible()
  })

  test('should create a new transaction successfully', async ({ page }) => {
    // Click new transaction button
    await page.click('button:has-text("New Transaction")')
    
    // Fill in the form
    await page.fill('input[id="date"]', '2025-09-26')
    await page.selectOption('select[id="type"]', 'buy')
    await page.selectOption('select[id="asset"]', 'BTC')
    await page.selectOption('select[id="account"]', 'Binance Spot')
    await page.fill('input[id="quantity"]', '0.001')
    await page.fill('input[id="price_local"]', '67000')
    
    // Wait for calculations to complete
    await page.waitForTimeout(500)
    
    // Verify calculated fields
    const amountLocal = await page.inputValue('input[id="amount_local"]')
    expect(parseFloat(amountLocal)).toBeCloseTo(67, 1)
    
    // Fill optional fields
    await page.fill('input[id="counterparty"]', 'Test Exchange')
    await page.selectOption('select[id="tag"]', { index: 1 }) // Select first available tag
    await page.fill('input[id="note"]', 'Test transaction via E2E')
    
    // Submit the form
    await page.click('button:has-text("Create Transaction")')
    
    // Should return to transaction list
    await expect(page.locator('h1:has-text("Transactions")')).toBeVisible()
    
    // Should show the new transaction in the table
    await expect(page.locator('text=Test Exchange')).toBeVisible()
    await expect(page.locator('text=BTC')).toBeVisible()
  })

  test('should toggle currency view', async ({ page }) => {
    // Create a transaction first
    await page.click('button:has-text("New Transaction")')
    await page.fill('input[id="date"]', '2025-09-26')
    await page.selectOption('select[id="type"]', 'income')
    await page.selectOption('select[id="asset"]', 'USD')
    await page.selectOption('select[id="account"]', 'Bank')
    await page.fill('input[id="quantity"]', '1000')
    await page.fill('input[id="price_local"]', '1')
    await page.click('button:has-text("Create Transaction")')
    
    // Should be back on transaction list
    await expect(page.locator('h1:has-text("Transactions")')).toBeVisible()
    
    // Should show USD view by default
    await expect(page.locator('button:has-text("USD View")')).toHaveClass(/bg-blue-600/)
    await expect(page.locator('text=Amount (USD)')).toBeVisible()
    
    // Click VND view
    await page.click('button:has-text("VND View")')
    
    // Should switch to VND view
    await expect(page.locator('button:has-text("VND View")')).toHaveClass(/bg-blue-600/)
    await expect(page.locator('text=Amount (VND)')).toBeVisible()
  })

  test('should edit an existing transaction', async ({ page }) => {
    // First create a transaction
    await page.click('button:has-text("New Transaction")')
    await page.fill('input[id="date"]', '2025-09-26')
    await page.selectOption('select[id="type"]', 'expense')
    await page.selectOption('select[id="asset"]', 'USD')
    await page.selectOption('select[id="account"]', 'Cash')
    await page.fill('input[id="quantity"]', '50')
    await page.fill('input[id="price_local"]', '1')
    await page.fill('input[id="counterparty"]', 'Original Store')
    await page.click('button:has-text("Create Transaction")')
    
    // Should be back on transaction list
    await expect(page.locator('text=Original Store')).toBeVisible()
    
    // Click on the transaction row to edit
    await page.click('text=Original Store')
    
    // Should open edit form
    await expect(page.locator('h3:has-text("Edit Transaction")')).toBeVisible()
    
    // Change the counterparty
    await page.fill('input[id="counterparty"]', 'Updated Store')
    
    // Submit the changes
    await page.click('button:has-text("Update Transaction")')
    
    // Should return to list with updated data
    await expect(page.locator('text=Updated Store')).toBeVisible()
    await expect(page.locator('text=Original Store')).not.toBeVisible()
  })

  test('should delete a transaction', async ({ page }) => {
    // First create a transaction
    await page.click('button:has-text("New Transaction")')
    await page.fill('input[id="date"]', '2025-09-26')
    await page.selectOption('select[id="type"]', 'expense')
    await page.selectOption('select[id="asset"]', 'USD')
    await page.selectOption('select[id="account"]', 'Cash')
    await page.fill('input[id="quantity"]', '25')
    await page.fill('input[id="price_local"]', '1')
    await page.fill('input[id="counterparty"]', 'To Be Deleted')
    await page.click('button:has-text("Create Transaction")')
    
    // Should be back on transaction list
    await expect(page.locator('text=To Be Deleted')).toBeVisible()
    
    // Set up dialog handler for confirmation
    page.on('dialog', dialog => {
      expect(dialog.message()).toContain('Are you sure')
      dialog.accept()
    })
    
    // Click delete button
    await page.click('button:has-text("Delete")')
    
    // Transaction should be removed
    await expect(page.locator('text=To Be Deleted')).not.toBeVisible()
  })

  test('should navigate to admin page', async ({ page }) => {
    // Click admin navigation link
    await page.click('a:has-text("Admin")')
    
    // Should navigate to admin page
    await expect(page.locator('h2:has-text("Admin Panel")')).toBeVisible()
    
    // Should show admin sections
    await expect(page.locator('text=Transaction Types')).toBeVisible()
    await expect(page.locator('text=Accounts')).toBeVisible()
    await expect(page.locator('text=Assets')).toBeVisible()
    await expect(page.locator('text=Tags')).toBeVisible()
  })

  test('should navigate to reports page', async ({ page }) => {
    // Click reports navigation link
    await page.click('a:has-text("Reports")')
    
    // Should navigate to reports page
    await expect(page.locator('h2:has-text("Reports & Analytics")')).toBeVisible()
    
    // Should show report sections
    await expect(page.locator('text=Holdings')).toBeVisible()
    await expect(page.locator('text=Cash Flow')).toBeVisible()
    await expect(page.locator('text=Spending')).toBeVisible()
    await expect(page.locator('text=P&L')).toBeVisible()
  })
})
