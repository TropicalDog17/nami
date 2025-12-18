import { Router } from 'express';
import { store } from './store';
import { priceService } from './priceService';
import { Asset, VaultEntry } from './types';

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

function toISODate(d: Date): string {
  const dd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  return dd.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n, 0, 0, 0, 0));
}
function dateDiffInDays(a: Date, b: Date): number {
  const ms = addDays(b, 0).getTime() - addDays(a, 0).getTime();
  return Math.floor(ms / (24 * 3600 * 1000));
}

async function computeMarkToMarketUSD(positions: Map<string, { asset: Asset; units: number }>, at?: string): Promise<number> {
  let aum = 0;
  for (const p of positions.values()) {
    if (Math.abs(p.units) < 1e-12) continue;
    const rate = await priceService.getRateUSD(p.asset, at);
    aum += p.units * rate.rateUSD;
  }
  return aum;
}

async function buildVaultDailySeries(vaultName: string, start?: string, end?: string) {
  const entries = store.getVaultEntries(vaultName).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  if (entries.length === 0) return [] as any[];
  const startDate = start ? new Date(start) : new Date(entries[0].at);
  const endDate = end ? new Date(end) : new Date();
  const days: string[] = [];
  for (let d = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate())); d <= endDate; d = addDays(d, 1)) {
    days.push(toISODate(d));
  }

  let depositedCum = 0;
  let withdrawnCum = 0;
  const positions = new Map<string, { asset: Asset; units: number }>();
  let lastValuationUSD: number | undefined = undefined;
  let firstDepositDate: string | undefined = undefined;

  const series: Array<{ date: string; aum_usd: number; deposits_cum_usd: number; withdrawals_cum_usd: number; pnl_usd: number; roi_percent: number; apr_percent: number }> = [];

  let idx = 0;
  for (const day of days) {
    // apply entries up to and including this day
    while (idx < entries.length && String(entries[idx].at).slice(0, 10) <= day) {
      const e = entries[idx++] as VaultEntry;
      if (e.type === 'DEPOSIT') {
        depositedCum += (e.usdValue || 0);
        if (!firstDepositDate) firstDepositDate = String(e.at).slice(0, 10);
        const k = `${e.asset.type}:${e.asset.symbol.toUpperCase()}`;
        const cur = positions.get(k) || { asset: e.asset, units: 0 };
        cur.units += e.amount;
        positions.set(k, cur);
      } else if (e.type === 'WITHDRAW') {
        withdrawnCum += (e.usdValue || 0);
        const k = `${e.asset.type}:${e.asset.symbol.toUpperCase()}`;
        const cur = positions.get(k) || { asset: e.asset, units: 0 };
        cur.units -= e.amount;
        positions.set(k, cur);
      } else if (e.type === 'VALUATION') {
        lastValuationUSD = typeof e.usdValue === 'number' ? e.usdValue : lastValuationUSD;
      }
    }

    // AUM preference: use last valuation if any, else mark-to-market (current rates)
    let aum = 0;
    if (typeof lastValuationUSD === 'number') {
      aum = lastValuationUSD;
    } else {
      aum = await computeMarkToMarketUSD(positions, day + 'T23:59:59Z');
    }

    const pnl = aum + withdrawnCum - depositedCum;
    const roi = depositedCum > 0 ? (pnl / depositedCum) * 100 : 0;
    let apr = 0;
    if (depositedCum > 0 && firstDepositDate) {
      const daysElapsed = Math.max(1, dateDiffInDays(new Date(firstDepositDate), new Date(day)) + 1);
      apr = roi * (365 / daysElapsed);
    }

    series.push({ date: day, aum_usd: aum, deposits_cum_usd: depositedCum, withdrawals_cum_usd: withdrawnCum, pnl_usd: pnl, roi_percent: roi, apr_percent: apr });
  }

  return series;
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
      if (!by_asset[key]) {
        by_asset[key] = { quantity: 0, value_usd: 0, value_vnd: 0, percentage: 0 };
      }
      by_asset[key].quantity += h.balance;
      by_asset[key].value_usd += h.valueUSD;
      by_asset[key].value_vnd += h.valueUSD * vndRate;
    }
    // compute percentages after aggregation
    for (const k of Object.keys(by_asset)) {
      by_asset[k].percentage = totalUSD > 0 ? (by_asset[k].value_usd / totalUSD) * 100 : 0;
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

reportsRouter.get('/reports/spending', async (req, res) => {
  try {
    const start = req.query.start ? new Date(String(req.query.start)) : undefined;
    const end = req.query.end ? new Date(String(req.query.end)) : undefined;
    const account = (req.query.account ? String(req.query.account) : store.getDefaultSpendingVaultName());
    const txs = store.all().filter(t => t.type === 'EXPENSE' && (t.account || account) === account);

    const inRange = (d: string) => {
      const dt = new Date(d);
      if (Number.isNaN(dt.getTime())) return false;
      if (start && dt < start) return false;
      if (end && dt > end) return false;
      return true;
    };

    const selected = txs.filter(t => inRange(t.createdAt));
    const total_usd = selected.reduce((s, t) => s + (t.usdAmount || 0), 0);
    const rateVND = await usdToVnd();
    const total_vnd = total_usd * rateVND;

    const by_tag: Record<string, { total_usd: number; total_vnd: number; count: number }> = {};
    for (const t of selected) {
      const tag = (t.category || (t as any).tag || 'uncategorized');
      if (!by_tag[tag]) by_tag[tag] = { total_usd: 0, total_vnd: 0, count: 0 };
      by_tag[tag].total_usd += t.usdAmount || 0;
      by_tag[tag].total_vnd += (t.usdAmount || 0) * rateVND;
      by_tag[tag].count += 1;
    }

    const byDate = new Map<string, number>();
    for (const t of selected) {
      const day = String(t.createdAt).slice(0, 10);
      byDate.set(day, (byDate.get(day) || 0) + (t.usdAmount || 0));
    }
    const daily = Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, usd]) => ({ date, total_usd: usd, total_vnd: usd * rateVND }));

    res.json({ total_usd, total_vnd, by_tag, daily, account });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to compute spending' });
  }
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

