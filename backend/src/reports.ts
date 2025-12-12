import { Router } from 'express';
import { store } from './store';
import { priceService } from './priceService';

export const reportsRouter = Router();

async function usdToVnd(): Promise<number> {
  try {
    const vnd = await priceService.getRateUSD({ type: 'FIAT', symbol: 'VND' });
    // vnd.rateUSD is 1 VND -> USD, so USD->VND = 1 / rateUSD
    return vnd.rateUSD > 0 ? 1 / vnd.rateUSD : 24000;
  } catch {
    return 24000;
  }
}

reportsRouter.get('/reports/holdings', async (_req, res) => {
  try {
    const r = await store.report();
    const vndRate = await usdToVnd();
    const totalUSD = r.totals.holdingsUSD;
    const rows = r.holdings.map(h => ({
      asset: h.asset.symbol,
      account: h.account ?? 'Portfolio',
      quantity: h.balance,
      value_usd: h.valueUSD,
      value_vnd: h.valueUSD * vndRate,
      percentage: totalUSD > 0 ? (h.valueUSD / totalUSD) * 100 : 0,
      last_updated: new Date().toISOString(),
    }));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to generate holdings' });
  }
});

reportsRouter.get('/reports/holdings/summary', async (_req, res) => {
  try {
    const r = await store.report();
    const vndRate = await usdToVnd();
    const by_asset: Record<string, { quantity: number; value_usd: number; value_vnd: number; percentage: number }> = {};
    const totalUSD = r.totals.holdingsUSD;
    for (const h of r.holdings) {
      const key = h.asset.symbol;
      by_asset[key] = {
        quantity: h.balance,
        value_usd: h.valueUSD,
        value_vnd: h.valueUSD * vndRate,
        percentage: totalUSD > 0 ? (h.valueUSD / totalUSD) * 100 : 0,
      };
    }
    res.json({
      by_asset,
      total_value_usd: totalUSD,
      total_value_vnd: totalUSD * vndRate,
      last_updated: new Date().toISOString(),
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to generate holdings summary' });
  }
});

// Minimal stubs for other report endpoints expected by frontend
reportsRouter.get('/reports/cashflow', async (_req, res) => {
  res.json({
    combined_in_usd: 0,
    combined_in_vnd: 0,
    combined_out_usd: 0,
    combined_out_vnd: 0,
    combined_net_usd: 0,
    combined_net_vnd: 0,
    total_in_usd: 0,
    total_out_usd: 0,
    net_usd: 0,
    total_in_vnd: 0,
    total_out_vnd: 0,
    net_vnd: 0,
    operating_in_usd: 0,
    operating_in_vnd: 0,
    operating_out_usd: 0,
    operating_out_vnd: 0,
    operating_net_usd: 0,
    operating_net_vnd: 0,
    financing_in_usd: 0,
    financing_in_vnd: 0,
    financing_out_usd: 0,
    financing_out_vnd: 0,
    financing_net_usd: 0,
    financing_net_vnd: 0,
    by_type: {},
  });
});

reportsRouter.get('/reports/spending', async (_req, res) => {
  res.json({
    total_usd: 0,
    total_vnd: 0,
    by_tag: {},
    daily: [],
  });
});

reportsRouter.get('/reports/pnl', async (_req, res) => {
  res.json({
    realized_pnl_usd: 0,
    realized_pnl_vnd: 0,
    total_pnl_usd: 0,
    total_pnl_vnd: 0,
    roi_percent: 0,
    by_asset: {},
  });
});

