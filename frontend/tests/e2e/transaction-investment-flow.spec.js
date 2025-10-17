import { test, expect } from '@playwright/test';

test.describe('Transaction Quick Add - Investment Flow', () => {
  test('should show validation errors for stake/unstake modes', async ({ page }) => {
    await page.goto('/');

    // Open Quick Add panel
    const quickAddBtn = page.locator('button:has-text("Quick Add")');
    await quickAddBtn.click();

    // Ensure Quick Add panel visible
    await expect(page.locator('text=Quick Add')).toBeVisible();

    // Switch Investment mode to Stake
    const invModeSelect = page.locator('label:has-text("Investment")').locator('..').locator('select');
    await invModeSelect.selectOption('stake');

    // Click Add without required investment account => expect validation error
    const addBtn = page.locator('button:has-text("Add")').first();
    await addBtn.click();
    await expect(page.locator('text=Investment account is required')).toBeVisible();

    // Switch to Unstake mode -> requires selecting an active investment
    await invModeSelect.selectOption('unstake');
    await addBtn.click();
    await expect(page.locator('text=Select an active investment')).toBeVisible();

    // Switch back to None mode; error banner should disappear on next valid input attempt
    await invModeSelect.selectOption('none');
  });
});


