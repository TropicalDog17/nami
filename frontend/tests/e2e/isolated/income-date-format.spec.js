import { test, expect } from '@playwright/test';
import { gotoAndWait } from '../utils/test-utils.js';

test.describe('Quick Income Modal - Date RFC3339', () => {
  test('sends RFC3339 datetime in POST payload', async ({ page }) => {
    page.on('console', msg => console.log(`BROWSER LOG: ${msg.text()}`));
    // Stub master data endpoints to keep the UI functional offline
    await page.route('**/api/admin/types', async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.route('**/api/admin/accounts', async (route) => {
      await route.fulfill({
        json: [
          { name: 'Test Account', type: 'bank', is_active: true },
        ]
      });
    });
    await page.route('**/api/admin/assets', async (route) => {
      await route.fulfill({
        json: [
          { symbol: 'USD', name: 'US Dollar', is_active: true },
        ]
      });
    });
    await page.route('**/api/admin/tags', async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.route('**/api/transactions', async (route) => {
      if (route.request().method() === 'GET') {
        return route.fulfill({ json: [] });
      }
      return route.continue();
    });

    let capturedBody = null;
    await page.route('**/api/transactions', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const raw = route.request().postData() || '{}';
      try {
        capturedBody = JSON.parse(raw);
      } catch {
        capturedBody = { __parse_error: true, raw };
      }
      // Respond with a fake created transaction
      await route.fulfill({ json: { id: 1, ...capturedBody } });
    });

    await gotoAndWait(page, '/');

    // Open Quick Add menu and choose Income
    await page.getByRole('button', { name: 'Quick Add' }).click();
    await page.getByRole('button', { name: 'Income' }).click();

    // Fill the modal
    const testDate = '2025-10-26';
    await page.locator('input[type="date"]').first().fill(testDate);
    await page.locator('input[type="number"]').first().fill('123.45');
    const accountSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Select account' }) });
    await accountSelect.selectOption({ label: 'Test Account' });
    // Optional fields
    await page.locator('input[placeholder="Employer, Client, Platform"]').fill('Acme Corp');
    await page.locator('input[placeholder^="Optional details"]').fill('E2E date RFC3339 check');

    // Submit
    await page.getByRole('button', { name: 'Save Income' }).click();

    await expect.poll(() => capturedBody, { timeout: 5000 }).not.toBeNull();
    expect(capturedBody?.type).toBe('income');
    expect(capturedBody?.account).toBe('Test Account');
    // Assert RFC3339 (has a time component)
    expect(String(capturedBody?.date)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});


