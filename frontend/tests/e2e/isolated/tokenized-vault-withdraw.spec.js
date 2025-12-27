import { test, expect } from '@playwright/test';
import { gotoAndWait, waitForBackendHealth, uniqueName } from '../utils/test-utils.js';

const BACKEND = process.env.VITE_API_BASE_URL || 'http://localhost:8001';

async function createConsVault(request) {
  const name = uniqueName('vault');
  const body = {
    name,
    type: 'user_defined',
    token_symbol: 'TV',
    token_decimals: 18,
    initial_share_price: '1',
    min_deposit_amount: '0',
    min_withdrawal_amount: '0',
    is_deposit_allowed: true,
    is_withdrawal_allowed: true,
    // manual pricing enabled to keep math simple
    enable_manual_pricing: true,
    initial_manual_price: 1,
    initial_total_value: 0,
  };
  const res = await request.post(`${BACKEND}/api/cons-vaults`, { data: body });
  if (!res.ok()) {
    throw new Error(`Failed to create vault: ${res.status()} ${await res.text()}`);
  }
  const dto = await res.json();
  return { id: dto.id, name: dto.name };
}

async function depositToVault(request, id, amount) {
  const res = await request.post(`${BACKEND}/api/cons-vaults/${id}/deposit`, { data: { amount } });
  if (!res.ok()) throw new Error(`Deposit failed: ${res.status()} ${await res.text()}`);
}

async function withdrawFromVault(request, id, amount) {
  const res = await request.post(`${BACKEND}/api/cons-vaults/${id}/withdraw`, { data: { amount } });
  if (!res.ok()) throw new Error(`Withdraw failed: ${res.status()} ${await res.text()}`);
}

async function getVault(request, id) {
  const res = await request.get(`${BACKEND}/api/cons-vaults/${id}`);
  if (!res.ok()) throw new Error(`Get vault failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

test.describe('Tokenized Vault - Withdraw (DB-backed)', () => {
  test.skip('deposit then withdraw and verify Reports investments reflect AUM', async ({ page, request }) => {
    // Skipped: Investments tab has been removed from Reports page
    await waitForBackendHealth(request, { baseUrl: BACKEND });

    const vault = await createConsVault(request);
    await depositToVault(request, vault.id, 1000);
    await withdrawFromVault(request, vault.id, 200);

    const v = await getVault(request, vault.id);
    const expectedAum = Number(v.total_assets_under_management || 0);
    expect(Math.round(expectedAum)).toBe(800); // 1000 - 200

    // Navigate to Reports -> Investments
    await gotoAndWait(page, '/reports');
    await page.getByTestId('reports-tab-investments').click();
    await expect(page.getByTestId('reports-section-title-investments')).toBeVisible();

    // The investments table should contain our vault by name
    await expect(page.getByText(vault.name, { exact: false })).toBeVisible({ timeout: 15000 });
  });
});
