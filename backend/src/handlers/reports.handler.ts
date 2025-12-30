import { Router } from 'express';
import { vaultRepository } from '../repositories';
import { transactionRepository } from '../repositories';
import { settingsRepository } from '../repositories';
import { transactionService } from '../services/transaction.service';
import { priceService } from '../services/price.service';
import { Asset, VaultEntry, PortfolioReportItem } from '../types';

// Persistent price cache shared across all requests to avoid repeated API calls
// Key: "assetType:assetSymbol", Value: rateUSD
const persistentPriceCache = new Map<string, number>();

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

/**
 * Calculate Internal Rate of Return (IRR) using Newton-Raphson method.
 *
 * Cash flows are represented as { amount, daysFromStart }:
 * - Negative amounts = deposits (money going in)
 * - Positive amounts = withdrawals or terminal value (money coming out)
 *
 * IRR satisfies: Σ (CF_i / (1 + r)^(days_i/365)) = 0
 *
 * @param cashFlows Array of { amount, daysFromStart }
 * @param maxIterations Maximum Newton-Raphson iterations
 * @param tolerance Convergence tolerance
 * @returns Daily rate as decimal (not percentage), or 0 if cannot converge
 */
function calculateIRR(
  cashFlows: Array<{ amount: number; daysFromStart: number }>,
  maxIterations = 100,
  tolerance = 1e-10
): number {
  if (cashFlows.length === 0) return 0;

  // Check if there are meaningful cash flows
  const totalIn = cashFlows.filter(cf => cf.amount < 0).reduce((s, cf) => s + Math.abs(cf.amount), 0);
  const totalOut = cashFlows.filter(cf => cf.amount > 0).reduce((s, cf) => s + cf.amount, 0);

  if (totalIn < 1e-8) return 0; // No meaningful deposits

  // Simple case: single deposit and single terminal value
  if (cashFlows.length === 2 && cashFlows[0].amount < 0 && cashFlows[1].amount > 0) {
    const pv = -cashFlows[0].amount;
    const fv = cashFlows[1].amount;
    const days = cashFlows[1].daysFromStart - cashFlows[0].daysFromStart;
    if (days <= 0 || pv <= 0) return 0;
    // IRR = (FV/PV)^(1/years) - 1, where years = days/365
    const ratio = fv / pv;
    if (ratio <= 0) return -1; // Total loss
    return Math.pow(ratio, 365 / days) - 1;
  }

  // NPV function: NPV(r) = Σ CF_i / (1 + r)^(t_i/365)
  const npv = (rate: number): number => {
    let sum = 0;
    for (const cf of cashFlows) {
      const years = cf.daysFromStart / 365;
      sum += cf.amount / Math.pow(1 + rate, years);
    }
    return sum;
  };

  // Derivative of NPV: dNPV/dr = Σ -CF_i * (t_i/365) / (1 + r)^(t_i/365 + 1)
  const npvDerivative = (rate: number): number => {
    let sum = 0;
    for (const cf of cashFlows) {
      const years = cf.daysFromStart / 365;
      sum += -cf.amount * years / Math.pow(1 + rate, years + 1);
    }
    return sum;
  };

  // Initial guess based on simple return
  let rate = (totalOut - totalIn) / totalIn;

  // Newton-Raphson iteration
  for (let i = 0; i < maxIterations; i++) {
    const f = npv(rate);
    const fPrime = npvDerivative(rate);

    if (Math.abs(fPrime) < 1e-12) {
      // Derivative too small, try bisection or give up
      break;
    }

    const newRate = rate - f / fPrime;

    // Clamp to reasonable range (-99.9% to +1000%)
    const clampedRate = Math.max(-0.999, Math.min(10, newRate));

    if (Math.abs(clampedRate - rate) < tolerance) {
      return clampedRate;
    }

    rate = clampedRate;
  }

  // If Newton-Raphson didn't converge, fall back to simple annualized return
  const totalDays = Math.max(...cashFlows.map(cf => cf.daysFromStart));
  if (totalDays > 0 && totalIn > 0) {
    const simpleReturn = (totalOut - totalIn) / totalIn;
    return Math.pow(1 + simpleReturn, 365 / totalDays) - 1;
  }

  return 0;
}

