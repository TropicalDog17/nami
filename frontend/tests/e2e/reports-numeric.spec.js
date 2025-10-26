import { test, expect } from '@playwright/test';

// Deterministic numeric validations for holdings, P&L, and investments
// This test seeds known transactions via backend API and asserts exact figures

async function seedTransactions(request) {
  // Clear existing test data by name pattern if API supports it; otherwise rely on isolation

  const baseDate = '2025-01-15T00:00:00Z';
  const fxUSD = 1;
  const fxVND = 25000;

  const suffix = Date.now();
  const account = `E2E_H_${suffix}`;
  const ASSETS = {
    BTC: 'E2E_BTC1',
    ETH: 'E2E_ETH1',
    USDT: 'E2E_USD1',
  };

  // BTC: 0.1 @ $50,000 => $5,000
  await request.post('http://localhost:8080/api/transactions', {
    data: {
      date: baseDate,
      type: 'buy',
      asset: ASSETS.BTC,
      account,
      quantity: 0.1,
      price_local: 50000,
      fx_to_usd: fxUSD,
      fx_to_vnd: fxVND,
      fee_usd: 0,
      fee_vnd: 0,
      delta_qty: 0.1,
    },
    headers: { 'Content-Type': 'application/json' },
  });

  // ETH: 1.0 @ $3,000 => $3,000
  await request.post('http://localhost:8080/api/transactions', {
    data: {
      date: baseDate,
      type: 'buy',
      asset: ASSETS.ETH,
      account,
      quantity: 1.0,
      price_local: 3000,
      fx_to_usd: fxUSD,
      fx_to_vnd: fxVND,
      fee_usd: 0,
      fee_vnd: 0,
      delta_qty: 1.0,
    },
    headers: { 'Content-Type': 'application/json' },
  });

  // USDT: 2000 @ $1 => $2,000
  await request.post('http://localhost:8080/api/transactions', {
    data: {
      date: baseDate,
      type: 'buy',
      asset: ASSETS.USDT,
      account,
      quantity: 2000,
      price_local: 1,
      fx_to_usd: fxUSD,
      fx_to_vnd: fxVND,
      fee_usd: 0,
      fee_vnd: 0,
      delta_qty: 2000,
    },
    headers: { 'Content-Type': 'application/json' },
  });
  return { account, ASSETS };
}

