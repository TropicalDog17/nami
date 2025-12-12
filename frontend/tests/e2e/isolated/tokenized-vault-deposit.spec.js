import { test, expect } from '@playwright/test';
import { gotoAndWait, waitForBackendHealth, waitModalClosedByHeading, uniqueName } from '../utils/test-utils.js';

const BACKEND = process.env.VITE_API_BASE_URL || 'http://localhost:8001';

async function ensureAccount(request, name) {
  // Try to create the account; ignore if it already exists
  const payload = { name, type: 'bank', is_active: true };
  try {
    const res = await request.post(`${BACKEND}/api/admin/accounts`, { data: payload });
    if (!res.ok()) {
      // If it's a 409 or similar, ignore; otherwise throw for visibility
      const status = res.status();
      if (status !== 409) {
        const body = await res.text();
        throw new Error(`Failed to create account (${status}): ${body}`);
      }
    }
  } catch (_) {
    // Best effort — account may already exist
  }
}

async function seedTokenizedVault(request) {
  const name = uniqueName('vault');
  const body = {
    name,
    type: 'user_defined',
    token_symbol: 'K',
    token_decimals: 18,
    initial_share_price: '1',
    // Keep fees/limits minimal and allow deposits
    min_deposit_amount: 0,
    min_withdrawal_amount: 0,
    is_deposit_allowed: true,
    is_withdrawal_allowed: true,
    // Manual pricing makes price math straightforward in tests
    enable_manual_pricing: true,
    initial_manual_price: 1,
    initial_total_value: 0,
  };

  const res = await request.post(`${BACKEND}/api/cons-vaults`, { data: body });
  if (!res.ok()) {
    const text = await res.text();
    throw new Error(`Failed to seed tokenized vault (${res.status()}): ${text}`);
  }
  const dto = await res.json();
  return { id: dto.id, name: dto.name };
}

// Regression: Quick Investment "Deposit to Vault" (USD-only) calls tokenized-vaults deposit API and persists in DB
// This mirrors the manual flow shown in the screenshot: select vault, pick account, toggle USD-only, amount, save.
// Assumes backend test server is running on BACKEND (default http://localhost:8001) as configured by playwright-isolated.

test.describe('Tokenized Vaults - Quick Deposit regression (DB-backed)', () => {
  test('USD-only deposit via Transactions -> Quick Add -> New Investment', async ({ page, request }) => {
    await waitForBackendHealth(request, { baseUrl: BACKEND });

    // Seed minimal data in test DB
    const accountName = 'Binance Web3';
    await ensureAccount(request, accountName);
    const vault = await seedTokenizedVault(request);

    // Navigate to Transactions page
    await gotoAndWait(page, '/');

    // Open Quick Add menu -> New Investment
    await page.getByRole('button', { name: /Quick Add/i }).click();
    await page.getByRole('button', { name: /New Investment/i }).click();

    // Modal should appear
    await expect(page.getByText('Deposit to Vault').first()).toBeVisible({ timeout: 15000 });

    // Select the vault in combobox
    await page.getByPlaceholder('Select a vault').fill(vault.name);
    // Choose option by vault id (value shown as first line in option)
    await page.getByRole('button', { name: new RegExp(vault.id) }).click();

    // Select source account (optional, but mirrors real usage)
    const accountInput = page.getByPlaceholder('Select source account');
    await accountInput.fill(accountName);
    // If option exists, click it; otherwise the combobox will keep typed value
    const accOption = page.getByRole('button', { name: new RegExp(accountName) });
    if (await accOption.isVisible().catch(() => false)) {
      await accOption.click();
    }

    // Check USD-only and enter USD amount
    await page.getByLabel('USD-only deposit (enter USD amount only)').check();
    await page.getByLabel('Amount (USD)').fill('350');

    // Watch the deposit request
    const waitDeposit = page.waitForResponse((res) => {
      const u = res.url();
      return res.request().method() === 'POST' && u.includes(`/api/cons-vaults/${vault.id}/deposit`);
    });

    // Save deposit
    await page.getByRole('button', { name: /Save Deposit/i }).click();

    const depositRes = await waitDeposit;
    expect(depositRes.ok()).toBeTruthy();

    // Modal should close
    await waitModalClosedByHeading(page, 'Deposit to Vault', 15000);

    // Verify DB reflects change by reloading the vault
    const reload = await request.get(`${BACKEND}/api/cons-vaults/${vault.id}`);
    expect(reload.ok()).toBeTruthy();
    const dto = await reload.json();
    const aum = parseFloat(String(dto.total_assets_under_management ?? '0'));
    expect(aum).toBeGreaterThan(0);
  });
});

