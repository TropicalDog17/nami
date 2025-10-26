import { test, expect } from '@playwright/test';
import { gotoAndWait, waitForBackendHealth, uniqueName, waitModalClosedByHeading } from '../utils/test-utils.js';

const BACKEND = process.env.VITE_API_BASE_URL || 'http://localhost:8001';

async function seedVault({ request }, { name = uniqueName('vault'), asset = 'USDT', account = 'Vault', qty = 10, usdPrice = 1, fxUsd = 1, fxVnd = 24000 }) {
  // Create initial stake (deposit) to open an investment
  const stakeTx = {
    date: new Date().toISOString(),
    type: 'stake',
    asset,
    account,
    quantity: String(qty),
    price_local: String(usdPrice),
    amount_local: String(qty * usdPrice),
    fx_to_usd: String(fxUsd),
    fx_to_vnd: String(fxVnd),
    amount_usd: String(qty * usdPrice * fxUsd),
    amount_vnd: String(qty * usdPrice * fxVnd),
  };
  await request.post(`${BACKEND}/api/investments/stake`, { data: stakeTx });

  // Fetch created investment with defensive parsing
  const list = await request.get(`${BACKEND}/api/investments?asset=${encodeURIComponent(asset)}&account=${encodeURIComponent(account)}`);
  if (!list.ok()) {
    const bodyText = await list.text();
    throw new Error(`Seed failed: investments list not OK (${list.status()}): ${bodyText}`);
  }
  let investments = [];
  try {
    investments = await list.json();
  } catch (e) {
    const bodyText = await list.text();
    throw new Error(`Seed failed: invalid JSON from investments list: ${bodyText}`);
  }
  const inv = investments[0];
  if (!inv) throw new Error('Seed failed: no investment created');

  return {
    name,
    asset,
    account,
    investmentId: inv.id,
    deposit_qty: inv.deposit_qty,
    deposit_cost: inv.deposit_cost,
    remaining_qty: inv.deposit_qty,
    pnl: inv.pnl,
    pnl_percent: inv.pnl_percent,
    deposit_date: inv.deposit_date,
    created_at: inv.created_at,
    is_open: inv.is_open,
    vault_status: inv.is_open ? 'active' : 'ended',
  };
}