/**
 * Calculate annualized APR using IRR (Money-Weighted Return).
 * For periods < 30 days, returns non-annualized ROI to avoid misleading extrapolation.
 *
 * @param cashFlows Array of { amount, daysFromStart } - deposits negative, withdrawals/terminal positive
 * @param totalDays Total days from first deposit to measurement date
 * @param roi Simple ROI as decimal (for fallback on short periods)
 * @returns APR as percentage
 */
function calculateIRRBasedAPR(
  cashFlows: Array<{ amount: number; daysFromStart: number }>,
  totalDays: number,
  roi: number
): number {
  // For very short periods (< 30 days), don't annualize to avoid misleading extrapolation
  if (totalDays < 30) {
    return roi * 100;
  }

  const irr = calculateIRR(cashFlows);

  // IRR is already annualized (annual rate)
  // Convert to percentage
  return irr * 100;
}

async function computeMarkToMarketUSD(
  positions: Map<string, { asset: Asset; units: number }>,
  at?: string,
  priceCache?: Map<string, number>
): Promise<number> {
  let aum = 0;
  for (const p of positions.values()) {
    if (Math.abs(p.units) < 1e-12) continue;

    let rateUSD = 1;
    const assetKey = `${p.asset.type}:${p.asset.symbol}`;

    // Check cache first
    if (priceCache?.has(assetKey)) {
      rateUSD = priceCache.get(assetKey)!;
    } else {
      const rate = await priceService.getRateUSD(p.asset, at);
      rateUSD = rate.rateUSD;
      // Cache the rate for this asset (prices are time-invariant in current implementation)
      priceCache?.set(assetKey, rateUSD);
    }

    aum += p.units * rateUSD;
  }
  return aum;
}

async function buildVaultDailySeries(vaultName: string, start?: string, end?: string) {
  const entries = vaultRepository.findAllEntries(vaultName).sort((a, b) => String(a.at).localeCompare(String(b.at)));
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
  let netFlowSinceValUSD = 0; // deposits - withdrawals since the last valuation that has been applied
  let firstDepositDate: string | undefined = undefined;
  let firstDepositDateObj: Date | undefined = undefined;

  // Track all cash flows for IRR calculation
  // Deposits are negative (money going in), withdrawals are positive (money coming out)
  const cashFlows: Array<{ amount: number; daysFromStart: number; date: string }> = [];

  const series: Array<{ date: string; aum_usd: number; deposits_cum_usd: number; withdrawals_cum_usd: number; pnl_usd: number; roi_percent: number; apr_percent: number }> = [];

  let idx = 0;
  for (const day of days) {
    // apply entries up to and including this day
    while (idx < entries.length && String(entries[idx].at).slice(0, 10) <= day) {
      const e = entries[idx++] as VaultEntry;
      if (e.type === 'DEPOSIT') {
        const usd = (e.usdValue || 0);
        depositedCum += usd;
        const entryDate = String(e.at).slice(0, 10);
        if (!firstDepositDate) {
          firstDepositDate = entryDate;
          firstDepositDateObj = new Date(firstDepositDate);
        }
        // Add deposit as negative cash flow (money going in)
        const daysFromStart = dateDiffInDays(firstDepositDateObj!, new Date(entryDate));
        cashFlows.push({ amount: -usd, daysFromStart, date: entryDate });

        const k = `${e.asset.type}:${e.asset.symbol.toUpperCase()}`;
        const cur = positions.get(k) || { asset: e.asset, units: 0 };
        cur.units += e.amount;
        positions.set(k, cur);
        if (typeof lastValuationUSD === 'number') {
          netFlowSinceValUSD += usd; // deposits increase AUM since last valuation
        }
      } else if (e.type === 'WITHDRAW') {
        const usd = (e.usdValue || 0);
        withdrawnCum += usd;
        const entryDate = String(e.at).slice(0, 10);
        // Add withdrawal as positive cash flow (money coming out)
        if (firstDepositDateObj) {
          const daysFromStart = dateDiffInDays(firstDepositDateObj, new Date(entryDate));
          cashFlows.push({ amount: usd, daysFromStart, date: entryDate });
        }

        const k = `${e.asset.type}:${e.asset.symbol.toUpperCase()}`;
        const cur = positions.get(k) || { asset: e.asset, units: 0 };
        cur.units -= e.amount;
        positions.set(k, cur);
        if (typeof lastValuationUSD === 'number') {
          netFlowSinceValUSD -= usd; // withdrawals decrease AUM since last valuation
        }
      } else if (e.type === 'VALUATION') {
        lastValuationUSD = typeof e.usdValue === 'number' ? e.usdValue : lastValuationUSD;
        netFlowSinceValUSD = 0; // reset net flows after capturing a new valuation snapshot
      }
    }

    // AUM preference: use last valuation if any, else mark-to-market (current rates)
    let aum = 0;
    if (typeof lastValuationUSD === 'number') {
      // Rolling AUM: last valuation plus net flows since that valuation
      aum = lastValuationUSD + netFlowSinceValUSD;
    } else {
      // If no valuation yet, mark-to-market from positions (with persistent price caching)
      aum = await computeMarkToMarketUSD(positions, day + 'T23:59:59Z', persistentPriceCache);
    }

    const pnl = aum + withdrawnCum - depositedCum; // profit = equity - net_contributed
    const netContributed = depositedCum - withdrawnCum;
    const roi = netContributed > 1e-8 ? (pnl / netContributed) * 100 : 0;

    let apr = 0;
    if (firstDepositDateObj) {
      const daysElapsed = Math.max(1, dateDiffInDays(firstDepositDateObj, new Date(day)) + 1);

      // Build cash flows for IRR calculation up to this day, plus terminal value
      const cashFlowsForDay = cashFlows
        .filter(cf => cf.date <= day)
        .map(cf => ({ amount: cf.amount, daysFromStart: cf.daysFromStart }));

      // Add terminal value (current AUM) as positive cash flow
      cashFlowsForDay.push({ amount: aum, daysFromStart: daysElapsed - 1 });

      apr = calculateIRRBasedAPR(cashFlowsForDay, daysElapsed, roi / 100);
    }

    series.push({ date: day, aum_usd: aum, deposits_cum_usd: depositedCum, withdrawals_cum_usd: withdrawnCum, pnl_usd: pnl, roi_percent: roi, apr_percent: apr });
  }

  return series;
}

