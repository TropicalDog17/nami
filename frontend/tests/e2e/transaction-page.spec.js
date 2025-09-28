import { test, expect } from '@playwright/test';

test.describe('Transaction Page', () => {
  test('should render actions column with edit & delete buttons (regression)', async ({ page }) => {
    await page.goto('/');

    // Wait for transactions to load
    await page.waitForSelector('table');

    // Ensure Actions header exists
    await expect(
      page.locator('[data-testid="datatable"] thead th', { hasText: 'Actions' })
    ).toBeVisible();

    // Ensure at least one row exists
    const row = page.locator('tbody tr').first();
    await expect(row).toBeVisible();

    // Buttons should be visible in the sticky actions cell
    await expect(row.locator('[data-testid="datatable-edit-button"]')).toBeVisible();
    await expect(row.locator('[data-testid="datatable-delete-button"]')).toBeVisible();
  });
  test('should display transaction management interface', async ({ page }) => {
    await page.goto('/');

    // Check main heading
    await expect(page.locator('[data-testid="transactions-page-title"]')).toContainText('Transactions');

    // Check description
    await expect(page.locator('text=Track your financial transactions with dual currency valuation and comprehensive reporting.')).toBeVisible();

    // Check action buttons
    await expect(page.locator('button:has-text("New Transaction")')).toBeVisible();
    await expect(page.locator('button:has-text("Export")')).toBeVisible();
  });

  test('should display transactions table', async ({ page }) => {
    await page.goto('/');

    // Check that transactions table or empty state is visible
    const hasTable = await page.locator('table').isVisible();
    const hasEmptyMessage = await page.locator('text=No transactions found').isVisible();

    expect(hasTable || hasEmptyMessage).toBe(true);
  });

  test('should have working buttons', async ({ page }) => {
    await page.goto('/');

    // Test that buttons are clickable
    const newTransactionBtn = page.locator('button:has-text("New Transaction")');
    await expect(newTransactionBtn).toBeEnabled();

    const exportBtn = page.locator('button:has-text("Export")');
    await expect(exportBtn).toBeEnabled();
  });

  test('should allow inline editing of transaction fields', async ({ page }) => {
    await page.goto('/');

    // Wait for transactions to load
    await page.waitForSelector('table');

    // Get first row data before editing
    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();

    // Test editing date field (double-click to edit)
    const dateCell = firstRow.locator('td').nth(0); // Date column
    await dateCell.dblclick();

    // Should show date input
    const dateInput = page.locator('input[type="date"]');
    await expect(dateInput).toBeVisible();

    // Change date and save
    const newDate = '2024-01-15';
    await dateInput.fill(newDate);
    await dateInput.press('Enter');

    // Input should disappear after saving
    await expect(dateInput).not.toBeVisible();
  });

  test('should allow inline editing of transaction type', async ({ page }) => {
    await page.goto('/');

    // Wait for transactions to load
    await page.waitForSelector('table');

    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();

    // Test editing type field
    const typeCell = firstRow.locator('td').nth(1); // Type column
    await typeCell.dblclick();

    // Should show select dropdown
    const typeSelect = page.locator('select');
    await expect(typeSelect).toBeVisible();

    // Change type to 'sell'
    await typeSelect.selectOption('sell');
    await typeSelect.press('Enter');

    // Select should disappear after saving
    await expect(typeSelect).not.toBeVisible();
  });

  test('should allow inline editing of asset field', async ({ page }) => {
    await page.goto('/');

    // Wait for transactions to load
    await page.waitForSelector('table');

    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();

    // Test editing asset field
    const assetCell = firstRow.locator('td').nth(2); // Asset column
    await assetCell.dblclick();

    // Should show select dropdown
    const assetSelect = page.locator('select');
    await expect(assetSelect).toBeVisible();

    // Select first available asset option
    const firstOption = assetSelect.locator('option').nth(1); // Skip "Select..." option
    const assetValue = await firstOption.getAttribute('value');
    await assetSelect.selectOption(assetValue);

    // Save by pressing Enter
    await assetSelect.press('Enter');

    // Select should disappear after saving
    await expect(assetSelect).not.toBeVisible();
  });

  test('should allow inline editing of account field', async ({ page }) => {
    await page.goto('/');

    // Wait for transactions to load
    await page.waitForSelector('table');

    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();

    // Test editing account field
    const accountCell = firstRow.locator('td').nth(3); // Account column
    await accountCell.click();

    // Should show select dropdown
    const accountSelect = page.locator('select');
    await expect(accountSelect).toBeVisible();

    // Select first available account option
    const firstOption = accountSelect.locator('option').nth(1); // Skip "Select..." option
    const accountValue = await firstOption.getAttribute('value');
    await accountSelect.selectOption(accountValue);

    // Save by pressing Enter
    await accountSelect.press('Enter');

    // Select should disappear after saving
    await expect(accountSelect).not.toBeVisible();
  });

  test('should allow inline editing of quantity field', async ({ page }) => {
    await page.goto('/');

    // Wait for transactions to load
    await page.waitForSelector('table');

    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();

    // Test editing quantity field
    const quantityCell = firstRow.locator('td').nth(4); // Quantity column
    await quantityCell.dblclick();

    // Should show number input
    const quantityInput = page.locator('input[type="number"]');
    await expect(quantityInput).toBeVisible();

    // Change quantity
    const newQuantity = '2.5';
    await quantityInput.fill(newQuantity);
    await quantityInput.press('Enter');

    // Input should disappear after saving
    await expect(quantityInput).not.toBeVisible();
  });

  test('should allow inline editing of counterparty field', async ({ page }) => {
    await page.goto('/');

    // Wait for transactions to load
    await page.waitForSelector('table');

    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();

    // Test editing counterparty field
    const counterpartyCell = firstRow.locator('td').nth(7); // Counterparty column (after amount, cashflow)
    await counterpartyCell.dblclick();

    // Should show text input (specifically the inline edit input, not the search input)
    const counterpartyInput = page.locator('input[type="text"]').nth(1); // The second text input (inline edit)
    await expect(counterpartyInput).toBeVisible();

    // Change counterparty
    const newCounterparty = 'Test Counterparty';
    await counterpartyInput.fill(newCounterparty);
    await counterpartyInput.press('Enter');

    // Input should disappear after saving
    await expect(counterpartyInput).not.toBeVisible();
  });

  test('should allow inline editing of tag field', async ({ page }) => {
    await page.goto('/');

    // Wait for transactions to load
    await page.waitForSelector('table');

    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();

    // Test editing tag field
    const tagCell = firstRow.locator('td').nth(8); // Tag column (after counterparty)
    await tagCell.dblclick();

    // Should show select dropdown
    const tagSelect = page.locator('select');
    await expect(tagSelect).toBeVisible();

    // Select first available tag option
    const firstOption = tagSelect.locator('option').nth(1); // Skip "Select..." option
    const tagValue = await firstOption.getAttribute('value');
    await tagSelect.selectOption(tagValue);

    // Save by pressing Enter
    await tagSelect.press('Enter');

    // Select should disappear after saving
    await expect(tagSelect).not.toBeVisible();
  });

  test('should cancel inline editing with Escape key', async ({ page }) => {
    await page.goto('/');

    // Wait for transactions to load
    await page.waitForSelector('table');

    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();

    // Test canceling edit with Escape
    const dateCell = firstRow.locator('td').nth(0);
    await dateCell.dblclick();

    const dateInput = page.locator('input[type="date"]');
    await expect(dateInput).toBeVisible();

    // Type something then press Escape
    await dateInput.fill('2024-12-25');
    await dateInput.press('Escape');

    // Input should disappear without saving
    await expect(dateInput).not.toBeVisible();
  });

  test('should open edit form when clicking Edit button', async ({ page }) => {
    await page.goto('/');

    // Wait for transactions to load
    await page.waitForSelector('table');

    // Check if there are transactions, if not, create one first
    const rowCount = await page.locator('tbody tr').count();
    if (rowCount === 0) {
      // Create a transaction first
      const newTransactionBtn = page.locator('button:has-text("New Transaction")');
      await newTransactionBtn.click();

      // Wait for form to load
      await expect(page.locator('text=Back to Transactions')).toBeVisible();

      // Fill in basic transaction data
      const dateInput = page.locator('input[type="date"]').first();
      await dateInput.fill('2024-01-15');

      const typeSelect = page.locator('select').first();
      await typeSelect.selectOption('buy');

      const assetSelect = page.locator('select').nth(1);
      await assetSelect.selectOption('BTC');

      const accountSelect = page.locator('select').nth(2);
      await accountSelect.selectOption('Main Account');

      const quantityInput = page.locator('input[type="number"]').first();
      await quantityInput.fill('1.5');

      // Fill price field (required)
      const priceInput = page.locator('input[type="number"]').nth(1);
      await priceInput.fill('50000');

      // Submit the form
      const saveButton = page.locator('button:has-text("Save Transaction")');
      await saveButton.click();

      // Wait for redirect back to transactions list
      await expect(page.locator('[data-testid="transactions-page-title"]')).toBeVisible();
      await page.waitForSelector('table');

      // Wait a bit for the transaction to be loaded
      await page.waitForTimeout(2000);

      // Verify transaction was created by checking table has rows
      const rowCount = await page.locator('tbody tr').count();
      expect(rowCount).toBeGreaterThan(0);
    }

    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();

    // Click the Edit button in the actions column
    const editButton = firstRow.locator('[data-testid="datatable-edit-button"]');
    await expect(editButton).toBeVisible();
    await editButton.click();

    // Should navigate to edit form
    await expect(page.locator('text=Back to Transactions')).toBeVisible();
    await expect(page.locator('button:has-text("Update Transaction")')).toBeVisible();
  });

  test('should allow canceling edit form', async ({ page }) => {
    await page.goto('/');

    // Wait for transactions to load
    await page.waitForSelector('table');

    // Check if there are transactions, if not, create one first
    const rowCount = await page.locator('tbody tr').count();
    if (rowCount === 0) {
      // Create a transaction first
      const newTransactionBtn = page.locator('button:has-text("New Transaction")');
      await newTransactionBtn.click();

      // Wait for form to load
      await expect(page.locator('text=Back to Transactions')).toBeVisible();

      // Fill in basic transaction data
      const dateInput = page.locator('input[type="date"]').first();
      await dateInput.fill('2024-01-15');

      const typeSelect = page.locator('select').first();
      await typeSelect.selectOption('buy');

      const assetSelect = page.locator('select').nth(1);
      await assetSelect.selectOption('BTC');

      const accountSelect = page.locator('select').nth(2);
      await accountSelect.selectOption('Main Account');

      const quantityInput = page.locator('input[type="number"]').first();
      await quantityInput.fill('1.5');

      // Fill price field (required)
      const priceInput = page.locator('input[type="number"]').nth(1);
      await priceInput.fill('50000');

      // Submit the form
      const saveButton = page.locator('button:has-text("Save Transaction")');
      await saveButton.click();

      // Wait for redirect back to transactions list
      await expect(page.locator('[data-testid="transactions-page-title"]')).toBeVisible();
      await page.waitForSelector('table');

      // Wait a bit for the transaction to be loaded
      await page.waitForTimeout(2000);

      // Verify transaction was created by checking table has rows
      const rowCount = await page.locator('tbody tr').count();
      expect(rowCount).toBeGreaterThan(0);
    }

    const firstRow = page.locator('tbody tr').first();
    await expect(firstRow).toBeVisible();

    // Click the Edit button in the actions column
    const editButton = firstRow.locator('[data-testid="datatable-edit-button"]');
    await expect(editButton).toBeVisible();
    await editButton.click();

    // Click back button to cancel
    const backButton = page.locator('button:has-text("Back to Transactions")');
    await backButton.click();

    // Should return to transaction list
    await expect(page.locator('[data-testid="transactions-page-title"]')).toContainText('Transactions');
    await expect(page.locator('table')).toBeVisible();
  });
});