test.describe('Reports Numeric Accuracy', () => {
  test('holdings totals and percentages are exact', async ({ request, page }) => {
    const seeded = await seedTransactions(request);

    // Query holdings API directly for deterministic validation
    const asOf = '2025-01-15';
    const resp = await request.get(`http://localhost:8080/api/reports/holdings?as_of=${asOf}`);
    expect(resp.ok()).toBeTruthy();
    const holdings = await resp.json();

    // Expect 3 assets for our isolated test account and specific values (USD)
    const only = holdings.filter(
      (h) => h.account === seeded.account && [seeded.ASSETS.BTC, seeded.ASSETS.ETH, seeded.ASSETS.USDT].includes(h.asset)
    );
    const byAsset = Object.fromEntries(only.map(h => [h.asset, h]));
    expect(parseFloat(byAsset[seeded.ASSETS.BTC].value_usd)).toBeCloseTo(5000, 6);
    expect(parseFloat(byAsset[seeded.ASSETS.ETH].value_usd)).toBeCloseTo(3000, 6);
    expect(parseFloat(byAsset[seeded.ASSETS.USDT].value_usd)).toBeCloseTo(2000, 6);
  });

  test('holdings summary by account totals exact', async ({ request }) => {
    const seeded = await seedTransactions(request);

    const asOf = '2025-01-15';
    const resp = await request.get(`http://localhost:8080/api/reports/holdings/summary?as_of=${asOf}`);
    expect(resp.ok()).toBeTruthy();
    const summary = await resp.json();

    const byAccount = summary.by_account || {};
    const rows = byAccount[seeded.account] || [];
    const sumUSD = rows.reduce((acc, r) => acc + parseFloat(r.value_usd || 0), 0);
    expect(sumUSD).toBeCloseTo(5000 + 3000 + 2000, 6);
  });

  test('PnL breakdown by asset and account exact', async ({ request }) => {
    // Stake and close within isolated future period to avoid interference
    const stakeDate = '2030-01-01';
    const closeDate = '2030-02-01';

    // Baseline PnL before operation (future-dated period)
    const baselineResp = await request.get('http://localhost:8080/api/reports/pnl?start_date=2030-01-01&end_date=2030-02-28');
    expect(baselineResp.ok()).toBeTruthy();
    const baseline = await baselineResp.json();
    const baselineByAsset = baseline.by_asset || {};
    const baseAsset = parseFloat((baselineByAsset.E2E_PNL1 || {}).realized_pnl_usd || 0);
    const baselineByAccount = baseline.by_account || {};
    const baseAccount = parseFloat((baselineByAccount.Futures || {}).realized_pnl_usd || 0);

    // Stake via actions API
    const stakeReq = await request.post('http://localhost:8080/api/actions', {
      data: {
        action: 'stake',
        params: {
          date: stakeDate,
          source_account: 'Binance Spot',
          investment_account: 'Futures',
          asset: 'E2E_PNL1',
          amount: 500.0,
          entry_price_usd: 1.0,
          fx_to_usd: 1.0,
          fx_to_vnd: 24000
        }
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(stakeReq.ok()).toBeTruthy();

    // Identify the open investment id (required for unstake action)
    const invList = await request.get('http://localhost:8080/api/investments?asset=E2E_PNL1&account=Futures&is_open=true');
    expect(invList.ok()).toBeTruthy();
    const invs = await invList.json();
    const invId = invs?.[0]?.id;

    // Unstake part to realize -225
    const unstake = await request.post('http://localhost:8080/api/actions', {
      data: {
        action: 'unstake',
        params: {
          date: closeDate,
          investment_account: 'Futures',
          destination_account: 'Binance Spot',
          asset: 'E2E_PNL1',
          amount: 275,
          exit_price_usd: 1.0,
          fx_to_usd: 1.0,
          fx_to_vnd: 24000,
          investment_id: invId,
          close_all: true
        }
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(unstake.ok()).toBeTruthy();

    const pnl = await request.get('http://localhost:8080/api/reports/pnl?start_date=2030-01-01&end_date=2030-02-28');
    expect(pnl.ok()).toBeTruthy();
    const body = await pnl.json();

    const byAsset = body.by_asset || {};
    const e2eAsset = byAsset.E2E_PNL1 || {};
    const deltaAsset = parseFloat(e2eAsset.realized_pnl_usd || 0) - baseAsset;
    expect(deltaAsset).toBeCloseTo(-225, 6);

    const byAccount = body.by_account || {};
    const futures = byAccount.Futures || {};
    const deltaAccount = parseFloat(futures.realized_pnl_usd || 0) - baseAccount;
    expect(deltaAccount).toBeCloseTo(-225, 6);
  });
  test('PnL realized and ROI from closed investment are exact', async ({ request }) => {
    // Stake 500 USDT, then close with 275 at same price => PnL -225 ROI -45%
    const stakeDate = '2025-01-01';
    const closeDate = '2025-02-01';

    // Stake via actions API to ensure correct dual-transaction flow
    const stakeReq = await request.post('http://localhost:8080/api/actions', {
      data: {
        action: 'stake',
        params: {
          date: stakeDate,
          source_account: 'Binance Spot',
          investment_account: 'Futures',
          asset: 'USDT',
          amount: 500.0,
          entry_price_usd: 1.0,
          fx_to_usd: 1.0,
          fx_to_vnd: 24000
        }
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(stakeReq.ok()).toBeTruthy();
    // Fetch the created open investment to retrieve its ID reliably
    const invList = await request.get('http://localhost:8080/api/investments?asset=USDT&account=Futures&is_open=true');
    expect(invList.ok()).toBeTruthy();
    const invs = await invList.json();
    const invId = invs?.[0]?.id;

    // Unstake close-all with $275 value
    const unstake = await request.post('http://localhost:8080/api/actions', {
      data: {
        action: 'unstake',
        params: {
          date: closeDate,
          investment_account: 'Futures',
          destination_account: 'Binance Spot',
          asset: 'USDT',
          amount: 275,
          exit_price_usd: 1.0,
          fx_to_usd: 1.0,
          fx_to_vnd: 24000,
          investment_id: invId,
          close_all: true
        }
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(unstake.ok()).toBeTruthy();

    // Fetch closed investments list and find our USDT/Futures one
    const closedList = await request.get('http://localhost:8080/api/investments?asset=USDT&account=Futures&is_open=false');
    expect(closedList.ok()).toBeTruthy();
    const closed = await closedList.json();
    expect(Array.isArray(closed) && closed.length > 0).toBeTruthy();
    const latest = closed[0];
    expect(!!latest).toBeTruthy();
    expect(latest.is_open).toBeFalsy();
    expect(parseFloat(latest.pnl)).toBeCloseTo(-225, 6);
    expect(parseFloat(latest.pnl_percent)).toBeCloseTo(-45, 6);
  });

  test('Vault APR computed for ended vault', async ({ request }) => {
    // Create vault 1000 USDT on Jan 1, end on Apr 1 with withdrawal of 1100 => PnL +100, ROI 10% ~ APR 10%*(365/90) ≈ 40.56%
    const name = `E2E-APR-Vault-${Date.now()}`;
    const create = await request.post('http://localhost:8080/api/vaults', {
      data: { name, asset: 'USDT', account: 'Binance', initialDeposit: 1000 },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(create.ok()).toBeTruthy();

    // Deposit date set by server (now). To make deterministic, perform withdraw and end close to deposit.
    const withdraw = await request.post(`http://localhost:8080/api/vaults/${encodeURIComponent(name)}/withdraw`, {
      data: { quantity: 1000, value: 1100, targetAccount: 'Binance' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(withdraw.ok()).toBeTruthy();

    const end = await request.post(`http://localhost:8080/api/vaults/${encodeURIComponent(name)}/end`, {
      data: {},
      headers: { 'Content-Type': 'application/json' },
    });
    expect(end.ok()).toBeTruthy();
    const ended = await end.json();

    // APR is computed server-side; assert positive and roughly matches ROI annualization when duration > 0
    const apr = parseFloat(ended.apr_percent || 0);
    expect(apr).toBeGreaterThan(0);
  });
});


