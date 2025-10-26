import { test, expect } from '@playwright/test';

test.describe('Credit Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Create test accounts - one credit card and one non-credit card
    await page.request.post('http://localhost:8080/api/admin/assets', {
      data: { symbol: 'USD', name: 'USD', decimals: 2, is_active: true }
    }).catch(() => {});

    await page.request.post('http://localhost:8080/api/admin/accounts', {
      data: { name: 'Test Credit Card', type: 'CreditCard', is_active: true }
    }).catch(() => {});

    await page.request.post('http://localhost:8080/api/admin/accounts', {
      data: { name: 'Test Bank Account', type: 'Bank', is_active: true }
    }).catch(() => {});
  });

  test('should only show credit card accounts in credit dashboard', async ({ page }) => {
    // Create expense transactions for both credit card and bank accounts
    await page.request.post('http://localhost:8080/api/transactions', {
      data: {
        date: new Date().toISOString(),
        type: 'expense',
        asset: 'USD',
        account: 'Test Credit Card',
        quantity: 100,
        price_local: 1,
        amount_local: 100,
        fx_to_usd: 1,
        amount_usd: 100,
        counterparty: 'Credit Test Store',
        tag: 'Shopping'
      }
    });

    await page.request.post('http://localhost:8080/api/transactions', {
      data: {
        date: new Date().toISOString(),
        type: 'expense',
        asset: 'USD',
        account: 'Test Bank Account',
        quantity: 50,
        price_local: 1,
        amount_local: 50,
        fx_to_usd: 1,
        amount_usd: 50,
        counterparty: 'Bank Test Store',
        tag: 'Food'
      }
    });

    // Navigate to credit dashboard
    await page.goto('/credit');
    await page.waitForSelector('h1');

    // Wait for data to load
    await page.waitForTimeout(2000);

    // Verify page title
    await expect(page.locator('h1:has-text("Credit Card Dashboard")')).toBeVisible();

    // Check credit card details section
    const creditCardSection = page.locator('h2:has-text("Credit Card Details")').first();
    await expect(creditCardSection).toBeVisible();

    // Should only show credit card accounts, not bank accounts
    const creditCardDetails = page.locator('.border.border-gray-200.rounded-lg.p-4');

    if (await creditCardDetails.count() > 0) {
      // If there are credit cards shown, verify they are only credit card accounts
      const creditCardNames = await creditCardDetails.locator('h3.font-medium').allTextContents();

      // Should contain the credit card account
      expect(creditCardNames.some(name => name.includes('Test Credit Card'))).toBeTruthy();

      // Should NOT contain the bank account
      expect(creditCardNames.some(name => name.includes('Test Bank Account'))).toBeFalsy();

      // Should not show investment accounts like Binance Spot or Vault
      expect(creditCardNames.some(name => name.includes('Binance'))).toBeFalsy();
      expect(creditCardNames.some(name => name.includes('Vault'))).toBeFalsy();
    }

    // Check recent transactions table
    const transactionsTable = page.locator('table').first();
    if (await transactionsTable.isVisible()) {
      const tableRows = page.locator('tbody tr');
      const rowCount = await tableRows.count();

      if (rowCount > 0) {
        // Find the "Card" column (usually 3rd column based on the table structure)
        const cardColumn = 2; // 0-indexed

        // Check all visible transactions
        for (let i = 0; i < Math.min(rowCount, 10); i++) {
          const row = tableRows.nth(i);
          const cardName = await row.locator('td').nth(cardColumn).textContent();

          // Should only show credit card transactions, not bank or investment accounts
          expect(cardName).not.toContain('Test Bank Account');
          expect(cardName).not.toContain('Binance');
          expect(cardName).not.toContain('Vault');
          expect(cardName).not.toContain('Exchange');
        }
      }
    }
  });

  test('should show credit card transactions in recent activity', async ({ page }) => {
    // Create credit card transactions
    await page.request.post('http://localhost:8080/api/transactions', {
      data: {
        date: new Date().toISOString(),
        type: 'expense',
        asset: 'USD',
        account: 'Test Credit Card',
        quantity: 75,
        price_local: 1,
        amount_local: 75,
        fx_to_usd: 1,
        amount_usd: 75,
        counterparty: 'Credit Test Store',
        tag: 'Shopping'
      }
    });

    await page.request.post('http://localhost:8080/api/transactions', {
      data: {
        date: new Date().toISOString(),
        type: 'repay_borrow',
        asset: 'USD',
        account: 'Test Credit Card',
        quantity: 25,
        price_local: 1,
        amount_local: 25,
        fx_to_usd: 1,
        amount_usd: 25
      }
    });

    // Navigate to credit dashboard
    await page.goto('/credit');
    await page.waitForTimeout(2000);

    // Verify the dashboard loads
    await expect(page.locator('h1:has-text("Credit Card Dashboard")')).toBeVisible();

    // Check recent transactions table contains credit card transactions
    const transactionsTable = page.locator('table').first();
    if (await transactionsTable.isVisible()) {
      const tableRows = page.locator('tbody tr');
      const rowCount = await tableRows.count();

      if (rowCount > 0) {
        let foundCreditCardTransaction = false;

        // Look for transactions from our test credit card
        for (let i = 0; i < Math.min(rowCount, 10); i++) {
          const row = tableRows.nth(i);
          const rowText = await row.textContent();

          if (rowText.includes('Test Credit Card')) {
            foundCreditCardTransaction = true;
            break;
          }
        }

        // Should find at least one credit card transaction
        expect(foundCreditCardTransaction).toBeTruthy();
      }
    }
  });
});