// --- New: Per-vault daily time series for AUM, PnL, ROI, APR ---
reportsRouter.get('/reports/vaults/:name/series', async (req, res) => {
  try {
    const name = String(req.params.name);
    const v = store.getVault(name);
    if (!v) return res.status(404).json({ error: 'vault not found' });
    const start = req.query.start ? String(req.query.start) : undefined;
    const end = req.query.end ? String(req.query.end) : undefined;

    const usdSeries = await buildVaultDailySeries(name, start, end);
    const vndRate = await usdToVnd();
    const series = usdSeries.map(p => ({
      ...p,
      aum_vnd: p.aum_usd * vndRate,
      pnl_vnd: p.pnl_usd * vndRate,
    }));
    res.json({ vault: name, series });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to build series' });
  }
});

// --- New: Summary of latest metrics for each vault ---
reportsRouter.get('/reports/vaults/summary', async (req, res) => {
  try {
    const start = req.query.start ? String(req.query.start) : undefined;
    const end = req.query.end ? String(req.query.end) : undefined;
    const names = store.listVaults().map(v => v.name);
    const vndRate = await usdToVnd();

    const rows: Array<{ vault: string; aum_usd: number; aum_vnd: number; pnl_usd: number; pnl_vnd: number; roi_percent: number; apr_percent: number }>
      = [];

    for (const name of names) {
      const s = await buildVaultDailySeries(name, start, end);
      const last = s[s.length - 1];
      if (!last) continue;
      rows.push({
        vault: name,
        aum_usd: last.aum_usd,
        aum_vnd: last.aum_usd * vndRate,
        pnl_usd: last.pnl_usd,
        pnl_vnd: last.pnl_usd * vndRate,
        roi_percent: last.roi_percent,
        apr_percent: last.apr_percent,
      });
    }

    const totals = rows.reduce((acc, r) => {
      acc.aum_usd += r.aum_usd; acc.aum_vnd += r.aum_vnd; acc.pnl_usd += r.pnl_usd; acc.pnl_vnd += r.pnl_vnd; return acc;
    }, { aum_usd: 0, aum_vnd: 0, pnl_usd: 0, pnl_vnd: 0 });

    res.json({ rows, totals });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to summarize vaults' });
  }
});

// --- New: Aggregated time series across all vaults (or a single vault via account=) ---
reportsRouter.get('/reports/series', async (req, res) => {
  try {
    const account = req.query.account ? String(req.query.account) : undefined;
    const start = req.query.start ? String(req.query.start) : undefined;
    const end = req.query.end ? String(req.query.end) : undefined;

    const targetVaults = account ? [account] : store.listVaults().map(v => v.name);
    const perVault = await Promise.all(targetVaults.map(n => buildVaultDailySeries(n, start, end).then(s => ({ name: n, s }))));

    // union of dates
    const allDates = new Set<string>();
    for (const { s } of perVault) s.forEach(p => allDates.add(p.date));
    const dates = Array.from(allDates).sort((a, b) => a.localeCompare(b));

    type Row = { date: string; aum_usd: number; deposits_cum_usd: number; withdrawals_cum_usd: number; pnl_usd: number; roi_percent: number; apr_percent: number };
    const rows: Row[] = [];

    let firstDepositDate: string | undefined = undefined;
    for (const date of dates) {
      let aum = 0, dep = 0, wdr = 0, pnl = 0;
      for (const { s } of perVault) {
        const pt = s.find(p => p.date === date);
        if (pt) {
          aum += pt.aum_usd; dep += pt.deposits_cum_usd; wdr += pt.withdrawals_cum_usd; pnl += pt.pnl_usd;
          if (pt.deposits_cum_usd > 0 && !firstDepositDate) firstDepositDate = date;
        }
      }
      const roi = dep > 0 ? (pnl / dep) * 100 : 0;
      let apr = 0;
      if (dep > 0 && firstDepositDate) {
        const daysElapsed = Math.max(1, (new Date(date).getTime() - new Date(firstDepositDate).getTime()) / (24*3600*1000) + 1);
        apr = roi * (365 / daysElapsed);
      }
      rows.push({ date, aum_usd: aum, deposits_cum_usd: dep, withdrawals_cum_usd: wdr, pnl_usd: pnl, roi_percent: roi, apr_percent: apr });
    }

    const vndRate = await usdToVnd();
    const series = rows.map(p => ({ ...p, aum_vnd: p.aum_usd * vndRate, pnl_vnd: p.pnl_usd * vndRate }));

    res.json({ account: account || 'ALL', series });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to build aggregate series' });
  }
});

