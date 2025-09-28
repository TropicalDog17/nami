import { chromium } from '@playwright/test';

async function globalTeardown(config) {
  console.log('🧹 Starting global test teardown (backend server remains running)...');

  // Launch a browser instance for teardown tasks
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to the application
    await page.goto('http://localhost:3000');

    // Perform final cleanup of test data only (backend server stays running)
    await finalCleanup(page);

    console.log('✅ Global teardown completed successfully (backend server still running)');
    console.log('📋 To stop the backend server manually: kill the Go process running on port 8080');
  } catch (error) {
    console.error('❌ Global teardown failed:', error);
    // Don't throw error here as we want to continue with teardown
  } finally {
    await context.close();
    await browser.close();
  }
}

async function finalCleanup(page) {
  console.log('🧹 Performing final cleanup...');

  try {
    // Navigate to admin page for cleanup
    await page.goto('http://localhost:3000/admin');
    await page.waitForTimeout(2000);

    // Set up dialog handler once for all cleanup operations
    page.on('dialog', dialog => {
      console.log('🗑️ Accepting delete confirmation dialog');
      dialog.accept();
    });

    // Clean up any test data created during tests
    await cleanupTestTransactionTypes(page);
    await cleanupTestAccounts(page);
    await cleanupTestAssets(page);
    await cleanupTestTags(page);
    await cleanupTestTransactions(page);

    console.log('✅ Final cleanup completed');
  } catch (error) {
    console.log('⚠️ Error during final cleanup:', error.message);
  }
}

async function cleanupTestTransactionTypes(page) {
  try {
    // Switch to Transaction Types tab
    await page.click('button:has-text("Transaction Types")');
    await page.waitForTimeout(1000);
    
    // Look for test transaction types (those with "test" in the name)
    const testRows = page.locator('table tbody tr').filter({ hasText: /test/i });
    const count = await testRows.count();
    
    if (count > 0) {
      console.log(`🗑️ Found ${count} test transaction types to clean up`);

      // Delete each test transaction type
      for (let i = 0; i < count; i++) {
        const row = testRows.nth(i);
        const deleteButton = row.locator('button').filter({ hasText: '🗑️' });
        
        if (await deleteButton.isVisible()) {
          await deleteButton.click();
          await page.waitForTimeout(500);
        }
      }
    }
  } catch (error) {
    console.log('⚠️ Error cleaning up test transaction types:', error.message);
  }
}

async function cleanupTestAccounts(page) {
  try {
    // Switch to Accounts tab
    await page.click('button:has-text("Accounts")');
    await page.waitForTimeout(1000);
    
    // Look for test accounts
    const testRows = page.locator('table tbody tr').filter({ hasText: /test|e2e/i });
    const count = await testRows.count();
    
    if (count > 0) {
      console.log(`🗑️ Found ${count} test accounts to clean up`);

      // Delete each test account
      for (let i = 0; i < count; i++) {
        const row = testRows.nth(i);
        const deleteButton = row.locator('button').filter({ hasText: '🗑️' });
        
        if (await deleteButton.isVisible()) {
          await deleteButton.click();
          await page.waitForTimeout(500);
        }
      }
    }
  } catch (error) {
    console.log('⚠️ Error cleaning up test accounts:', error.message);
  }
}

async function cleanupTestAssets(page) {
  try {
    // Switch to Assets tab
    await page.click('button:has-text("Assets")');
    await page.waitForTimeout(1000);
    
    // Look for test assets
    const testRows = page.locator('table tbody tr').filter({ hasText: /test|e2e/i });
    const count = await testRows.count();
    
    if (count > 0) {
      console.log(`🗑️ Found ${count} test assets to clean up`);

      // Delete each test asset
      for (let i = 0; i < count; i++) {
        const row = testRows.nth(i);
        const deleteButton = row.locator('button').filter({ hasText: '🗑️' });
        
        if (await deleteButton.isVisible()) {
          await deleteButton.click();
          await page.waitForTimeout(500);
        }
      }
    }
  } catch (error) {
    console.log('⚠️ Error cleaning up test assets:', error.message);
  }
}

async function cleanupTestTags(page) {
  try {
    // Switch to Tags tab
    await page.click('button:has-text("Tags")');
    await page.waitForTimeout(1000);
    
    // Look for test tags
    const testRows = page.locator('table tbody tr').filter({ hasText: /test|e2e/i });
    const count = await testRows.count();
    
    if (count > 0) {
      console.log(`🗑️ Found ${count} test tags to clean up`);

      // Delete each test tag
      for (let i = 0; i < count; i++) {
        const row = testRows.nth(i);
        const deleteButton = row.locator('button').filter({ hasText: '🗑️' });
        
        if (await deleteButton.isVisible()) {
          await deleteButton.click();
          await page.waitForTimeout(500);
        }
      }
    }
  } catch (error) {
    console.log('⚠️ Error cleaning up test tags:', error.message);
  }
}

async function cleanupTestTransactions(page) {
  try {
    // Navigate to transactions page
    await page.goto('http://localhost:3000/');
    await page.waitForTimeout(1000);
    
    // Look for test transactions
    const testRows = page.locator('table tbody tr').filter({ hasText: /test|e2e/i });
    const count = await testRows.count();
    
    if (count > 0) {
      console.log(`🗑️ Found ${count} test transactions to clean up`);

      // Delete each test transaction
      for (let i = 0; i < count; i++) {
        const row = testRows.nth(i);
        const deleteButton = row.locator('button').filter({ hasText: 'Delete' });
        
        if (await deleteButton.isVisible()) {
          await deleteButton.click();
          await page.waitForTimeout(500);
        }
      }
    }
  } catch (error) {
    console.log('⚠️ Error cleaning up test transactions:', error.message);
  }
}

export default globalTeardown;
