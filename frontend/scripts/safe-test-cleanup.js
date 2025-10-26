#!/usr/bin/env node

/**
 * Safe test data cleanup script
 * Only deletes data that is clearly marked as test data
 *
 * Run with: node scripts/safe-test-cleanup.js
 */

const { chromium } = require('playwright');

const TEST_PATTERNS = [
  /^\[E2E-TEST\]/,           // Starts with [E2E-TEST]
  /^e2e-test/i,               // Starts with e2e-test
  /^playwright-test/i,         // Starts with playwright-test
  /test-\d{13}$/i,            // Ends with timestamp
  /^test vault/i,              // Test vault names
];

function isSafeToDelete(text) {
  if (!text) return false;

  return TEST_PATTERNS.some(pattern => pattern.test(text));
}

async function safeCleanup() {
  console.log('🧹 Starting SAFE test data cleanup...');
  console.log('⚠️ Only deleting clearly marked test data');

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('http://localhost:3000/admin');
    await page.waitForTimeout(2000);

    page.on('dialog', dialog => {
      console.log('🗑️ Accepting delete confirmation for:', dialog.message());
      dialog.accept();
    });

    await safeCleanupTransactionTypes(page);
    await safeCleanupAccounts(page);
    await safeCleanupAssets(page);
    await safeCleanupTags(page);
    await safeCleanupTransactions(page);

    console.log('✅ Safe cleanup completed');
  } catch (error) {
    console.error('❌ Safe cleanup failed:', error);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function safeCleanupTransactionTypes(page) {
  try {
    await page.click('button:has-text("Transaction Types")');
    await page.waitForTimeout(1000);

    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    let deletedCount = 0;

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const text = await row.textContent();

      if (isSafeToDelete(text)) {
        console.log(`🗑️ Deleting test transaction type: ${text.trim().substring(0, 50)}...`);
        const deleteButton = row.locator('button').filter({ hasText: '🗑️' });

        if (await deleteButton.isVisible()) {
          await deleteButton.click();
          await page.waitForTimeout(500);
          deletedCount++;
        }
      }
    }

    if (deletedCount > 0) {
      console.log(`✅ Deleted ${deletedCount} test transaction types`);
    }
  } catch (error) {
    console.log('⚠️ Error cleaning up transaction types:', error.message);
  }
}

async function safeCleanupAccounts(page) {
  try {
    await page.click('button:has-text("Accounts")');
    await page.waitForTimeout(1000);

    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    let deletedCount = 0;

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const text = await row.textContent();

      if (isSafeToDelete(text)) {
        console.log(`🗑️ Deleting test account: ${text.trim().substring(0, 50)}...`);
        const deleteButton = row.locator('button').filter({ hasText: '🗑️' });

        if (await deleteButton.isVisible()) {
          await deleteButton.click();
          await page.waitForTimeout(500);
          deletedCount++;
        }
      }
    }

    if (deletedCount > 0) {
      console.log(`✅ Deleted ${deletedCount} test accounts`);
    }
  } catch (error) {
    console.log('⚠️ Error cleaning up accounts:', error.message);
  }
}

async function safeCleanupAssets(page) {
  try {
    await page.click('button:has-text("Assets")');
    await page.waitForTimeout(1000);

    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    let deletedCount = 0;

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const text = await row.textContent();

      if (isSafeToDelete(text)) {
        console.log(`🗑️ Deleting test asset: ${text.trim().substring(0, 50)}...`);
        const deleteButton = row.locator('button').filter({ hasText: '🗑️' });

        if (await deleteButton.isVisible()) {
          await deleteButton.click();
          await page.waitForTimeout(500);
          deletedCount++;
        }
      }
    }

    if (deletedCount > 0) {
      console.log(`✅ Deleted ${deletedCount} test assets`);
    }
  } catch (error) {
    console.log('⚠️ Error cleaning up assets:', error.message);
  }
}

async function safeCleanupTags(page) {
  try {
    await page.click('button:has-text("Tags")');
    await page.waitForTimeout(1000);

    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    let deletedCount = 0;

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const text = await row.textContent();

      if (isSafeToDelete(text)) {
        console.log(`🗑️ Deleting test tag: ${text.trim().substring(0, 50)}...`);
        const deleteButton = row.locator('button').filter({ hasText: '🗑️' });

        if (await deleteButton.isVisible()) {
          await deleteButton.click();
          await page.waitForTimeout(500);
          deletedCount++;
        }
      }
    }

    if (deletedCount > 0) {
      console.log(`✅ Deleted ${deletedCount} test tags`);
    }
  } catch (error) {
    console.log('⚠️ Error cleaning up tags:', error.message);
  }
}

async function safeCleanupTransactions(page) {
  try {
    await page.goto('http://localhost:3000/');
    await page.waitForTimeout(1000);

    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    let deletedCount = 0;

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const text = await row.textContent();

      if (isSafeToDelete(text)) {
        console.log(`🗑️ Deleting test transaction: ${text.trim().substring(0, 50)}...`);
        const deleteButton = row.locator('button').filter({ hasText: 'Delete' });

        if (await deleteButton.isVisible()) {
          await deleteButton.click();
          await page.waitForTimeout(500);
          deletedCount++;
        }
      }
    }

    if (deletedCount > 0) {
      console.log(`✅ Deleted ${deletedCount} test transactions`);
    }
  } catch (error) {
    console.log('⚠️ Error cleaning up transactions:', error.message);
  }
}

// Run if called directly
if (require.main === module) {
  safeCleanup().catch(console.error);
}

module.exports = { safeCleanup, isSafeToDelete };