import { test, expect } from '@playwright/test';
import { gotoAndWait, waitForBackendHealth, uniqueName } from '../utils/test-utils.js';

const BACKEND = process.env.VITE_API_BASE_URL || 'http://localhost:8001';

async function stake(request, { asset = 'ETH', account = 'InvestAcct', qty = 3, price = 1000 }) {
  const body = {
    date: new Date().toISOString(),
    type: 'stake',
    asset,
    account,
    quantity: String(qty),
    price_local: String(price),
    amount_local: String(qty * price),
    fx_to_usd: '1',
    fx_to_vnd: '24000',
    amount_usd: String(qty * price),
    amount_vnd: String(qty * price * 24000),
  };
  const res = await request.post(`${BACKEND}/api/investments/stake`, { data: body });
  if (!res.ok()) throw new Error(`Stake failed: ${res.status()} ${await res.text()}`);
}

async function unstake(request, { asset = 'ETH', account = 'InvestAcct', qty = 1, price = 1200, investmentId }) {
  const body = {
    date: new Date().toISOString(),
    type: 'unstake',
    asset,
    account,
    quantity: String(qty),
    price_local: String(price),
    amount_local: String(qty * price),
    fx_to_usd: '1',
    fx_to_vnd: '24000',
    amount_usd: String(qty * price),
    amount_vnd: String(qty * price * 24000),
    investment_id: investmentId || undefined,
  };
  const res = await request.post(`${BACKEND}/api/investments/unstake`, { data: body });
  if (!res.ok()) throw new Error(`Unstake failed: ${res.status()} ${await res.text()}`);
}

async function getFirstInvestment(request, asset, account) {
  const res = await request.get(`${BACKEND}/api/investments?asset=${encodeURIComponent(asset)}&account=${encodeURIComponent(account)}`);
  if (!res.ok()) throw new Error(`List investments failed: ${res.status()} ${await res.text()}`);
  const arr = await res.json();
  return Array.isArray(arr) ? arr[0] : null;
}

test.describe('Investments lifecycle -> Holdings report', () => {
  test('stake then partial unstake reflected in holdings report', async ({ page, request }) => {
    await waitForBackendHealth(request, { baseUrl: BACKEND });
    const asset = 'ETH';
    const account = `Acct-${uniqueName('inv')}`;

    await stake(request, { asset, account, qty: 3, price: 1000 });
    const inv = await getFirstInvestment(request, asset, account);
    expect(inv).toBeTruthy();

    await unstake(request, { asset, account, qty: 1, price: 1200, investmentId: inv.id });

    // Navigate to Reports holdings
    await gotoAndWait(page, '/reports');
    await page.getByTestId('reports-tab-holdings').click();
    await expect(page.getByTestId('reports-section-title-holdings')).toBeVisible();

    // Verify the asset/account texts appear somewhere in the holdings table
    await expect(page.getByText(asset, { exact: false })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(account, { exact: false })).toBeVisible({ timeout: 15000 });
  });
});

