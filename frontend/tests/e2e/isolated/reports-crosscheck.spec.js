import { test, expect } from '@playwright/test';
import { gotoAndWait, waitForBackendHealth } from '../utils/test-utils.js';

const BACKEND = process.env.VITE_API_BASE_URL || 'http://localhost:8001';

async function ensureAccount(request, name) {
  const payload = { name, type: 'bank', is_active: true };
  const res = await request.post(`${BACKEND}/api/admin/accounts`, { data: payload });
  if (!res.ok()) {
    const status = res.status();
    if (status !== 409) {
      throw new Error(`Failed to create account: ${status} ${await res.text()}`);
    }
  }
}

async function ensureAsset(request, symbol = 'USD') {
  const payload = { symbol, name: symbol, decimals: 2, is_active: true };
  const res = await request.post(`${BACKEND}/api/admin/assets`, { data: payload });
  if (!res.ok()) {
    const status = res.status();
    if (status !== 409) {
      throw new Error(`Failed to create asset: ${status} ${await res.text()}`);
    }
  }
}

async function createTx(request, { type, amount, account }) {
  const qty = Number(amount);
  const body = {
    date: new Date().toISOString(),
    type,
    asset: 'USD',
    account,
    quantity: qty,
    price_local: 1,
    amount_local: qty,
    fx_to_usd: 1,
    fx_to_vnd: 24000,
    amount_usd: qty,
    amount_vnd: qty * 24000,
  };
  const res = await request.post(`${BACKEND}/api/transactions`, { data: body });
  if (!res.ok()) throw new Error(`Create tx failed: ${res.status()} ${await res.text()}`);
}

async function fetchCashflowBackend(request, start, end) {
  const url = `${BACKEND}/api/reports/cashflow?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}`;
  const res = await request.get(url);
  if (!res.ok()) throw new Error(`Cashflow report failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

function parseCurrencyToNumber(s) {
  // Expect strings like "$1,234" or "₫24,000"
  const m = String(s).replace(/[^0-9.-]/g, '');
  const num = parseFloat(m || '0');
  return isNaN(num) ? 0 : num;
}

async function readCardNumber(page, headingText) {
  const card = page.getByText(headingText).locator('xpath=..');
  const text = await card.locator('xpath=./following-sibling::*[1]').innerText();
  return parseCurrencyToNumber(text);
}

// Seed known inflow/outflow and verify FE numbers match backend report

test.describe('Reports - Cashflow cross-check', () => {
  test('Combined In/Out/Net match backend for USD income/expense', async ({ page, request }) => {
    await waitForBackendHealth(request, { baseUrl: BACKEND });
    const account = 'CF-Test';
    await ensureAccount(request, account);
    await ensureAsset(request, 'USD');

    // Create 2 incomes ($100, $50) and 1 expense ($40)
    await createTx(request, { type: 'income', amount: 100, account });
    await createTx(request, { type: 'income', amount: 50, account });
    await createTx(request, { type: 'expense', amount: 40, account });

    // Compute expected from backend API
    const today = new Date().toISOString().split('T')[0];
    const backend = await fetchCashflowBackend(request, today, today);
    const expectedIn = Number(backend.total_in_usd ?? backend.combined_in_usd ?? 0);
    const expectedOut = Number(backend.total_out_usd ?? backend.combined_out_usd ?? 0);
    const expectedNet = Number(backend.net_usd ?? backend.combined_net_usd ?? 0);

    // Navigate to Reports -> Cash Flow
    await gotoAndWait(page, '/reports');
    await page.getByTestId('reports-tab-cashflow').click();
    await expect(page.getByTestId('reports-section-title-cashflow')).toBeVisible();

    // Select Quick Preset Last 7 Days to include today
    await page.selectOption('select:has-text("Custom Range")', '7').catch(() => {});

    // Read cards
    const uiIn = await readCardNumber(page, 'Combined Inflow');
    const uiOut = await readCardNumber(page, 'Combined Outflow');
    const uiNet = await readCardNumber(page, 'Combined Net');

    // Compare within tolerance (USD integers expected here)
    expect(Math.round(uiIn)).toBe(Math.round(expectedIn));
    expect(Math.round(uiOut)).toBe(Math.round(expectedOut));
    expect(Math.round(uiNet)).toBe(Math.round(expectedNet));
  });
});

