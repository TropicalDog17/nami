import { test, expect } from '@playwright/test';

import { waitForBackendReady, handleDialogConfirmation, createTestData } from './test-utils.js';

test.describe('Admin Page', () => {
  test('should display admin panel interface', async ({ page }) => {
    await page.goto('/admin');

    // Check main heading
    await expect(page.locator('[data-testid="admin-page-title"]')).toContainText('Admin Panel');

    // Check description
    await expect(page.locator('text=Configure transaction types, accounts, assets, and tags for your financial tracking system.')).toBeVisible();

    // Check all management tabs
    await expect(page.locator('button:has-text("Transaction Types")')).toBeVisible();
    await expect(page.locator('button:has-text("Accounts")')).toBeVisible();
    await expect(page.locator('button:has-text("Assets")')).toBeVisible();
    await expect(page.locator('button:has-text("Tags")')).toBeVisible();
  });

  test('should have working management tabs', async ({ page }) => {
    await page.goto('/admin');

    // Test all management tabs are clickable
    const typesTab = page.locator('button:has-text("Transaction Types")');
    await expect(typesTab).toBeEnabled();

    const accountsTab = page.locator('button:has-text("Accounts")');
    await expect(accountsTab).toBeEnabled();

    const assetsTab = page.locator('button:has-text("Assets")');
    await expect(assetsTab).toBeEnabled();

    const tagsTab = page.locator('button:has-text("Tags")');
    await expect(tagsTab).toBeEnabled();
  });

  test('should delete transaction types and update UI immediately when showing only active', async ({ page }) => {
    await page.goto('/admin');
    await waitForBackendReady(page);

    // Navigate to Transaction Types tab
    const typesTab = page.locator('button:has-text("Transaction Types")');
    await typesTab.click();

    // Ensure show inactive is unchecked
    const showInactiveCheckbox = page.locator('input[type="checkbox"][name="showInactive"]');
    if (await showInactiveCheckbox.isChecked()) {
      await showInactiveCheckbox.uncheck();
    }

    // Click "Add New" to create a test transaction type
    const addButton = page.locator('[data-testid="add-new-button"]');
    await addButton.click();

    // Fill out the form
    const testData = createTestData('e2e-delete-test');
    await page.locator('input[name="name"]').fill(testData.name);
    await page.locator('textarea[name="description"]').fill(`${testData.name} description`);

    // Submit the form
    const submitButton = page.locator('[data-testid="admin-form-submit"]');
    await submitButton.click();

    // Wait for the new type to appear in the table
    const newTypeRow = page.locator('table tbody tr').filter({ hasText: testData.name });
    await expect(newTypeRow).toBeVisible();

    // Get the count of rows before deletion
    const rowsBefore = await page.locator('table tbody tr').count();

    // Set up dialog handler for browser confirm dialog
    page.on('dialog', async dialog => {
      console.log('🔔 Confirm dialog appeared:', dialog.message());
      await dialog.accept(); // Accept the delete confirmation
    });

    // Click the delete button for the newly created type
    const deleteButton = newTypeRow.locator('[data-testid="datatable-delete-button"]');
    await deleteButton.click();

    // Wait a bit for the delete to process
    await page.waitForTimeout(2000);

    // Check if there's an error message
    const errorMessage = page.locator('text=/failed|error/i');
    const hasError = await errorMessage.isVisible();
    
    if (hasError) {
      console.log('Delete failed with error:', await errorMessage.textContent());
      throw new Error('Delete operation failed');
    }

    // Wait for the row to disappear
    await expect(newTypeRow).not.toBeVisible();
  });

  test('should handle delete operations properly', async ({ page }) => {
    await page.goto('/admin');
    await waitForBackendReady(page);

    // Navigate to Transaction Types tab
    const typesTab = page.locator('button:has-text("Transaction Types")');
    await typesTab.click();

    // Verify there are rows to delete
    const initialRowCount = await page.locator('table tbody tr').count();
    expect(initialRowCount).toBeGreaterThan(0);

    // Get the first row's delete button
    const firstRow = page.locator('table tbody tr').first();
    const deleteButton = firstRow.locator('[data-testid="datatable-delete-button"]');

    // Set up dialog handler for browser confirm dialog
    page.on('dialog', async dialog => {
      console.log('🔔 Confirm dialog appeared:', dialog.message());
      await dialog.accept(); // Accept the delete confirmation
    });

    await deleteButton.click();

    // Wait a moment for the delete to process
    await page.waitForTimeout(1000);

    // Wait for success message - this confirms the delete operation worked
    await page.waitForSelector('text=/deleted successfully/i', { timeout: 5000 });

    // Verify the operation completed successfully
    expect(true).toBe(true); // If we get here, delete worked
  });

  // Test for show inactive checkbox functionality
  test('should have show inactive checkbox', async ({ page }) => {
    await page.goto('/admin');
    await waitForBackendReady(page);

    // Navigate to Transaction Types tab
    const typesTab = page.locator('button:has-text("Transaction Types")');
    await typesTab.click();

    // Wait for the show inactive checkbox to be visible
    const showInactiveCheckbox = page.locator('input[type="checkbox"][name="showInactive"]');
    await showInactiveCheckbox.waitFor({ state: 'visible' });

    // Verify the checkbox exists and can be interacted with
    expect(await showInactiveCheckbox.isEnabled()).toBe(true);

    // Check and uncheck the box
    await showInactiveCheckbox.check();
    expect(await showInactiveCheckbox.isChecked()).toBe(true);

    await showInactiveCheckbox.uncheck();
    expect(await showInactiveCheckbox.isChecked()).toBe(false);
  });

  test('should not show Quick Expense Categories on admin page', async ({ page }) => {
    await page.goto('/admin');

    // Wait for page to load
    await waitForBackendReady(page);

    // Verify that Quick Expense Categories section does NOT exist
    const quickExpenseSection = page.locator('h3:has-text("Quick Expense Categories")');
    await expect(quickExpenseSection).not.toBeVisible();

    // Also check for alternative text patterns
    const alternativePatterns = [
      'text=/Quick.*Expense.*Categories/i',
      'text=/Popular.*Categories/i',
      '[data-testid="quick-expense-categories"]'
    ];

    for (const pattern of alternativePatterns) {
      const element = page.locator(pattern).first();
      await expect(element).not.toBeVisible();
    }

    // Verify that only admin-related content is visible
    const adminTabs = page.locator('button:has-text("Transaction Types"), button:has-text("Accounts"), button:has-text("Assets"), button:has-text("Tags")');
    await expect(adminTabs.first()).toBeVisible();
  });
});
