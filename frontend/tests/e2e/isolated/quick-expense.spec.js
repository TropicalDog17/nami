import { test, expect } from '@playwright/test';
import { gotoAndWait, waitForBackendHealth, uniqueName, waitModalClosedByHeading } from '../utils/test-utils.js';

const BACKEND = process.env.VITE_API_BASE_URL || 'http://localhost:8001';

async function ensureAccount(request, name) {
  const payload = { name, type: 'bank', is_active: true };
  const res = await request.post(`${BACKEND}/api/admin/accounts`, { data: payload });
  if (!res.ok()) {
    const status = res.status();
    if (status !== 409) {
      const body = await res.text();
      throw new Error(`Failed to create account (${status}): ${body}`);
    }
  }
}

async function ensureTag(request, name) {
  const payload = { name, category: 'General', is_active: true };
  const res = await request.post(`${BACKEND}/api/admin/tags`, { data: payload });
  if (!res.ok()) {
    const status = res.status();
    if (status !== 409) {
      const body = await res.text();
      throw new Error(`Failed to create tag (${status}): ${body}`);
    }
  }
}

async function ensureAsset(request, symbol = 'USD') {
  const payload = { symbol, name: symbol, decimals: 2, is_active: true };
  const res = await request.post(`${BACKEND}/api/admin/assets`, { data: payload });
  if (!res.ok()) {
    const status = res.status();
    if (status !== 409) {
      const body = await res.text();
      throw new Error(`Failed to create asset (${status}): ${body}`);
    }
  }
}

// End-to-end: Create an Expense via Quick Add -> Expense and verify it persists and renders in the Transactions table
// Requires test backend running at BACKEND (default http://localhost:8001)

test.describe('Quick Expense - end-to-end', () => {
  test('create expense via modal and verify in list (DB-backed)', async ({ page, request }) => {
    await waitForBackendHealth(request, { baseUrl: BACKEND });

    // Seed minimal master data
    const accountName = 'Test Bank';
    const tagName = 'Groceries';
    await ensureAccount(request, accountName);
    await ensureTag(request, tagName);
    await ensureAsset(request, 'USD');

    const payee = `Store ${uniqueName('payee')}`;
    const note = `E2E Expense ${uniqueName('note')}`;

    // Navigate to Transactions page
    await gotoAndWait(page, '/');

    // Open Quick Add -> Expense
    await page.getByRole('button', { name: /Quick Add/i }).click();
    await page.getByRole('button', { name: /^Expense$/i }).click();

    // Modal visible
    await expect(page.getByText('Quick Expense Entry').first()).toBeVisible({ timeout: 15000 });

    // Fill amount
    await page.getByLabel('Amount').fill('12.34');

    // Select paying account
    await page.getByLabel('Paying Account').selectOption({ label: accountName });

    // Select currency (optional if default is USD)
    const currencySelect = page.getByLabel('Currency');
    if (await currencySelect.isVisible().catch(() => false)) {
      await currencySelect.selectOption({ value: 'USD' });
    }

    // Select category (tag)
    await page.getByLabel('Category').selectOption({ label: tagName });

    // Fill payee and note
    await page.getByLabel('Payee').fill(payee);
    await page.getByLabel('Note').fill(note);

    // Observe POST /api/transactions
    const waitCreate = page.waitForResponse((res) => res.request().method() === 'POST' && /\/api\/transactions$/.test(res.url()));

    // Save
    await page.getByRole('button', { name: /Save Expense/i }).click();

    const createRes = await waitCreate;
    expect(createRes.ok()).toBeTruthy();

    // Modal closes
    await waitModalClosedByHeading(page, 'Quick Expense Entry', 15000);

    // Verify it shows up in the table (Counterparty column contains payee)
    await expect(page.getByText(payee, { exact: false })).toBeVisible({ timeout: 15000 });

    // Optionally query backend to assert it exists
    const list = await request.get(`${BACKEND}/api/transactions?limit=50`);
    expect(list.ok()).toBeTruthy();
    const rows = await list.json();
    const found = Array.isArray(rows) && rows.some((r) => {
      try {
        const o = r || {};
        return String(o.counterparty || '').includes(payee) || String(o.note || '').includes(note);
      } catch { return false; }
    });
    expect(found).toBeTruthy();
  });
});

