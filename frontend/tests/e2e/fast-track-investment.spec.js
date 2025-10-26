import { test, expect } from '@playwright/test';

test.describe('Fast Track Investment', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to transactions page
    await page.goto('/');

    // Wait for page to load
    await expect(page.locator('[data-testid="transactions-page-title"]')).toBeVisible();
  });

  test('should show fast investment button', async ({ page }) => {
    // Fast investment button should be visible
    const fastInvestButton = page.locator('button[title="Vault Manager"]');
    await expect(fastInvestButton).toBeVisible();

    // Should have proper styling and icon
    await expect(fastInvestButton).toHaveClass(/bg-gradient-to-r/);
    await expect(fastInvestButton.locator('svg')).toBeVisible();
  });

  test('should open fast investment modal when button clicked', async ({ page }) => {
    // Click fast investment button
    const fastInvestButton = page.locator('button[title="Vault Manager"]');
    await fastInvestButton.click();

    // Modal should open
    await expect(page.locator('.fixed.inset-0')).toBeVisible();
    await expect(page.locator('h2')).toContainText('Fast Track Investment');
  });

  test('should show investment strategy options', async ({ page }) => {
    // Open fast investment modal
    const fastInvestButton = page.locator('button[title="Vault Manager"]');
    await fastInvestButton.click();

    // Should show strategy options
    await expect(page.locator('h3')).toContainText('Choose Investment Strategy');

    // Should show predefined options
    const strategies = ['Bitcoin Stake', 'USDT Stake', 'Ethereum Stake', 'Quick Diversify'];
    for (const strategy of strategies) {
      await expect(page.locator('text=' + strategy)).toBeVisible();
    }
  });

  test('should allow selection of Bitcoin stake strategy', async ({ page }) => {
    // Open fast investment modal
    const fastInvestButton = page.locator('button[title="Vault Manager"]');
    await fastInvestButton.click();

    // Click Bitcoin Stake option
    const btcStrategy = page.locator('text=Bitcoin Stake');
    await btcStrategy.click();

    // Should show configuration for Bitcoin stake
    await expect(page.locator('text=Back to options')).toBeVisible();
    await expect(page.locator('text=Bitcoin Stake')).toBeVisible();
    await expect(page.locator('text=Investment Amount (BTC)')).toBeVisible();

    // Should show suggested amounts
    const suggestedAmounts = ['0.001', '0.01', '0.1', '0.5'];
    for (const amount of suggestedAmounts) {
      await expect(page.locator('button:has-text("' + amount + '")')).toBeVisible();
    }
  });

  test('should allow selection of USDT stake strategy', async ({ page }) => {
    // Open fast investment modal
    const fastInvestButton = page.locator('button[title="Vault Manager"]');
    await fastInvestButton.click();

    // Click USDT Stake option
    const usdtStrategy = page.locator('text=USDT Stake');
    await usdtStrategy.click();

    // Should show configuration for USDT stake
    await expect(page.locator('text=USDT Stake')).toBeVisible();
    await expect(page.locator('text=Investment Amount (USDT)')).toBeVisible();

    // Should show suggested amounts
    const suggestedAmounts = ['100', '500', '1000', '5000'];
    for (const amount of suggestedAmounts) {
      await expect(page.locator('button:has-text("' + amount + '")')).toBeVisible();
    }
  });

  test('should show investment summary when amount is selected', async ({ page }) => {
    // Open fast investment modal
    const fastInvestButton = page.locator('button[title="Vault Manager"]');
    await fastInvestButton.click();

    // Select USDT Stake
    const usdtStrategy = page.locator('text=USDT Stake');
    await usdtStrategy.click();

    // Click suggested amount
    const amountButton = page.locator('button:has-text("1000")');
    await amountButton.click();

    // Should update amount input
    const amountInput = page.locator('input[placeholder="Enter custom amount"]');
    await expect(amountInput).toHaveValue('1000');

    // Investment summary should be visible
    await expect(page.locator('text=Investment Summary')).toBeVisible();
    await expect(page.locator('text=Strategy:')).toBeVisible();
    await expect(page.locator('text=USDT Stake')).toBeVisible();
    await expect(page.locator('text=1000 USDT')).toBeVisible();
  });

  test('should handle custom amount input', async ({ page }) => {
    // Open fast investment modal
    const fastInvestButton = page.locator('button[title="Vault Manager"]');
    await fastInvestButton.click();

    // Select Bitcoin Stake
    const btcStrategy = page.locator('text=Bitcoin Stake');
    await btcStrategy.click();

    // Enter custom amount
    const amountInput = page.locator('input[placeholder="Enter custom amount"]');
    await amountInput.fill('0.25');

    // Should show custom amount in summary
    await expect(page.locator('text=0.25 BTC')).toBeVisible();
  });

  test('should require source account selection', async ({ page }) => {
    // Open fast investment modal
    const fastInvestButton = page.locator('button[title="Vault Manager"]');
    await fastInvestButton.click();

    // Select USDT Stake
    const usdtStrategy = page.locator('text=USDT Stake');
    await usdtStrategy.click();

    // Enter amount
    const amountInput = page.locator('input[placeholder="Enter custom amount"]');
    await amountInput.fill('500');

    // Source account dropdown should be visible
    const sourceAccountSelect = page.locator('select');
    await expect(sourceAccountSelect).toBeVisible();

    // Should have default option selected (if accounts exist)
    const options = await sourceAccountSelect.locator('option').count();
    expect(options).toBeGreaterThan(0);
  });

  test('should disable create button when form is incomplete', async ({ page }) => {
    // Open fast investment modal
    const fastInvestButton = page.locator('button[title="Vault Manager"]');
    await fastInvestButton.click();

    // Select USDT Stake
    const usdtStrategy = page.locator('text=USDT Stake');
    await usdtStrategy.click();

    // Create button should be disabled without amount
    const createButton = page.locator('button:has-text("Create Investment")');
    await expect(createButton).toBeDisabled();

    // Enter amount but no source account
    const amountInput = page.locator('input[placeholder="Enter custom amount"]');
    await amountInput.fill('1000');

    // Create button should still be disabled without source account
    await expect(createButton).toBeDisabled();
  });

  test('should enable create button when form is complete', async ({ page }) => {
    // Open fast investment modal
    const fastInvestButton = page.locator('button[title="Vault Manager"]');
    await fastInvestButton.click();

    // Select USDT Stake
    const usdtStrategy = page.locator('text=USDT Stake');
    await usdtStrategy.click();

    // Enter amount
    const amountInput = page.locator('input[placeholder="Enter custom amount"]');
    await amountInput.fill('1000');

    // Select source account (assuming first option is valid)
    const sourceAccountSelect = page.locator('select');
    const options = await sourceAccountSelect.locator('option').count();
    if (options > 1) {
      await sourceAccountSelect.selectOption({ index: 1 }); // Select first non-default option
    }

    // Create button should be enabled
    const createButton = page.locator('button:has-text("Create Investment")');
    await expect(createButton).toBeEnabled();
  });

  test('should create investment when form is submitted', async ({ page }) => {
    // Open fast investment modal
    const fastInvestButton = page.locator('button[title="Vault Manager"]');
    await fastInvestButton.click();

    // Select USDT Stake
    const usdtStrategy = page.locator('text=USDT Stake');
    await usdtStrategy.click();

    // Enter amount
    const amountInput = page.locator('input[placeholder="Enter custom amount"]');
    await amountInput.fill('1000');

    // Select source account
    const sourceAccountSelect = page.locator('select');
    const options = await sourceAccountSelect.locator('option').count();
    if (options > 1) {
      await sourceAccountSelect.selectOption({ index: 1 });
    }

    // Click create investment
    const createButton = page.locator('button:has-text("Create Investment")');
    await createButton.click();

    // Should show loading state
    await expect(createButton).toContainText('Creating Investment...');

    // Modal should close after successful creation
    await expect(page.locator('.fixed.inset-0')).not.toBeVisible({ timeout: 10000 });

    // Should show success toast
    await expect(page.locator('text=Fast track investment created successfully!')).toBeVisible({ timeout: 5000 });
  });

  test('should handle cancel action', async ({ page }) => {
    // Open fast investment modal
    const fastInvestButton = page.locator('button[title="Vault Manager"]');
    await fastInvestButton.click();

    // Select USDT Stake
    const usdtStrategy = page.locator('text=USDT Stake');
    await usdtStrategy.click();

    // Click cancel button
    const cancelButton = page.locator('button:has-text("Cancel")');
    await cancelButton.click();

    // Modal should close
    await expect(page.locator('.fixed.inset-0')).not.toBeVisible();

    // Fast investment button should still be visible
    await expect(fastInvestButton).toBeVisible();
  });

  test('should handle close modal action', async ({ page }) => {
    // Open fast investment modal
    const fastInvestButton = page.locator('button[title="Vault Manager"]');
    await fastInvestButton.click();

    // Click close X button
    const closeButton = page.locator('button svg').first();
    await closeButton.click();

    // Modal should close
    await expect(page.locator('.fixed.inset-0')).not.toBeVisible();
  });

  test('should navigate back to strategy options', async ({ page }) => {
    // Open fast investment modal
    const fastInvestButton = page.locator('button[title="Vault Manager"]');
    await fastInvestButton.click();

    // Select USDT Stake
    const usdtStrategy = page.locator('text=USDT Stake');
    await usdtStrategy.click();

    // Click back to options
    const backButton = page.locator('text=Back to options');
    await backButton.click();

    // Should return to strategy selection
    await expect(page.locator('h3')).toContainText('Choose Investment Strategy');
    await expect(page.locator('text=USDT Stake')).toBeVisible();
    await expect(page.locator('text=Bitcoin Stake')).toBeVisible();
  });

  test('should show error for invalid investment creation', async ({ page }) => {
    // Mock API error by intercepting the request
    await page.route('**/api/actions/perform', route => {
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Insufficient balance' })
      });
    });

    // Open fast investment modal
    const fastInvestButton = page.locator('button[title="Fast Track Investment"]');
    await fastInvestButton.click();

    // Select USDT Stake
    const usdtStrategy = page.locator('text=USDT Stake');
    await usdtStrategy.click();

    // Enter amount
    const amountInput = page.locator('input[placeholder="Enter custom amount"]');
    await amountInput.fill('1000000'); // Large amount to trigger error

    // Select source account
    const sourceAccountSelect = page.locator('select');
    const options = await sourceAccountSelect.locator('option').count();
    if (options > 1) {
      await sourceAccountSelect.selectOption({ index: 1 });
    }

    // Click create investment
    const createButton = page.locator('button:has-text("Create Investment")');
    await createButton.click();

    // Should show error message
    await expect(page.locator('text=Insufficient balance')).toBeVisible({ timeout: 5000 });

    // Modal should remain open
    await expect(page.locator('.fixed.inset-0')).toBeVisible();
  });

  test('should update transactions list after investment creation', async ({ page }) => {
    // Get initial transaction count
    const initialTransactions = await page.locator('[data-testid="transaction-table"] tbody tr').count();

    // Open fast investment modal
    const fastInvestButton = page.locator('button[title="Fast Track Investment"]');
    await fastInvestButton.click();

    // Select USDT Stake
    const usdtStrategy = page.locator('text=USDT Stake');
    await usdtStrategy.click();

    // Enter amount
    const amountInput = page.locator('input[placeholder="Enter custom amount"]');
    await amountInput.fill('1000');

    // Select source account
    const sourceAccountSelect = page.locator('select');
    const options = await sourceAccountSelect.locator('option').count();
    if (options > 1) {
      await sourceAccountSelect.selectOption({ index: 1 });
    }

    // Click create investment
    const createButton = page.locator('button:has-text("Create Investment")');
    await createButton.click();

    // Wait for modal to close and transaction to be created
    await expect(page.locator('.fixed.inset-0')).not.toBeVisible({ timeout: 10000 });

    // Wait a moment for the transaction list to update
    await page.waitForTimeout(2000);

    // Transaction count should increase (new investment transactions should appear)
    const finalTransactions = await page.locator('[data-testid="transaction-table"] tbody tr').count();
    expect(finalTransactions).toBeGreaterThan(initialTransactions);
  });
});