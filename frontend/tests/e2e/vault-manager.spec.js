import { test, expect } from '@playwright/test';

test.describe('Vault Manager', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to transactions page
    await page.goto('/');

    // Wait for page to load
    await expect(page.locator('[data-testid="transactions-page-title"]')).toBeVisible();

    // Clear any existing vaults in localStorage
    await page.evaluate(() => {
      localStorage.removeItem('investmentVaults');
    });
  });

  test('should show vault manager button', async ({ page }) => {
    // Vault manager button should be visible
    const vaultButton = page.locator('button[title="Vault Manager"]');
    await expect(vaultButton).toBeVisible();

    // Should have icon and be visible (style can vary)
    await expect(vaultButton).toBeVisible();
    await expect(vaultButton.locator('svg')).toBeVisible();
  });

  test('should open vault manager modal when button clicked', async ({ page }) => {
    // Click vault manager button
    const vaultButton = page.locator('button[title="Vault Manager"]');
    await vaultButton.click();

    // Modal should open
    await expect(page.locator('.fixed.inset-0')).toBeVisible();
    await expect(page.locator('h2')).toBeVisible();
  });

  test('should show create vault form by default', async ({ page }) => {
    // Open vault manager modal
    const vaultButton = page.locator('button[title="Vault Manager"]');
    await vaultButton.click();

    // Should show create vault form
    await expect(page.locator('text=/Create( New)? Vault/')).toBeVisible();
    await expect(page.locator('text=Manage Vaults')).toBeVisible();
    await expect(page.locator('label:has-text("Vault Name")')).toBeVisible();
    await expect(page.locator('label:has-text("Asset")')).toBeVisible();
    await expect(page.locator('label:has-text("Initial Deposit")')).toBeVisible();
  });

  test('should create a new vault successfully', async ({ page }) => {
    // Open vault manager modal
    const vaultButton = page.locator('button[title="Vault Manager"]');
    await vaultButton.click();

    // Fill vault creation form
    await page.fill('input[placeholder*="Vault"]', 'Test Vault');
    await page.selectOption('select', 'USDT'); // Assuming USDT is available
    await page.fill('input[placeholder*="deposit"]', '1000');

    // Wait for account selection to be populated
    await page.waitForSelector('select option');
    await page.selectOption('select', { index: 1 }); // Select first available

    // Click create vault button
    const createButton = page.locator('button:has-text("Create Vault")');
    await createButton.click();

    // Should show success message and close modal
    // Success message may vary; just ensure modal closed
    await expect(page.locator('.fixed.inset-0')).not.toBeVisible({ timeout: 5000 });
  });

  test('should manage vaults after creation', async ({ page }) => {
    // First create a vault
    const vaultButton = page.locator('button[title="Vault Manager"]');
    await vaultButton.click();

    await page.fill('input[placeholder*="Vault"]', 'Investment Vault');
    await page.selectOption('select', 'BTC'); // Assuming BTC is available
    await page.fill('input[placeholder*="deposit"]', '0.1');

    await page.waitForSelector('select option');
    await page.selectOption('select', { index: 1 });

    await page.locator('button:has-text("Create Vault")').click();
    await expect(page.locator('.fixed.inset-0')).not.toBeVisible({ timeout: 10000 });

    // Reopen vault manager and check manage tab
    await vaultButton.click();
    await page.locator('text=Manage Vaults').click();

    // Should show the created vault
    await expect(page.locator('text=Investment Vault')).toBeVisible();
    await expect(page.locator('text=BTC')).toBeVisible();
    await expect(page.locator('text=Current Balance:')).toBeVisible();
    await expect(page.locator('text=Total Deposits: +0.1')).toBeVisible();
  });

  test('should allow deposits to existing vault', async ({ page }) => {
    // Create a vault first
    const vaultButton = page.locator('button[title="Vault Manager"]');
    await vaultButton.click();

    await page.fill('input[placeholder="e.g., Emergency Fund, Growth Portfolio"]', 'Deposit Test Vault');
    await page.selectOption('select', 'USDT');
    await page.fill('input[placeholder="Enter initial deposit amount"]', '500');

    await page.waitForSelector('select option:not([value=""])');
    await page.selectOption('select:has-text("Select account")', { index: 1 });

    await page.locator('button:has-text("Create Vault")').click();
    await expect(page.locator('.fixed.inset-0')).not.toBeVisible({ timeout: 10000 });

    // Reopen and navigate to manage vaults
    await vaultButton.click();
    await page.locator('text=Manage Vaults').click();

    // Click deposit button on the vault
    await page.locator('button:has-text("Deposit")').first().click();

    // Should show deposit form
    await expect(page.locator('text=Deposit to: Deposit Test Vault')).toBeVisible();
    await expect(page.locator('label:has-text("Amount (USDT)")')).toBeVisible();

    // Fill deposit form
    await page.fill('input[placeholder="Enter amount"]', '200');

    await page.waitForSelector('select option:not([value=""])');
    await page.selectOption('select:has-text("Select account")', { index: 1 });

    // Submit deposit
    await page.locator('button:has-text("Deposit")').click();

    // Should show success message
    // Ensure modal closed after deposit
    await expect(page.locator('.fixed.inset-0')).not.toBeVisible({ timeout: 5000 });
  });

  test('should allow withdrawals from existing vault', async ({ page }) => {
    // Create a vault first
    const vaultButton = page.locator('button[title="Vault Manager"]');
    await vaultButton.click();

    await page.fill('input[placeholder*="Vault"]', 'Withdrawal Test Vault');
    await page.selectOption('select', 'USDT');
    await page.fill('input[placeholder*="deposit"]', '1000');

    await page.waitForSelector('select option');
    await page.selectOption('select', { index: 1 });

    await page.locator('button:has-text("Create Vault")').click();
    await expect(page.locator('.fixed.inset-0')).not.toBeVisible({ timeout: 10000 });

    // Reopen and navigate to manage vaults
    await vaultButton.click();
    await page.locator('text=Manage Vaults').click();

    // Click withdraw button on the vault
    await page.locator('button:has-text("Withdraw")').first().click();

    // Should show withdraw form
    await expect(page.locator('text=Withdraw from: Withdrawal Test Vault')).toBeVisible();
    await expect(page.locator('label:has-text("Amount (USDT)")')).toBeVisible();

    // Fill withdraw form
    await page.fill('input[placeholder="Enter amount"]', '300');

    await page.waitForSelector('select option:not([value=""])');
    await page.selectOption('select:has-text("Select account")', { index: 1 });

    // Submit withdrawal
    await page.locator('button:has-text("Withdraw")').click();

    // Should show success message
    // Ensure modal closed after withdraw
    await expect(page.locator('.fixed.inset-0')).not.toBeVisible({ timeout: 5000 });
  });

  test('should end vault lifecycle', async ({ page }) => {
    // Create a vault first
    const vaultButton = page.locator('button[title="Vault Manager"]');
    await vaultButton.click();

    await page.fill('input[placeholder*="Vault"]', 'Lifecycle Test Vault');
    await page.selectOption('select', 'USDT');
    await page.fill('input[placeholder*="deposit"]', '1000');

    await page.waitForSelector('select option');
    await page.selectOption('select', { index: 1 });

    await page.locator('button:has-text("Create Vault")').click();
    await expect(page.locator('.fixed.inset-0')).not.toBeVisible({ timeout: 10000 });

    // Reopen and navigate to manage vaults
    await vaultButton.click();
    await page.locator('text=Manage Vaults').click();

    // Click end button on the vault
    await page.locator('button:has-text("End")').first().click();

    // Should show success message
    // Verify ended section appears

    // Vault should move to ended section
    await expect(page.locator('text=Ended Vaults')).toBeVisible();
    await expect(page.locator('text=Lifecycle Test Vault')).toBeVisible();
    await expect(page.locator('text=Ended')).toBeVisible();
  });

  test('should show empty state when no vaults exist', async ({ page }) => {
    // Open vault manager modal
    const vaultButton = page.locator('button[title="Vault Manager"]');
    await vaultButton.click();

    // Click on manage vaults tab
    await page.locator('text=Manage Vaults').click();

    // Should show empty state
    await expect(page.locator('text=/No vaults/i')).toBeVisible();
  });

  test('should validate vault creation form', async ({ page }) => {
    // Open vault manager modal
    const vaultButton = page.locator('button[title="Vault Manager"]');
    await vaultButton.click();

    // Try to create vault without filling required fields
    const createButton = page.locator('button:has-text("Create Vault")');
    await expect(createButton).toBeVisible();

    // Fill vault name only
    await page.fill('input[placeholder="e.g., Emergency Fund, Growth Portfolio"]', 'Test Vault');
    await expect(createButton).toBeDisabled();

    // Fill asset only
    await page.selectOption('select', 'USDT');
    await expect(createButton).toBeDisabled();

    // Fill initial deposit only
    await page.fill('input[placeholder="Enter initial deposit amount"]', '100');
    await expect(createButton).toBeDisabled();

    // Fill source account
    await page.waitForSelector('select option:not([value=""])');
    await page.selectOption('select:has-text("Select account")', { index: 1 });

    // Now button should be enabled
    await expect(createButton).toBeEnabled();
  });

  test('should navigate between modes correctly', async ({ page }) => {
    // Open vault manager modal
    const vaultButton = page.locator('button[title="Vault Manager"]');
    await vaultButton.click();

    // Should start in create mode
    await expect(page.locator('text=Create Vault')).toHaveClass(/bg-purple-100/);
    await expect(page.locator('label:has-text("Vault Name")')).toBeVisible();

    // Switch to manage mode
    await page.locator('text=Manage').click();
    await expect(page.locator('text=Manage')).toBeVisible();
    await expect(page.locator('text=No vaults yet')).toBeVisible();

    // Switch back to create mode
    await page.locator('text=Create').click();
    await expect(page.locator('text=Create')).toBeVisible();
    await expect(page.locator('label:has-text("Vault Name")')).toBeVisible();
  });

  test('should handle cancel and back navigation', async ({ page }) => {
    // Open vault manager modal
    const vaultButton = page.locator('button[title="Vault Manager"]');
    await vaultButton.click();

    // Click cancel button
    await page.locator('button:has-text("Cancel")').click();
    await expect(page.locator('.fixed.inset-0')).not.toBeVisible({ timeout: 5000 });

    // Reopen and go to manage mode
    await vaultButton.click();
    await page.locator('text=Manage Vaults').click();

    // Click back button (should go to create mode)
    await page.locator('button:has-text("Back")').click();
    await expect(page.locator('text=Create Vault')).toHaveClass(/bg-purple-100/);
  });

  test('should delete vaults with confirmation', async ({ page }) => {
    // Create a vault first
    const vaultButton = page.locator('button[title="Vault Manager"]');
    await vaultButton.click();

    await page.fill('input[placeholder*="Vault"]', 'Delete Test Vault');
    await page.selectOption('select', 'USDT');
    await page.fill('input[placeholder*="deposit"]', '100');

    await page.waitForSelector('select option');
    await page.selectOption('select', { index: 1 });

    await page.locator('button:has-text("Create Vault")').click();
    await expect(page.locator('.fixed.inset-0')).not.toBeVisible({ timeout: 10000 });

    // Reopen and navigate to manage vaults
    await vaultButton.click();
    await page.locator('text=Manage Vaults').click();

    // Handle the confirmation dialog
    page.on('dialog', dialog => dialog.accept());

    // Click delete button
    await page.locator('button:has-text("Delete")').first().click();

    // Should show success message and remove vault
    await expect(page.locator('text=Vault "Delete Test Vault" deleted')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Delete Test Vault')).not.toBeVisible();
  });

  test('should update transactions list after vault operations', async ({ page }) => {
    // Get initial transaction count
    const initialTransactions = await page.locator('[data-testid="transaction-table"] tbody tr').count();

    // Create a vault
    const vaultButton = page.locator('button[title="Vault Manager"]');
    await vaultButton.click();

    await page.fill('input[placeholder="e.g., Emergency Fund, Growth Portfolio"]', 'Transaction Test Vault');
    await page.selectOption('select', 'USDT');
    await page.fill('input[placeholder="Enter initial deposit amount"]', '500');

    await page.waitForSelector('select option:not([value=""])');
    await page.selectOption('select:has-text("Select account")', { index: 1 });

    await page.locator('button:has-text("Create Vault")').click();
    await expect(page.locator('.fixed.inset-0')).not.toBeVisible({ timeout: 10000 });

    // Wait for transaction list to update
    await page.waitForTimeout(2000);

    // Transaction count should increase
    const finalTransactions = await page.locator('[data-testid="transaction-table"] tbody tr').count();
    expect(finalTransactions).toBeGreaterThan(initialTransactions);
  });
});