reportsRouter.get('/reports/holdings', async (_req, res) => {
  try {
    const r = await transactionService.generateReport();
    const vndRate = await usdToVnd();
    const totalUSD = r.totals.holdingsUSD;
    const rows = r.holdings.map((h: PortfolioReportItem) => ({
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
    const r = await transactionService.generateReport();
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
reportsRouter.get('/reports/cashflow', async (req, res) => {
  try {
    const start = req.query.start_date ? new Date(String(req.query.start_date)) : undefined;
    const end = req.query.end_date ? new Date(String(req.query.end_date)) : undefined;
    const account = req.query.account ? String(req.query.account) : undefined; // optional per-vault filter

    // Collect vault entries across all vaults (or a single vault if filtered)
    const vaultNames = account ? [account] : vaultRepository.findAll().map(v => v.name);
    const entries = vaultNames.flatMap(name => vaultRepository.findAllEntries(name));

    const inRange = (d: string) => {
      const dt = new Date(d);
      if (Number.isNaN(dt.getTime())) return false;
      if (start && dt < start) return false;
      if (end && dt > end) return false;
      return true;
    };

    const selected = entries.filter(e => inRange(e.at));

    let inflowUSD = 0;   // cash received (withdraw from vaults)
    let outflowUSD = 0;  // cash paid (deposit into vaults)

    const by_type: Record<string, { inflow_usd: number; outflow_usd: number; net_usd: number; inflow_vnd: number; outflow_vnd: number; net_vnd: number; count: number }>
      = {};

    if (selected.length > 0) {
      for (const e of selected) {
        const t = e.type === 'DEPOSIT' ? 'deposit' : (e.type === 'WITHDRAW' ? 'withdraw' : 'valuation');
        if (!by_type[t]) by_type[t] = { inflow_usd: 0, outflow_usd: 0, net_usd: 0, inflow_vnd: 0, outflow_vnd: 0, net_vnd: 0, count: 0 };
        const usd = Number(e.usdValue || 0);
        if (e.type === 'DEPOSIT') {
          inflowUSD += usd; // deposit -> cash in
          by_type[t].inflow_usd += usd;
        } else if (e.type === 'WITHDRAW') {
          outflowUSD += usd; // withdraw -> cash out
          by_type[t].outflow_usd += usd;
        }
        by_type[t].count += 1;
      }
    } else {
      // Legacy fallback: derive from transaction ledger if no vault entries found in range
      const txs = transactionRepository.findAll().filter(t => inRange(t.createdAt));
      for (const tx of txs) {
        const t = tx.type.toLowerCase();
        if (!by_type[t]) by_type[t] = { inflow_usd: 0, outflow_usd: 0, net_usd: 0, inflow_vnd: 0, outflow_vnd: 0, net_vnd: 0, count: 0 };
        const usd = Number(tx.usdAmount || 0);
        if (tx.type === 'INCOME' || tx.type === 'TRANSFER_IN') {
          inflowUSD += usd;
          by_type[t].inflow_usd += usd;
        } else if (tx.type === 'EXPENSE' || tx.type === 'TRANSFER_OUT') {
          outflowUSD += usd;
          by_type[t].outflow_usd += usd;
        }
        by_type[t].count += 1;
      }
    }

    const netUSD = inflowUSD - outflowUSD;
    const vndRate = await usdToVnd();
    const inflowVND = inflowUSD * vndRate;
    const outflowVND = outflowUSD * vndRate;
    const netVND = netUSD * vndRate;

    // finalize by_type VND and net values
    for (const k of Object.keys(by_type)) {
      const r = by_type[k];
      r.net_usd = (r.inflow_usd || 0) - (r.outflow_usd || 0);
      r.inflow_vnd = (r.inflow_usd || 0) * vndRate;
      r.outflow_vnd = (r.outflow_usd || 0) * vndRate;
      r.net_vnd = r.net_usd * vndRate;
    }

    // For now, treat all as operating; no financing flows tracked via vault entries
    const resp = {
      combined_in_usd: inflowUSD,
      combined_in_vnd: inflowVND,
      combined_out_usd: outflowUSD,
      combined_out_vnd: outflowVND,
      combined_net_usd: netUSD,
      combined_net_vnd: netVND,

      total_in_usd: inflowUSD,
      total_out_usd: outflowUSD,
      net_usd: netUSD,
      total_in_vnd: inflowVND,
      total_out_vnd: outflowVND,
      net_vnd: netVND,

      operating_in_usd: inflowUSD,
      operating_in_vnd: inflowVND,
      operating_out_usd: outflowUSD,
      operating_out_vnd: outflowVND,
      operating_net_usd: netUSD,
      operating_net_vnd: netVND,

      financing_in_usd: 0,
      financing_in_vnd: 0,
      financing_out_usd: 0,
      financing_out_vnd: 0,
      financing_net_usd: 0,
      financing_net_vnd: 0,

      by_type,
      account: account || 'ALL',
      start_date: start ? start.toISOString().slice(0,10) : undefined,
      end_date: end ? end.toISOString().slice(0,10) : undefined,
    };

    res.json(resp);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to compute cashflow' });
  }
});

reportsRouter.get('/reports/spending', async (req, res) => {
  try {
    const start = req.query.start ? new Date(String(req.query.start)) : undefined;
    const end = req.query.end ? new Date(String(req.query.end)) : undefined;
    const account = (req.query.account ? String(req.query.account) : settingsRepository.getDefaultSpendingVaultName());
    const allTxs = transactionRepository.findAll();
    const txs = allTxs.filter(t => t.type === 'EXPENSE' && (t.account || account) === account);

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

    const by_tag: Record<string, { total_usd: number; total_vnd: number; count: number; amount_usd: number; amount_vnd: number; percentage: number }> = {};
    for (const t of selected) {
      const tag = (t.category || (t as any).tag || 'uncategorized');
      if (!by_tag[tag]) by_tag[tag] = { total_usd: 0, total_vnd: 0, count: 0, amount_usd: 0, amount_vnd: 0, percentage: 0 };
      by_tag[tag].total_usd += t.usdAmount || 0;
      by_tag[tag].total_vnd += (t.usdAmount || 0) * rateVND;
      by_tag[tag].amount_usd += t.usdAmount || 0;
      by_tag[tag].amount_vnd += (t.usdAmount || 0) * rateVND;
      by_tag[tag].count += 1;
    }
    // Calculate percentages
    for (const tag of Object.keys(by_tag)) {
      by_tag[tag].percentage = total_usd > 0 ? (by_tag[tag].total_usd / total_usd) * 100 : 0;
    }

    const byDate = new Map<string, number>();
    for (const t of selected) {
      const day = String(t.createdAt).slice(0, 10);
      byDate.set(day, (byDate.get(day) || 0) + (t.usdAmount || 0));
    }
    const daily = Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, usd]) => ({ date, total_usd: usd, total_vnd: usd * rateVND }));

    // Calculate by_day for chart (same as daily but keyed by date)
    const by_day: Record<string, { amount_usd: number; amount_vnd: number }> = {};
    for (const d of daily) {
      by_day[d.date] = { amount_usd: d.total_usd, amount_vnd: d.total_vnd };
    }

    // Calculate current month spending
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const currentMonthTxs = txs.filter(t => {
      const dt = new Date(t.createdAt);
      return dt >= currentMonthStart && dt <= currentMonthEnd;
    });
    const current_month_usd = currentMonthTxs.reduce((s, t) => s + (t.usdAmount || 0), 0);
    const current_month_vnd = current_month_usd * rateVND;

    // Calculate last month spending for comparison
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const lastMonthTxs = txs.filter(t => {
      const dt = new Date(t.createdAt);
      return dt >= lastMonthStart && dt <= lastMonthEnd;
    });
    const last_month_usd = lastMonthTxs.reduce((s, t) => s + (t.usdAmount || 0), 0);
    const last_month_vnd = last_month_usd * rateVND;

    // Calculate month-over-month change
    const mom_change_usd = current_month_usd - last_month_usd;
    const mom_change_percent = last_month_usd > 0 ? ((current_month_usd - last_month_usd) / last_month_usd) * 100 : 0;

    // Calculate monthly spending for trend (last 12 months)
    const monthly_trend: Array<{ month: string; amount_usd: number; amount_vnd: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59);
      const monthTxs = txs.filter(t => {
        const dt = new Date(t.createdAt);
        return dt >= monthDate && dt <= monthEnd;
      });
      const monthTotal = monthTxs.reduce((s, t) => s + (t.usdAmount || 0), 0);
      const monthLabel = monthDate.toISOString().slice(0, 7); // YYYY-MM
      monthly_trend.push({
        month: monthLabel,
        amount_usd: monthTotal,
        amount_vnd: monthTotal * rateVND,
      });
    }

    // Calculate average daily spending for current month
    const daysInCurrentMonth = Math.min(now.getDate(), new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());
    const avg_daily_usd = daysInCurrentMonth > 0 ? current_month_usd / daysInCurrentMonth : 0;
    const avg_daily_vnd = avg_daily_usd * rateVND;

    // Calculate available balance (income - expenses for the account)
    const incomeTxs = allTxs.filter(t => t.type === 'INCOME' && (t.account || account) === account);
    const totalIncome = incomeTxs.reduce((s, t) => s + (t.usdAmount || 0), 0);
    const totalExpenses = txs.reduce((s, t) => s + (t.usdAmount || 0), 0);
    const available_balance_usd = totalIncome - totalExpenses;
    const available_balance_vnd = available_balance_usd * rateVND;

    res.json({
      total_usd,
      total_vnd,
      by_tag,
      daily,
      by_day,
      account,
      current_month_usd,
      current_month_vnd,
      last_month_usd,
      last_month_vnd,
      mom_change_usd,
      mom_change_percent,
      monthly_trend,
      avg_daily_usd,
      avg_daily_vnd,
      available_balance_usd,
      available_balance_vnd,
    });
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

// --- New: Per-vault header metrics (rolling AUM, ROI, APR) ---
async function buildVaultHeaderMetrics(vaultName: string) {
  const entries = vaultRepository.findAllEntries(vaultName).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  if (entries.length === 0) {
    return {
      vault: vaultName,
      aum_usd: 0,
      pnl_usd: 0,
      roi_percent: 0,
      apr_percent: 0,
      last_valuation_usd: 0,
      net_flow_since_valuation_usd: 0,
      deposits_cum_usd: 0,
      withdrawals_cum_usd: 0,
      as_of: new Date().toISOString(),
    };
  }

  let depositedCum = 0;
  let withdrawnCum = 0;
  const positions = new Map<string, { asset: Asset; units: number }>();
  let lastValuationUSD: number | undefined = undefined;
  let netFlowSinceValUSD = 0;
  let firstDepositDate: string | undefined = undefined;
  let firstDepositDateObj: Date | undefined = undefined;

  // Track all cash flows for IRR calculation
  const cashFlows: Array<{ amount: number; daysFromStart: number }> = [];

  for (const e of entries) {
    if (e.type === 'DEPOSIT') {
      const usd = (e.usdValue || 0);
      depositedCum += usd;
      const entryDate = String(e.at).slice(0, 10);
      if (!firstDepositDate) {
        firstDepositDate = entryDate;
        firstDepositDateObj = new Date(firstDepositDate);
      }
      // Add deposit as negative cash flow (money going in)
      const daysFromStart = dateDiffInDays(firstDepositDateObj!, new Date(entryDate));
      cashFlows.push({ amount: -usd, daysFromStart });

      const k = `${e.asset.type}:${e.asset.symbol.toUpperCase()}`;
      const cur = positions.get(k) || { asset: e.asset, units: 0 };
      cur.units += e.amount;
      positions.set(k, cur);
      if (typeof lastValuationUSD === 'number') netFlowSinceValUSD += usd;
    } else if (e.type === 'WITHDRAW') {
      const usd = (e.usdValue || 0);
      withdrawnCum += usd;
      const entryDate = String(e.at).slice(0, 10);
      // Add withdrawal as positive cash flow (money coming out)
      if (firstDepositDateObj) {
        const daysFromStart = dateDiffInDays(firstDepositDateObj, new Date(entryDate));
        cashFlows.push({ amount: usd, daysFromStart });
      }

      const k = `${e.asset.type}:${e.asset.symbol.toUpperCase()}`;
      const cur = positions.get(k) || { asset: e.asset, units: 0 };
      cur.units -= e.amount;
      positions.set(k, cur);
      if (typeof lastValuationUSD === 'number') netFlowSinceValUSD -= usd;
    } else if (e.type === 'VALUATION') {
      lastValuationUSD = typeof e.usdValue === 'number' ? e.usdValue : lastValuationUSD;
      netFlowSinceValUSD = 0; // reset on new valuation
    }
  }

  // AUM preference: last valuation + flows, else mark-to-market today
  let aum = 0;
  if (typeof lastValuationUSD === 'number') {
    aum = lastValuationUSD + netFlowSinceValUSD;
  } else {
    aum = await computeMarkToMarketUSD(positions, undefined, persistentPriceCache);
  }

  const pnl = aum + withdrawnCum - depositedCum; // equity - net_contributed
  const netContributed = depositedCum - withdrawnCum;
  const roi = netContributed > 1e-8 ? (pnl / netContributed) * 100 : 0;

  let apr = 0;
  if (firstDepositDateObj) {
    const daysElapsed = Math.max(1, dateDiffInDays(firstDepositDateObj, new Date()) + 1);

    // Add terminal value (current AUM) as positive cash flow
    const cashFlowsWithTerminal = [...cashFlows, { amount: aum, daysFromStart: daysElapsed - 1 }];

    apr = calculateIRRBasedAPR(cashFlowsWithTerminal, daysElapsed, roi / 100);
  }

  return {
    vault: vaultName,
    aum_usd: aum,
    pnl_usd: pnl,
    roi_percent: roi,
    apr_percent: apr,
    last_valuation_usd: typeof lastValuationUSD === 'number' ? lastValuationUSD : 0,
    net_flow_since_valuation_usd: netFlowSinceValUSD,
    deposits_cum_usd: depositedCum,
    withdrawals_cum_usd: withdrawnCum,
    as_of: new Date().toISOString(),
  };
}

// --- New: Per-vault daily time series for AUM, PnL, ROI, APR ---
// Header metrics endpoint
reportsRouter.get('/reports/vaults/:name/header', async (req, res) => {
  try {
    const name = String(req.params.name);
    const v = vaultRepository.findByName(name);
    if (!v) return res.status(404).json({ error: 'vault not found' });
    const metrics = await buildVaultHeaderMetrics(name);
    res.json(metrics);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Failed to build header metrics' });
  }
});

reportsRouter.get('/reports/vaults/:name/series', async (req, res) => {
  try {
    const name = String(req.params.name);
    const v = vaultRepository.findByName(name);
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
    const names = vaultRepository.findAll().map(v => v.name);
    const vndRate = await usdToVnd();

    // Process vaults in parallel for better performance
    const vaultMetrics = await Promise.all(
      names.map(async (name) => {
        const s = await buildVaultDailySeries(name, start, end);
        const last = s[s.length - 1];
        if (!last) return null;
        return {
          vault: name,
          aum_usd: last.aum_usd,
          aum_vnd: last.aum_usd * vndRate,
          pnl_usd: last.pnl_usd,
          pnl_vnd: last.pnl_usd * vndRate,
          roi_percent: last.roi_percent,
          apr_percent: last.apr_percent,
        };
      })
    );

    const rows = vaultMetrics.filter((r): r is NonNullable<typeof r> => r !== null);

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

    const targetVaults = account ? [account] : vaultRepository.findAll().map(v => v.name);
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