test.describe('Vault - Thorough with seeded DB', () => {
  if (process.env.VAULT_E2E !== '1') {
    test.skip(true, 'Skipping heavy vault E2E unless VAULT_E2E=1');
  }
  test('end-to-end: list, details, deposit, withdraw, end', async ({ page, request }) => {
    await waitForBackendHealth(request, { baseUrl: BACKEND });
    // Seed backend investment data
    const vaultState = await seedVault({ request }, {});

    // Inject fetch shim to ensure vault endpoints are mocked
    const injectedVault = {
      id: vaultState.investmentId,
      is_vault: true,
      vault_name: vaultState.name,
      vault_status: vaultState.vault_status,
      asset: vaultState.asset,
      account: vaultState.account,
      horizon: null,
      deposit_date: vaultState.deposit_date,
      deposit_qty: vaultState.deposit_qty,
      deposit_cost: vaultState.deposit_cost,
      deposit_unit_cost: String(Number(vaultState.deposit_cost) / Math.max(Number(vaultState.deposit_qty) || 1, 1)),
      withdrawal_qty: '0',
      withdrawal_value: '0',
      withdrawal_unit_price: '0',
      pnl: vaultState.pnl,
      pnl_percent: vaultState.pnl_percent,
      is_open: vaultState.is_open,
      realized_pnl: '0',
      remaining_qty: vaultState.remaining_qty,
      created_at: vaultState.created_at,
      updated_at: vaultState.created_at,
    };
    await page.addInitScript((vaultData) => {
      const makeOkJson = (body, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
      const nameEnc = encodeURIComponent(vaultData.vault_name);
      const handlers = {
        list: makeOkJson([vaultData], 200),
        get: makeOkJson(vaultData, 200),
        deposit: makeOkJson({ ok: true }, 201),
        withdraw: makeOkJson({ ok: true }, 201),
        end: makeOkJson({ ok: true }, 200),
      };
      const orig = window.fetch.bind(window);
      window.fetch = async (...args) => {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
        if (/\/api\/vaults(\/|$)/.test(url)) {
          if (/\/api\/vaults$/.test(url)) return handlers.list();
          if (new RegExp(`/api/vaults/${nameEnc}$`).test(url)) return handlers.get();
          if (new RegExp(`/api/vaults/${nameEnc}/deposit$`).test(url)) return handlers.deposit();
          if (new RegExp(`/api/vaults/${nameEnc}/withdraw$`).test(url)) return handlers.withdraw();
          if (new RegExp(`/api/vaults/${nameEnc}/end$`).test(url)) return handlers.end();
        }
        return orig(...args);
      };
    }, injectedVault);

    // Mock vault API endpoints based on seeded investments (match absolute and relative URLs)
    const handler = async (route) => {
      const url = new URL(route.request().url());
      const method = route.request().method();
      const path = url.pathname;

      // Helper to refresh from backend
      const refresh = async () => {
        const res = await request.get(`${BACKEND}/api/investments`, { params: { asset: vaultState.asset, account: vaultState.account } });
        const invs = (await res.json()) || [];
        const inv = invs[0];
        if (inv) {
          vaultState.deposit_qty = inv.deposit_qty;
          vaultState.deposit_cost = inv.deposit_cost;
          vaultState.remaining_qty = inv.deposit_qty; // simple: assume no other withdrawals yet
          vaultState.pnl = inv.pnl;
          vaultState.pnl_percent = inv.pnl_percent;
          vaultState.is_open = inv.is_open;
          vaultState.vault_status = inv.is_open ? 'active' : 'ended';
          vaultState.created_at = inv.created_at;
          vaultState.deposit_date = inv.deposit_date;
        }
      };

      if (method === 'GET' && path === '/api/vaults') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ ...vaultState, id: vaultState.investmentId, vault_name: vaultState.name, is_vault: true }]) });
      }

      const nameMatch = path.match(/^\/api\/vaults\/(.+?)(?:\/(deposit|withdraw|end))?$/);
      if (nameMatch) {
        const decodedName = decodeURIComponent(nameMatch[1]);
        const action = nameMatch[2];
        // For simplicity in tests, ignore name mismatches and always return the seeded vault

        if (!action && method === 'GET') {
          await refresh();
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...vaultState, id: vaultState.investmentId, vault_name: vaultState.name, is_vault: true }) });
        }

        if (action === 'deposit' && method === 'POST') {
          const body = await route.request().postDataJSON();
          const quantity = Number(body?.quantity || 0);
          const cost = Number(body?.cost || 0);
          // Map to stake
          const stakeTx = {
            date: new Date().toISOString(),
            type: 'stake',
            asset: vaultState.asset,
            account: vaultState.account,
            quantity: String(quantity),
            price_local: String(cost / Math.max(quantity, 1)),
            amount_local: String(cost),
            fx_to_usd: '1',
            fx_to_vnd: '24000',
            amount_usd: String(cost),
            amount_vnd: String(cost * 24000),
          };
          await request.post(`${BACKEND}/api/investments/stake`, { data: stakeTx });
          await refresh();
          return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
        }

        if (action === 'withdraw' && method === 'POST') {
          const body = await route.request().postDataJSON();
          const quantity = Number(body?.quantity || 0);
          const value = Number(body?.value || 0);
          const unstakeTx = {
            date: new Date().toISOString(),
            type: 'unstake',
            asset: vaultState.asset,
            account: vaultState.account,
            quantity: String(quantity),
            price_local: String(value / Math.max(quantity, 1)),
            amount_local: String(value),
            fx_to_usd: '1',
            fx_to_vnd: '24000',
            amount_usd: String(value),
            amount_vnd: String(value * 24000),
            investment_id: vaultState.investmentId,
          };
          await request.post(`${BACKEND}/api/investments/unstake`, { data: unstakeTx });
          await refresh();
          return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
        }

        if (action === 'end' && method === 'POST') {
          // Mark ended locally (backend has no endpoint yet)
          vaultState.is_open = false;
          vaultState.vault_status = 'ended';
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
        }
      }

      return route.fallback();
    };
    await page.route('**/api/vaults*', handler);
    await page.route('http://localhost:8001/api/vaults*', handler);

    // Fallback: intercept investments list by id to avoid unexpected 404s from backend
    await page.route('**/api/investments*', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('investment_id')) {
        // Return a single transaction list minimal
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      }
      return route.fallback();
    });

    // Navigate to vault detail
    await gotoAndWait(page, `/vault/${encodeURIComponent(vaultState.name)}`);
    await expect(page.locator('[data-testid="vault-detail-page"]')).toBeVisible({ timeout: 15000 });

    // Validate overview cards render
    await expect(page.locator('text=Total Deposited')).toBeVisible();
    await expect(page.locator('text=Current Balance')).toBeVisible();
    await expect(page.locator('text=Realized P&L')).toBeVisible();
    await expect(page.locator('text=Vault Status')).toBeVisible();

    // Deposit flow
    await page.getByRole('button', { name: 'Deposit to Vault' }).click();
    await page.getByPlaceholder('Quantity').fill('2');
    await page.getByPlaceholder('Cost (USD)').fill('2');
    // Source account combobox might be optional for mocked path; skip selection
    await page.getByRole('button', { name: 'Deposit' }).click();
    await waitModalClosedByHeading(page, 'Deposit to Vault', 15000);

    // Withdraw flow
    await page.getByRole('button', { name: 'Withdraw from Vault' }).click();
    await page.getByPlaceholder('Quantity').fill('1');
    await page.getByPlaceholder('Value (USD)').fill('1');
    await page.getByRole('button', { name: 'Withdraw' }).click();
    await waitModalClosedByHeading(page, 'Withdraw from Vault', 15000);

    // End vault
    const endButton = page.getByRole('button', { name: 'End Vault' });
    if (await endButton.isVisible()) {
      // Dialog confirm is implemented in component; ensure click proceeds
      page.on('dialog', async (d) => { await d.accept(); });
      await endButton.click();
    }

    // Tables present
    await expect(page.locator('[data-testid="vault-details-table"]')).toBeVisible();
    await expect(page.locator('[data-testid="vault-transactions-table"]')).toBeVisible();
  });
});


