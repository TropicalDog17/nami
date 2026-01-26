import { Router } from "express";
import { vaultRepository } from "../repositories";
import { transactionRepository } from "../repositories";
import { borrowingRepository } from "../repositories";
import { settingsRepository } from "../repositories";
import { transactionService } from "../services/transaction.service";
import { priceService } from "../services/price.service";
import { Asset, VaultEntry, PortfolioReportItem } from "../types";

// Price cache keyed by "assetType:assetSymbol:date" to ensure accurate per-day prices
// This is critical for timeseries calculations where historical prices vary by day
const priceCache = new Map<string, number>();

export const reportsRouter = Router();

async function usdToVnd(): Promise<number> {
  try {
    const vnd = await priceService.getRateUSD({
      type: "FIAT",
      symbol: "VND",
    });
    // vnd.rateUSD is 1 VND -> USD, so USD->VND = 1 / rateUSD
    return vnd.rateUSD > 0 ? 1 / vnd.rateUSD : 24000;
  } catch {
    return 24000;
  }
}

function toISODate(d: Date): string {
  const dd = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
  return dd.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  return new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate() + n,
      0,
      0,
      0,
      0,
    ),
  );
}
function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const next = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth() + months,
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
      d.getUTCMilliseconds(),
    ),
  );
  return next.toISOString();
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
  tolerance = 1e-10,
): number {
  if (cashFlows.length === 0) return 0;

  // Check if there are meaningful cash flows
  const totalIn = cashFlows
    .filter((cf) => cf.amount < 0)
    .reduce((s, cf) => s + Math.abs(cf.amount), 0);
  const totalOut = cashFlows
    .filter((cf) => cf.amount > 0)
    .reduce((s, cf) => s + cf.amount, 0);

  if (totalIn < 1e-8) return 0; // No meaningful deposits

  // Simple case: single deposit and single terminal value
  if (
    cashFlows.length === 2 &&
    cashFlows[0].amount < 0 &&
    cashFlows[1].amount > 0
  ) {
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
      sum += (-cf.amount * years) / Math.pow(1 + rate, years + 1);
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
  const totalDays = Math.max(...cashFlows.map((cf) => cf.daysFromStart));
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
  roi: number,
): number {
  // For very short periods (< 30 days), don't annualize to avoid misleading extrapolation
  if (totalDays < 30) {
    return roi * 100;
  }

  // For extreme loss scenarios (>90% loss), IRR annualization produces misleading results
  // (e.g., a 2x recovery from $44 to $88 after a 99% crash shows 1000%+ IRR)
  // In these cases, simple ROI is more meaningful to users
  if (roi < -0.9) {
    return roi * 100;
  }

  const irr = calculateIRR(cashFlows);

  // Sanity check: if ROI is negative but IRR is positive (or vice versa with large magnitude),
  // the IRR calculation is likely unstable - fall back to ROI
  if (roi < 0 && irr > 0.5) {
    return roi * 100;
  }

  // IRR is already annualized (annual rate)
  // Convert to percentage
  return irr * 100;
}

function calculateRangeReturnPercent(
  rows: Array<{
    date: string;
    aum_usd: number;
    deposits_cum_usd: number;
    withdrawals_cum_usd: number;
  }>,
): { returnPercent: number | null; daysElapsed: number } {
  if (rows.length < 2) return { returnPercent: null, daysElapsed: 0 };

  const first = rows[0];
  const last = rows[rows.length - 1];
  const startDate = new Date(first.date);
  const endDate = new Date(last.date);
  const daysElapsed = dateDiffInDays(startDate, endDate) + 1;

  const cashFlows: Array<{ amount: number; daysFromStart: number }> = [];

  const startAum = Number.isFinite(first.aum_usd) ? first.aum_usd : 0;
  if (startAum > 1e-8) {
    cashFlows.push({ amount: -startAum, daysFromStart: 0 });
  }

  let prevDeposits = first.deposits_cum_usd || 0;
  let prevWithdrawals = first.withdrawals_cum_usd || 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const depDelta = (row.deposits_cum_usd || 0) - prevDeposits;
    const wdrDelta = (row.withdrawals_cum_usd || 0) - prevWithdrawals;
    const daysFromStart = dateDiffInDays(startDate, new Date(row.date));

    if (depDelta > 0) {
      cashFlows.push({ amount: -depDelta, daysFromStart });
    }
    if (wdrDelta > 0) {
      cashFlows.push({ amount: wdrDelta, daysFromStart });
    }

    prevDeposits = row.deposits_cum_usd || 0;
    prevWithdrawals = row.withdrawals_cum_usd || 0;
  }

  const endAum = Number.isFinite(last.aum_usd) ? last.aum_usd : 0;
  if (endAum > 1e-8) {
    cashFlows.push({ amount: endAum, daysFromStart: daysElapsed - 1 });
  }

  if (cashFlows.length < 2 || daysElapsed <= 0) {
    return { returnPercent: null, daysElapsed };
  }

  const irr = calculateIRR(cashFlows);
  const periodReturn = Math.pow(1 + irr, daysElapsed / 365) - 1;
  if (!Number.isFinite(periodReturn)) {
    return { returnPercent: null, daysElapsed };
  }
  return { returnPercent: periodReturn * 100, daysElapsed };
}

function calculateRangeTimeWeightedReturnPercent(
  rows: Array<{
    date: string;
    aum_usd: number;
    deposits_cum_usd: number;
    withdrawals_cum_usd: number;
  }>,
): { returnPercent: number | null; daysElapsed: number } {
  if (rows.length < 2) return { returnPercent: null, daysElapsed: 0 };

  const first = rows[0];
  const last = rows[rows.length - 1];
  const startDate = new Date(first.date);
  const endDate = new Date(last.date);
  const daysElapsed = dateDiffInDays(startDate, endDate) + 1;

  let factor = 1;
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const cur = rows[i];

    const prevAum = Number.isFinite(prev.aum_usd) ? prev.aum_usd : 0;
    const curAum = Number.isFinite(cur.aum_usd) ? cur.aum_usd : 0;
    const depDelta =
      (cur.deposits_cum_usd || 0) - (prev.deposits_cum_usd || 0);
    const wdrDelta =
      (cur.withdrawals_cum_usd || 0) - (prev.withdrawals_cum_usd || 0);
    const netFlow = depDelta - wdrDelta;

    if (prevAum > 1e-8) {
      const r = (curAum - prevAum - netFlow) / prevAum;
      const link = 1 + r;
      factor = link <= 0 ? 0 : factor * link;
    }
  }

  const twrr = (factor - 1) * 100;
  if (!Number.isFinite(twrr)) return { returnPercent: null, daysElapsed };
  return { returnPercent: twrr, daysElapsed };
}

async function computeMarkToMarketUSD(
  positions: Map<string, { asset: Asset; units: number }>,
  at?: string,
  cache?: Map<string, number>,
): Promise<number> {
  let aum = 0;
  // Extract date portion for cache key (YYYY-MM-DD) to ensure per-day price accuracy
  const dateKey = at ? at.slice(0, 10) : new Date().toISOString().slice(0, 10);

  for (const p of positions.values()) {
    if (Math.abs(p.units) < 1e-12) continue;

    let rateUSD = 1;
    // Include date in cache key to ensure accurate historical prices per day
    const cacheKey = `${p.asset.type}:${p.asset.symbol}:${dateKey}`;

    // Check cache first
    if (cache?.has(cacheKey)) {
      rateUSD = cache.get(cacheKey)!;
    } else {
      const rate = await priceService.getRateUSD(p.asset, at);
      rateUSD = rate.rateUSD;
      // Cache the rate for this asset+date combination
      cache?.set(cacheKey, rateUSD);
    }

    aum += p.units * rateUSD;
  }
  return aum;
}

function hasNonZeroPositions(
  positions: Map<string, { asset: Asset; units: number }>,
): boolean {
  for (const p of positions.values()) {
    if (Math.abs(p.units) >= 1e-12) return true;
  }
  return false;
}

function isLiquidatedState(
  lastValuationUSD: number | undefined,
  netFlowSinceValUSD: number,
  positions: Map<string, { asset: Asset; units: number }>,
  netContributed: number,
): boolean {
  if (!(netContributed < 1e-8)) return false;
  if (typeof lastValuationUSD === "number") {
    return Math.abs(lastValuationUSD + netFlowSinceValUSD) < 1e-8;
  }
  return !hasNonZeroPositions(positions);
}

function computeStateBeforeDate(
  entries: VaultEntry[],
  cutoffDate: string,
  firstDepositDateObj?: Date,
) {
  let depositedCum = 0;
  let withdrawnCum = 0;
  const positions = new Map<string, { asset: Asset; units: number }>();
  let lastValuationUSD: number | undefined = undefined;
  let netFlowSinceValUSD = 0;
  let firstDepositObj = firstDepositDateObj;
  const cashFlows: Array<{ amount: number; daysFromStart: number }> = [];

  for (const e of entries) {
    const entryDate = String(e.at).slice(0, 10);
    if (entryDate >= cutoffDate) break;

    if (e.type === "DEPOSIT") {
      const usd = e.usdValue || 0;
      depositedCum += usd;
      if (!firstDepositObj) {
        firstDepositObj = new Date(entryDate);
      }
      const daysFromStart = firstDepositObj
        ? dateDiffInDays(firstDepositObj, new Date(entryDate))
        : 0;
      cashFlows.push({ amount: -usd, daysFromStart });

      const k = `${e.asset.type}:${e.asset.symbol.toUpperCase()}`;
      const cur = positions.get(k) || { asset: e.asset, units: 0 };
      cur.units += e.amount;
      positions.set(k, cur);
      if (typeof lastValuationUSD === "number") {
        netFlowSinceValUSD += usd;
      }
    } else if (e.type === "WITHDRAW") {
      const usd = e.usdValue || 0;
      withdrawnCum += usd;
      if (firstDepositObj) {
        const daysFromStart = dateDiffInDays(
          firstDepositObj,
          new Date(entryDate),
        );
        cashFlows.push({ amount: usd, daysFromStart });
      }

      const k = `${e.asset.type}:${e.asset.symbol.toUpperCase()}`;
      const cur = positions.get(k) || { asset: e.asset, units: 0 };
      cur.units -= e.amount;
      positions.set(k, cur);
      if (typeof lastValuationUSD === "number") {
        netFlowSinceValUSD -= usd;
      }
    } else if (e.type === "VALUATION") {
      lastValuationUSD =
        typeof e.usdValue === "number" ? e.usdValue : lastValuationUSD;
      netFlowSinceValUSD = 0;
    }
  }

  return {
    depositedCum,
    withdrawnCum,
    positions,
    lastValuationUSD,
    netFlowSinceValUSD,
    cashFlows,
    firstDepositDateObj: firstDepositObj,
  };
}

async function computeAprBeforeLiquidation(
  entries: VaultEntry[],
  liquidationDate: string,
  firstDepositDateObj: Date,
): Promise<number> {
  const dayBeforeDate = addDays(
    new Date(`${liquidationDate}T00:00:00Z`),
    -1,
  );
  if (dayBeforeDate < firstDepositDateObj) return 0;

  const beforeState = computeStateBeforeDate(
    entries,
    liquidationDate,
    firstDepositDateObj,
  );
  const firstDepositObj =
    beforeState.firstDepositDateObj ?? firstDepositDateObj;
  if (!firstDepositObj) return 0;

  const dayBeforeIso = toISODate(dayBeforeDate);
  const aumBefore =
    typeof beforeState.lastValuationUSD === "number"
      ? beforeState.lastValuationUSD + beforeState.netFlowSinceValUSD
      : await computeMarkToMarketUSD(
          beforeState.positions,
          `${dayBeforeIso}T23:59:59Z`,
          priceCache,
        );

  const netContributedBefore =
    beforeState.depositedCum - beforeState.withdrawnCum;
  const pnlBefore =
    aumBefore + beforeState.withdrawnCum - beforeState.depositedCum;
  const roiBefore =
    netContributedBefore > 1e-8 ? (pnlBefore / netContributedBefore) * 100 : 0;

  const daysElapsed = Math.max(
    1,
    dateDiffInDays(firstDepositObj, dayBeforeDate) + 1,
  );

  if (aumBefore < 1e-8 && netContributedBefore < 1e-8) return 0;
  if (aumBefore < 1e-8) return roiBefore;

  const cashFlowsForCalculation = beforeState.cashFlows.map((cf) => ({
    amount: cf.amount,
    daysFromStart: cf.daysFromStart,
  }));
  cashFlowsForCalculation.push({
    amount: aumBefore,
    daysFromStart: daysElapsed - 1,
  });

  return calculateIRRBasedAPR(
    cashFlowsForCalculation,
    daysElapsed,
    roiBefore / 100,
  );
}

async function buildVaultDailySeries(
  vaultName: string,
  start?: string,
  end?: string,
) {
  const entries = vaultRepository
    .findAllEntries(vaultName)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  if (entries.length === 0) return [] as any[];
  const startDate = start ? new Date(start) : new Date(entries[0].at);
  const endDate = end ? new Date(end) : new Date();
  const days: string[] = [];
  for (
    let d = new Date(
      Date.UTC(
        startDate.getUTCFullYear(),
        startDate.getUTCMonth(),
        startDate.getUTCDate(),
      ),
    );
    d <= endDate;
    d = addDays(d, 1)
  ) {
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
  const cashFlows: Array<{
    amount: number;
    daysFromStart: number;
    date: string;
  }> = [];

  const series: Array<{
    date: string;
    aum_usd: number;
    deposits_cum_usd: number;
    withdrawals_cum_usd: number;
    pnl_usd: number;
    roi_percent: number;
    apr_percent: number;
    twrr_percent: number;
  }> = [];

  // Track last APR to keep it flat when AUM = 0
  let lastApr = 0;

  // Time-weighted return (TWRR): chain sub-period returns that remove cash-flow timing.
  let twrrFactor = 1;
  let twrrPrevAum = 0;
  let twrrPrevDepositedCum = 0;
  let twrrPrevWithdrawnCum = 0;
  let hasPrevTwrrPoint = false;

  let idx = 0;
  for (const day of days) {
    // apply entries up to and including this day
    while (
      idx < entries.length &&
      String(entries[idx].at).slice(0, 10) <= day
    ) {
      const e = entries[idx++] as VaultEntry;
      if (e.type === "DEPOSIT") {
        const usd = e.usdValue || 0;
        depositedCum += usd;
        const entryDate = String(e.at).slice(0, 10);
        if (!firstDepositDate) {
          firstDepositDate = entryDate;
          firstDepositDateObj = new Date(firstDepositDate);
        }
        // Add deposit as negative cash flow (money going in)
        const daysFromStart = dateDiffInDays(
          firstDepositDateObj!,
          new Date(entryDate),
        );
        cashFlows.push({
          amount: -usd,
          daysFromStart,
          date: entryDate,
        });

        const k = `${e.asset.type}:${e.asset.symbol.toUpperCase()}`;
        const cur = positions.get(k) || { asset: e.asset, units: 0 };
        cur.units += e.amount;
        positions.set(k, cur);
        if (typeof lastValuationUSD === "number") {
          netFlowSinceValUSD += usd; // deposits increase AUM since last valuation
        }
      } else if (e.type === "WITHDRAW") {
        const usd = e.usdValue || 0;
        withdrawnCum += usd;
        const entryDate = String(e.at).slice(0, 10);
        // Add withdrawal as positive cash flow (money coming out)
        if (firstDepositDateObj) {
          const daysFromStart = dateDiffInDays(
            firstDepositDateObj,
            new Date(entryDate),
          );
          cashFlows.push({
            amount: usd,
            daysFromStart,
            date: entryDate,
          });
        }

        const k = `${e.asset.type}:${e.asset.symbol.toUpperCase()}`;
        const cur = positions.get(k) || { asset: e.asset, units: 0 };
        cur.units -= e.amount;
        positions.set(k, cur);
        if (typeof lastValuationUSD === "number") {
          netFlowSinceValUSD -= usd; // withdrawals decrease AUM since last valuation
        }
      } else if (e.type === "VALUATION") {
        lastValuationUSD =
          typeof e.usdValue === "number" ? e.usdValue : lastValuationUSD;
        netFlowSinceValUSD = 0; // reset net flows after capturing a new valuation snapshot
      }
    }

    // AUM preference: use last valuation if any, else mark-to-market (current rates)
    let aum = 0;
    if (typeof lastValuationUSD === "number") {
      // Rolling AUM: last valuation plus net flows since that valuation
      aum = lastValuationUSD + netFlowSinceValUSD;
    } else {
      // If no valuation yet, mark-to-market from positions (with persistent price caching)
      aum = await computeMarkToMarketUSD(
        positions,
        day + "T23:59:59Z",
        priceCache,
      );
    }

    const pnl = aum + withdrawnCum - depositedCum; // profit = equity - net_contributed
    const netContributed = depositedCum - withdrawnCum;
    const roi = netContributed > 1e-8 ? (pnl / netContributed) * 100 : 0;

    let apr = lastApr;
    if (firstDepositDateObj) {
      const daysElapsed = Math.max(
        1,
        dateDiffInDays(firstDepositDateObj, new Date(day)) + 1,
      );

      // If vault is fully liquidated (AUM = 0 AND netContributed ≈ 0), keep the previous APR (stay flat)
      // But if there's still net contributed capital (like 100% loss), calculate actual APR
      if (aum < 1e-8 && netContributed < 1e-8) {
        apr = lastApr; // Keep previous APR for fully liquidated vaults
      } else if (aum < 1e-8) {
        // 100% loss scenario: AUM = 0 but still have net contributed capital
        apr = roi; // Use ROI as the realized return
      } else {
        // Build cash flows for IRR calculation up to this day, plus terminal value
        const cashFlowsForDay = cashFlows
          .filter((cf) => cf.date <= day)
          .map((cf) => ({
            amount: cf.amount,
            daysFromStart: cf.daysFromStart,
          }));

        // Add terminal value (current AUM) as positive cash flow
        cashFlowsForDay.push({
          amount: aum,
          daysFromStart: daysElapsed - 1,
        });

        apr = calculateIRRBasedAPR(cashFlowsForDay, daysElapsed, roi / 100);
      }
    }

    // Clamp APR to reasonable range (-100% to 1000%) to prevent extreme values
    let aprToUse = Number.isFinite(apr) ? apr : 0;
    aprToUse = Math.max(-100, Math.min(1000, aprToUse));

    // Update chained TWRR factor from the previous point to today.
    if (hasPrevTwrrPoint && twrrPrevAum > 1e-8) {
      const netFlow =
        (depositedCum - twrrPrevDepositedCum) -
        (withdrawnCum - twrrPrevWithdrawnCum);
      const r = (aum - twrrPrevAum - netFlow) / twrrPrevAum;
      const link = 1 + r;
      twrrFactor = link <= 0 ? 0 : twrrFactor * link;
    }
    const twrrPercent = (twrrFactor - 1) * 100;

    series.push({
      date: day,
      aum_usd: Number.isFinite(aum) ? aum : 0,
      deposits_cum_usd: Number.isFinite(depositedCum) ? depositedCum : 0,
      withdrawals_cum_usd: Number.isFinite(withdrawnCum) ? withdrawnCum : 0,
      pnl_usd: Number.isFinite(pnl) ? pnl : 0,
      roi_percent: Number.isFinite(roi) ? roi : 0,
      apr_percent: aprToUse,
      twrr_percent: Number.isFinite(twrrPercent) ? twrrPercent : 0,
    });

    // Update lastApr for next iteration (to keep APR flat when AUM = 0)
    lastApr = aprToUse;

    hasPrevTwrrPoint = true;
    twrrPrevAum = Number.isFinite(aum) ? aum : 0;
    twrrPrevDepositedCum = Number.isFinite(depositedCum) ? depositedCum : 0;
    twrrPrevWithdrawnCum = Number.isFinite(withdrawnCum) ? withdrawnCum : 0;
  }

  return series;
}

/**
 * Optimized function to compute only the latest vault metrics without building entire time series.
 * This is much faster for summary endpoints that only need current values.
 */
async function buildLatestVaultMetrics(vaultName: string) {
  const entries = vaultRepository
    .findAllEntries(vaultName)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));

  if (entries.length === 0) return null;

  let depositedCum = 0;
  let withdrawnCum = 0;
  const positions = new Map<string, { asset: Asset; units: number }>();
  let lastValuationUSD: number | undefined = undefined;
  let netFlowSinceValUSD = 0;
  let firstDepositDate: string | undefined = undefined;
  let firstDepositDateObj: Date | undefined = undefined;
  let currentDate: string | undefined = undefined;
  let wasLiquidated = false;
  let liquidationDate: string | undefined = undefined;

  // Time-weighted return (TWRR) computed over event dates (cash flows / valuations),
  // avoiding cash-flow timing effects without building the full daily series.
  const twrrRows: Array<{
    aum_usd: number;
    deposits_cum_usd: number;
    withdrawals_cum_usd: number;
  }> = [];

  const cashFlows: Array<{
    amount: number;
    daysFromStart: number;
    date: string;
  }> = [];

  // Process all entries
  for (const e of entries as VaultEntry[]) {
    const entryDate = String(e.at).slice(0, 10);
    if (!currentDate) currentDate = entryDate;
    if (entryDate !== currentDate) {
      const aumAtEndOfDay =
        typeof lastValuationUSD === "number"
          ? lastValuationUSD + netFlowSinceValUSD
          : depositedCum - withdrawnCum;
      twrrRows.push({
        aum_usd: Number.isFinite(aumAtEndOfDay) ? aumAtEndOfDay : 0,
        deposits_cum_usd: Number.isFinite(depositedCum) ? depositedCum : 0,
        withdrawals_cum_usd: Number.isFinite(withdrawnCum) ? withdrawnCum : 0,
      });

      const netContributed = depositedCum - withdrawnCum;
      const isLiquidated = isLiquidatedState(
        lastValuationUSD,
        netFlowSinceValUSD,
        positions,
        netContributed,
      );
      if (isLiquidated && !wasLiquidated) {
        liquidationDate = currentDate;
      }
      wasLiquidated = isLiquidated;
      currentDate = entryDate;
    }
    if (e.type === "DEPOSIT") {
      const usd = e.usdValue || 0;
      depositedCum += usd;
      if (!firstDepositDate) {
        firstDepositDate = entryDate;
        firstDepositDateObj = new Date(firstDepositDate);
      }
      const daysFromStart = dateDiffInDays(
        firstDepositDateObj!,
        new Date(entryDate),
      );
      cashFlows.push({ amount: -usd, daysFromStart, date: entryDate });

      const k = `${e.asset.type}:${e.asset.symbol.toUpperCase()}`;
      const cur = positions.get(k) || { asset: e.asset, units: 0 };
      cur.units += e.amount;
      positions.set(k, cur);
      if (typeof lastValuationUSD === "number") {
        netFlowSinceValUSD += usd;
      }
    } else if (e.type === "WITHDRAW") {
      const usd = e.usdValue || 0;
      withdrawnCum += usd;
      if (firstDepositDateObj) {
        const daysFromStart = dateDiffInDays(
          firstDepositDateObj,
          new Date(entryDate),
        );
        cashFlows.push({ amount: usd, daysFromStart, date: entryDate });
      }

      const k = `${e.asset.type}:${e.asset.symbol.toUpperCase()}`;
      const cur = positions.get(k) || { asset: e.asset, units: 0 };
      cur.units -= e.amount;
      positions.set(k, cur);
      if (typeof lastValuationUSD === "number") {
        netFlowSinceValUSD -= usd;
      }
    } else if (e.type === "VALUATION") {
      lastValuationUSD =
        typeof e.usdValue === "number" ? e.usdValue : lastValuationUSD;
      netFlowSinceValUSD = 0;
    }
  }
  if (currentDate) {
    const aumAtEndOfDay =
      typeof lastValuationUSD === "number"
        ? lastValuationUSD + netFlowSinceValUSD
        : depositedCum - withdrawnCum;
    twrrRows.push({
      aum_usd: Number.isFinite(aumAtEndOfDay) ? aumAtEndOfDay : 0,
      deposits_cum_usd: Number.isFinite(depositedCum) ? depositedCum : 0,
      withdrawals_cum_usd: Number.isFinite(withdrawnCum) ? withdrawnCum : 0,
    });

    const netContributed = depositedCum - withdrawnCum;
    const isLiquidated = isLiquidatedState(
      lastValuationUSD,
      netFlowSinceValUSD,
      positions,
      netContributed,
    );
    if (isLiquidated && !wasLiquidated) {
      liquidationDate = currentDate;
    }
    wasLiquidated = isLiquidated;
  }

  // Calculate current AUM
  let aum = 0;
  const now = new Date().toISOString();
  if (typeof lastValuationUSD === "number") {
    aum = lastValuationUSD + netFlowSinceValUSD;
  } else {
    aum = await computeMarkToMarketUSD(positions, now, priceCache);
  }

  const pnl = aum + withdrawnCum - depositedCum;
  const netContributed = depositedCum - withdrawnCum;
  const roi = netContributed > 1e-8 ? (pnl / netContributed) * 100 : 0;

  let twrrFactor = 1;
  for (let i = 1; i < twrrRows.length; i++) {
    const prev = twrrRows[i - 1];
    const cur = twrrRows[i];
    const prevAum = prev.aum_usd || 0;
    const netFlow =
      (cur.deposits_cum_usd - prev.deposits_cum_usd) -
      (cur.withdrawals_cum_usd - prev.withdrawals_cum_usd);
    if (prevAum > 1e-8) {
      const r = (cur.aum_usd - prevAum - netFlow) / prevAum;
      const link = 1 + r;
      twrrFactor = link <= 0 ? 0 : twrrFactor * link;
    }
  }
  const twrrPercent = (twrrFactor - 1) * 100;

  let apr = 0;
  if (firstDepositDateObj) {
    const daysElapsed = Math.max(
      1,
      dateDiffInDays(firstDepositDateObj, new Date()) + 1,
    );

    if (aum < 1e-8) {
      if (netContributed > 1e-8) {
        apr = roi;
      } else if (liquidationDate) {
        apr = await computeAprBeforeLiquidation(
          entries as VaultEntry[],
          liquidationDate,
          firstDepositDateObj,
        );
      }
    } else {
      // Add terminal value
      const cashFlowsForCalculation = cashFlows.map((cf) => ({
        amount: cf.amount,
        daysFromStart: cf.daysFromStart,
      }));
      cashFlowsForCalculation.push({
        amount: aum,
        daysFromStart: daysElapsed - 1,
      });

      apr = calculateIRRBasedAPR(cashFlowsForCalculation, daysElapsed, roi / 100);
    }
  }

  // Clamp APR to reasonable range (-100% to 1000%)
  const clampedApr = Number.isFinite(apr) ? Math.max(-100, Math.min(1000, apr)) : 0;

  return {
    aum_usd: Number.isFinite(aum) ? aum : 0,
    pnl_usd: Number.isFinite(pnl) ? pnl : 0,
    roi_percent: Number.isFinite(roi) ? roi : 0,
    apr_percent: clampedApr,
    twrr_percent: Number.isFinite(twrrPercent) ? twrrPercent : 0,
  };
}

reportsRouter.get("/reports/holdings", async (_req, res) => {
  try {
    const r = await transactionService.generateReport();
    const vndRate = await usdToVnd();
    const totalUSD = r.totals.holdingsUSD;
    const rows = r.holdings.map((h: PortfolioReportItem) => ({
      asset: h.asset.symbol,
      account: h.account ?? "Portfolio",
      quantity: h.balance,
      value_usd: h.valueUSD,
      value_vnd: h.valueUSD * vndRate,
      percentage: totalUSD > 0 ? (h.valueUSD / totalUSD) * 100 : 0,
      last_updated: new Date().toISOString(),
    }));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({
      error: e?.message || "Failed to generate holdings",
    });
  }
});

reportsRouter.get("/reports/holdings/summary", async (_req, res) => {
  try {
    const r = await transactionService.generateReport();
    const vndRate = await usdToVnd();
    const by_asset: Record<
      string,
      {
        quantity: number;
        value_usd: number;
        value_vnd: number;
        percentage: number;
      }
    > = {};
    const totalUSD = r.totals.holdingsUSD;
    for (const h of r.holdings) {
      const key = h.asset.symbol;
      if (!by_asset[key]) {
        by_asset[key] = {
          quantity: 0,
          value_usd: 0,
          value_vnd: 0,
          percentage: 0,
        };
      }
      by_asset[key].quantity += h.balance;
      by_asset[key].value_usd += h.valueUSD;
      by_asset[key].value_vnd += h.valueUSD * vndRate;
    }
    // compute percentages after aggregation
    for (const k of Object.keys(by_asset)) {
      by_asset[k].percentage =
        totalUSD > 0 ? (by_asset[k].value_usd / totalUSD) * 100 : 0;
    }
    res.json({
      by_asset,
      total_value_usd: totalUSD,
      total_value_vnd: totalUSD * vndRate,
      last_updated: new Date().toISOString(),
    });
  } catch (e: any) {
    res.status(500).json({
      error: e?.message || "Failed to generate holdings summary",
    });
  }
});

// Minimal stubs for other report endpoints expected by frontend
reportsRouter.get("/reports/cashflow", async (req, res) => {
  try {
    const start = req.query.start_date
      ? new Date(String(req.query.start_date))
      : undefined;
    const end = req.query.end_date
      ? new Date(String(req.query.end_date))
      : undefined;
    const account = req.query.account
      ? String(req.query.account)
      : settingsRepository.getDefaultSpendingVaultName();

    // Collect vault entries from the spending vault only (or a specific vault if filtered)
    const vaultNames = [account];
    const entries = vaultNames.flatMap((name) =>
      vaultRepository.findAllEntries(name),
    );

    const inRange = (d: string) => {
      const dt = new Date(d);
      if (Number.isNaN(dt.getTime())) return false;
      if (start && dt < start) return false;
      if (end && dt > end) return false;
      return true;
    };

    const selected = entries.filter((e) => inRange(e.at));

    let inflowUSD = 0; // cash received (withdraw from vaults)
    let outflowUSD = 0; // cash paid (deposit into vaults)
    let financingInUSD = 0;
    let financingOutUSD = 0;

    const by_type: Record<
      string,
      {
        inflow_usd: number;
        outflow_usd: number;
        net_usd: number;
        inflow_vnd: number;
        outflow_vnd: number;
        net_vnd: number;
        count: number;
      }
    > = {};

    if (selected.length > 0) {
      for (const e of selected) {
        const t =
          e.type === "DEPOSIT"
            ? "deposit"
            : e.type === "WITHDRAW"
              ? "withdraw"
              : "valuation";
        if (!by_type[t])
          by_type[t] = {
            inflow_usd: 0,
            outflow_usd: 0,
            net_usd: 0,
            inflow_vnd: 0,
            outflow_vnd: 0,
            net_vnd: 0,
            count: 0,
          };
        const usd = Number(e.usdValue || 0);
        if (e.type === "DEPOSIT") {
          inflowUSD += usd; // deposit -> cash in
          by_type[t].inflow_usd += usd;
        } else if (e.type === "WITHDRAW") {
          outflowUSD += usd; // withdraw -> cash out
          by_type[t].outflow_usd += usd;
        }
        by_type[t].count += 1;
      }
    } else {
      // Legacy fallback: derive from transaction ledger if no vault entries found in range
      const txs = transactionRepository
        .findAll()
        .filter((t) => inRange(t.createdAt));
      for (const tx of txs) {
        const t = tx.type.toLowerCase();
        if (!by_type[t])
          by_type[t] = {
            inflow_usd: 0,
            outflow_usd: 0,
            net_usd: 0,
            inflow_vnd: 0,
            outflow_vnd: 0,
            net_vnd: 0,
            count: 0,
          };
        const usd = Number(tx.usdAmount || 0);
        if (tx.type === "INCOME" || tx.type === "TRANSFER_IN") {
          inflowUSD += usd;
          by_type[t].inflow_usd += usd;
        } else if (tx.type === "EXPENSE" || tx.type === "TRANSFER_OUT") {
          outflowUSD += usd;
          by_type[t].outflow_usd += usd;
        }
        by_type[t].count += 1;
      }
    }

    // Always include borrow/repay financing flows from transaction ledger
    const txs = transactionRepository
      .findAll()
      .filter((t) => inRange(t.createdAt));
    for (const tx of txs) {
      const usd = Number(tx.usdAmount || 0);
      if (tx.type === "BORROW") {
        if (!by_type.borrow) {
          by_type.borrow = {
            inflow_usd: 0,
            outflow_usd: 0,
            net_usd: 0,
            inflow_vnd: 0,
            outflow_vnd: 0,
            net_vnd: 0,
            count: 0,
          };
        }
        financingInUSD += usd;
        by_type.borrow.inflow_usd += usd;
        by_type.borrow.count += 1;
      } else if (
        tx.type === "REPAY" &&
        String((tx as any).direction || "").toUpperCase() === "BORROW"
      ) {
        if (!by_type.repay_borrow) {
          by_type.repay_borrow = {
            inflow_usd: 0,
            outflow_usd: 0,
            net_usd: 0,
            inflow_vnd: 0,
            outflow_vnd: 0,
            net_vnd: 0,
            count: 0,
          };
        }
        financingOutUSD += usd;
        by_type.repay_borrow.outflow_usd += usd;
        by_type.repay_borrow.count += 1;
      }
    }

    const combinedInUSD = inflowUSD + financingInUSD;
    const combinedOutUSD = outflowUSD + financingOutUSD;
    const netUSD = combinedInUSD - combinedOutUSD;
    const vndRate = await usdToVnd();
    const inflowVND = combinedInUSD * vndRate;
    const outflowVND = combinedOutUSD * vndRate;
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
      combined_in_usd: combinedInUSD,
      combined_in_vnd: inflowVND,
      combined_out_usd: combinedOutUSD,
      combined_out_vnd: outflowVND,
      combined_net_usd: netUSD,
      combined_net_vnd: netVND,

      total_in_usd: combinedInUSD,
      total_out_usd: combinedOutUSD,
      net_usd: netUSD,
      total_in_vnd: inflowVND,
      total_out_vnd: outflowVND,
      net_vnd: netVND,

      operating_in_usd: inflowUSD,
      operating_in_vnd: inflowUSD * vndRate,
      operating_out_usd: outflowUSD,
      operating_out_vnd: outflowUSD * vndRate,
      operating_net_usd: inflowUSD - outflowUSD,
      operating_net_vnd: (inflowUSD - outflowUSD) * vndRate,

      financing_in_usd: financingInUSD,
      financing_in_vnd: financingInUSD * vndRate,
      financing_out_usd: financingOutUSD,
      financing_out_vnd: financingOutUSD * vndRate,
      financing_net_usd: financingInUSD - financingOutUSD,
      financing_net_vnd: (financingInUSD - financingOutUSD) * vndRate,

      by_type,
      account: account || "ALL",
      start_date: start ? start.toISOString().slice(0, 10) : undefined,
      end_date: end ? end.toISOString().slice(0, 10) : undefined,
    };

    res.json(resp);
  } catch (e: any) {
    res.status(500).json({
      error: e?.message || "Failed to compute cashflow",
    });
  }
});

const predictedOutflowsHandler = async (req: any, res: any) => {
  try {
    const startInput = req.query.start_date
      ? new Date(String(req.query.start_date))
      : new Date();
    if (Number.isNaN(startInput.getTime())) {
      res.status(400).json({ error: "Invalid start_date or end_date" });
      return;
    }
    const forecastStart = new Date(
      Date.UTC(
        startInput.getUTCFullYear(),
        startInput.getUTCMonth() + 1,
        1,
        0,
        0,
        0,
        0,
      ),
    );
    const endInput = req.query.end_date
      ? new Date(String(req.query.end_date))
      : new Date(
          Date.UTC(
            forecastStart.getUTCFullYear(),
            forecastStart.getUTCMonth() + 1,
            0,
            0,
            0,
            0,
            0,
          ),
        );
    const account = req.query.account
      ? String(req.query.account)
      : settingsRepository.getDefaultSpendingVaultName();

    const startDay = addDays(forecastStart, 0);
    const endDay = addDays(endInput, 0);
    if (Number.isNaN(startDay.getTime()) || Number.isNaN(endDay.getTime())) {
      res.status(400).json({ error: "Invalid start_date or end_date" });
      return;
    }
    if (endDay < startDay) {
      res.status(400).json({ error: "end_date must be >= start_date" });
      return;
    }

    // Expected repayments: active borrowings, fixed monthly schedule from nextPaymentAt.
    const repaymentByDayUSD = new Map<string, number>();
    const repaymentItems: Array<{
      date: string;
      borrowing_id: string;
      counterparty: string;
      amount_usd: number;
    }> = [];
    const borrowings = borrowingRepository.findByStatus("ACTIVE");

    const getRateUSD = async (asset: Asset, at: string): Promise<number> => {
      const k = `pred-out-rate:${asset.type}:${asset.symbol}:${at.slice(0, 10)}`;
      const cached = priceCache.get(k);
      if (cached !== undefined) return cached;
      const r = await priceService.getRateUSD(asset, at);
      const rateUSD = Number(r.rateUSD || 0);
      priceCache.set(k, rateUSD);
      return rateUSD;
    };

    for (const b of borrowings) {
      const payAccount =
        b.account || settingsRepository.getDefaultSpendingVaultName();
      if (payAccount !== account) continue;

      let outstanding = Number(b.outstanding || 0);
      let nextPaymentAt = b.nextPaymentAt;

      while (outstanding > 0) {
        const due = new Date(nextPaymentAt);
        if (Number.isNaN(due.getTime())) break;
        const dueDay = addDays(due, 0);
        if (dueDay > endDay) break;

        if (dueDay >= startDay) {
          const paymentAmount = Math.min(
            Number(b.monthlyPayment || 0),
            outstanding,
          );
          if (paymentAmount > 0) {
            const paymentAt = dueDay.toISOString();
            const rateUSD = await getRateUSD(b.asset, paymentAt);
            const paymentUSD = Math.abs(paymentAmount * rateUSD);
            const day = toISODate(dueDay);
            repaymentByDayUSD.set(
              day,
              (repaymentByDayUSD.get(day) || 0) + paymentUSD,
            );
            repaymentItems.push({
              date: day,
              borrowing_id: b.id,
              counterparty: b.counterparty,
              amount_usd: paymentUSD,
            });
            outstanding = Math.max(0, outstanding - paymentAmount);
          } else {
            break;
          }
        }

        const prevNextPaymentAt = nextPaymentAt;
        nextPaymentAt = addMonths(nextPaymentAt, 1);
        if (nextPaymentAt === prevNextPaymentAt) break;
      }
    }

    const txs = transactionRepository.findAll();

    // Spending trend:
    // - Primary: predict per-day using weekday averages (Mon/Tue/...) from last 6 months of recorded EXPENSE days.
    // - Fallback: if not enough weekday samples, use overall average outflow (total expense / recorded expense days).
    const txsForAccount = txs.filter((t) => (t.account || account) === account);

    const monthKeyForDate = (d: Date) => toISODate(d).slice(0, 7); // YYYY-MM

    const asOfDay = addDays(startInput, 0);
    const asOfMonthKey = monthKeyForDate(asOfDay);

    const historyMonthStarts: Date[] = Array.from({ length: 6 }, (_, idx) => {
      const monthsBack = -(6 - idx);
      return new Date(addMonths(startDay.toISOString(), monthsBack));
    });

    const historyMonthKeys = new Set(
      historyMonthStarts.map((d) => d.toISOString().slice(0, 7)),
    );

    // Aggregate total spend by unique recorded day within the 6-month history window.
    const expenseByDayUSD = new Map<string, number>();
    for (const t of txsForAccount) {
      if (t.type !== "EXPENSE") continue;
      const when = new Date(String(t.createdAt));
      if (Number.isNaN(when.getTime())) continue;
      const whenDay = addDays(when, 0);
      const monthKey = monthKeyForDate(whenDay);
      if (!historyMonthKeys.has(monthKey)) continue;
      if (monthKey === asOfMonthKey && whenDay > asOfDay) continue;

      const usd = Math.abs(Number(t.usdAmount || 0));
      if (usd <= 0) continue;
      const dayKey = toISODate(whenDay);
      expenseByDayUSD.set(dayKey, (expenseByDayUSD.get(dayKey) || 0) + usd);
    }

    let historyRecordedDays = 0;
    let historyTotalSpendUSD = 0;
    for (const usd of expenseByDayUSD.values()) {
      historyRecordedDays += 1;
      historyTotalSpendUSD += usd;
    }

    const baselineDailySpendUSD =
      historyRecordedDays > 0 ? historyTotalSpendUSD / historyRecordedDays : 0;

    // Weekday averages (0=Sun .. 6=Sat) across recorded expense days.
    const weekdayAgg: Array<{ sum_usd: number; days: number }> = Array.from(
      { length: 7 },
      () => ({ sum_usd: 0, days: 0 }),
    );
    for (const [dayKey, usd] of expenseByDayUSD.entries()) {
      const day = new Date(`${dayKey}T00:00:00Z`);
      if (Number.isNaN(day.getTime())) continue;
      const dow = day.getUTCDay();
      weekdayAgg[dow].sum_usd += usd;
      weekdayAgg[dow].days += 1;
    }
    const MIN_WEEKDAY_SAMPLES = 1;

    const vndRate = await usdToVnd();
    const series: Array<{
      date: string;
      predicted_spend_usd: number;
      predicted_spend_vnd: number;
      expected_repayments_usd: number;
      expected_repayments_vnd: number;
      total_out_usd: number;
      total_out_vnd: number;
    }> = [];

    let totals = {
      predicted_spend_usd: 0,
      expected_repayments_usd: 0,
      total_out_usd: 0,
    };

    for (let d = addDays(startDay, 0); d <= endDay; d = addDays(d, 1)) {
      const date = toISODate(d);
      const repaymentUSD = repaymentByDayUSD.get(date) || 0;
      const dow = d.getUTCDay();
      const hasWeekdayBaseline = weekdayAgg[dow].days >= MIN_WEEKDAY_SAMPLES;
      const weekdayBaselineUSD = hasWeekdayBaseline
        ? weekdayAgg[dow].sum_usd / weekdayAgg[dow].days
        : 0;
      const predictedSpendUSD =
        weekdayBaselineUSD > 0
          ? weekdayBaselineUSD
          : baselineDailySpendUSD > 0
            ? baselineDailySpendUSD
            : 0;
      const totalOutUSD = repaymentUSD + predictedSpendUSD;

      series.push({
        date,
        predicted_spend_usd: predictedSpendUSD,
        predicted_spend_vnd: predictedSpendUSD * vndRate,
        expected_repayments_usd: repaymentUSD,
        expected_repayments_vnd: repaymentUSD * vndRate,
        total_out_usd: totalOutUSD,
        total_out_vnd: totalOutUSD * vndRate,
      });

      totals.predicted_spend_usd += predictedSpendUSD;
      totals.expected_repayments_usd += repaymentUSD;
      totals.total_out_usd += totalOutUSD;
    }

    res.json({
      start_date: toISODate(startDay),
      end_date: toISODate(endDay),
      account,
      baseline_daily_spend_usd: baselineDailySpendUSD,
      baseline_daily_spend_vnd: baselineDailySpendUSD * vndRate,
      totals: {
        predicted_spend_usd: totals.predicted_spend_usd,
        predicted_spend_vnd: totals.predicted_spend_usd * vndRate,
        expected_repayments_usd: totals.expected_repayments_usd,
        expected_repayments_vnd: totals.expected_repayments_usd * vndRate,
        total_out_usd: totals.total_out_usd,
        total_out_vnd: totals.total_out_usd * vndRate,
      },
      series,
      repayment_items: repaymentItems,
    });
  } catch (e: any) {
    res.status(500).json({
      error: e?.message || "Failed to compute predicted outflows",
    });
  }
};

reportsRouter.get("/reports/predicted-outflows", predictedOutflowsHandler);
// Backward-compatible alias (now returns outflows-only).
reportsRouter.get("/reports/predicted-cashflow", predictedOutflowsHandler);

reportsRouter.get("/reports/spending", async (req, res) => {
  try {
    const start = req.query.start
      ? new Date(String(req.query.start))
      : undefined;
    const end = req.query.end ? new Date(String(req.query.end)) : undefined;
    const account = req.query.account
      ? String(req.query.account)
      : settingsRepository.getDefaultSpendingVaultName();
    const allTxs = transactionRepository.findAll();
    const txs = allTxs.filter(
      (t) => t.type === "EXPENSE" && (t.account || account) === account,
    );

    const inRange = (d: string) => {
      const dt = new Date(d);
      if (Number.isNaN(dt.getTime())) return false;
      if (start && dt < start) return false;
      if (end && dt > end) return false;
      return true;
    };

    const selected = txs.filter((t) => inRange(t.createdAt));
    const total_usd = selected.reduce((s, t) => s + (t.usdAmount || 0), 0);
    const rateVND = await usdToVnd();
    const total_vnd = total_usd * rateVND;

    const by_tag: Record<
      string,
      {
        total_usd: number;
        total_vnd: number;
        count: number;
        amount_usd: number;
        amount_vnd: number;
        percentage: number;
        transactions: Array<{
          id: string;
          description: string;
          amount_usd: number;
          amount_vnd: number;
          createdAt: string;
          account: string;
        }>;
      }
    > = {};
    for (const t of selected) {
      const tag = t.category || (t as any).tag || "uncategorized";
      if (!by_tag[tag])
        by_tag[tag] = {
          total_usd: 0,
          total_vnd: 0,
          count: 0,
          amount_usd: 0,
          amount_vnd: 0,
          percentage: 0,
          transactions: [],
        };
      by_tag[tag].total_usd += t.usdAmount || 0;
      by_tag[tag].total_vnd += (t.usdAmount || 0) * rateVND;
      by_tag[tag].amount_usd += t.usdAmount || 0;
      by_tag[tag].amount_vnd += (t.usdAmount || 0) * rateVND;
      by_tag[tag].count += 1;
      by_tag[tag].transactions.push({
        id: t.id,
        description: t.note || t.counterparty || "No description",
        amount_usd: t.usdAmount || 0,
        amount_vnd: (t.usdAmount || 0) * rateVND,
        createdAt: t.createdAt,
        account: t.account || account,
      });
    }
    // Calculate percentages and sort transactions by amount
    for (const tag of Object.keys(by_tag)) {
      by_tag[tag].percentage =
        total_usd > 0 ? (by_tag[tag].total_usd / total_usd) * 100 : 0;
      // Sort transactions by amount descending (highest first)
      by_tag[tag].transactions.sort((a, b) => b.amount_usd - a.amount_usd);
    }

    const byDate = new Map<string, number>();
    for (const t of selected) {
      const day = String(t.createdAt).slice(0, 10);
      byDate.set(day, (byDate.get(day) || 0) + (t.usdAmount || 0));
    }
    const daily = Array.from(byDate.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, usd]) => ({
        date,
        total_usd: usd,
        total_vnd: usd * rateVND,
      }));

    // Calculate by_day for chart (same as daily but keyed by date)
    const by_day: Record<string, { amount_usd: number; amount_vnd: number }> =
      {};
    for (const d of daily) {
      by_day[d.date] = {
        amount_usd: d.total_usd,
        amount_vnd: d.total_vnd,
      };
    }

    // Calculate current month spending
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
    );
    const currentMonthTxs = txs.filter((t) => {
      const dt = new Date(t.createdAt);
      return dt >= currentMonthStart && dt <= currentMonthEnd;
    });
    const current_month_usd = currentMonthTxs.reduce(
      (s, t) => s + (t.usdAmount || 0),
      0,
    );
    const current_month_vnd = current_month_usd * rateVND;

    // Calculate last month spending for comparison
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
    );
    const lastMonthTxs = txs.filter((t) => {
      const dt = new Date(t.createdAt);
      return dt >= lastMonthStart && dt <= lastMonthEnd;
    });
    const last_month_usd = lastMonthTxs.reduce(
      (s, t) => s + (t.usdAmount || 0),
      0,
    );
    const last_month_vnd = last_month_usd * rateVND;

    // Calculate month-over-month change
    const mom_change_usd = current_month_usd - last_month_usd;
    const mom_change_percent =
      last_month_usd > 0
        ? ((current_month_usd - last_month_usd) / last_month_usd) * 100
        : 0;

    // Calculate monthly spending for trend (last 12 months)
    const monthly_trend: Array<{
      month: string;
      amount_usd: number;
      amount_vnd: number;
    }> = [];
    for (let i = 11; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(
        monthDate.getFullYear(),
        monthDate.getMonth() + 1,
        0,
        23,
        59,
        59,
      );
      const monthTxs = txs.filter((t) => {
        const dt = new Date(t.createdAt);
        return dt >= monthDate && dt <= monthEnd;
      });
      const monthTotal = monthTxs.reduce((s, t) => s + (t.usdAmount || 0), 0);
      // Use local year/month instead of toISOString to avoid timezone issues
      const year = monthDate.getFullYear();
      const month = String(monthDate.getMonth() + 1).padStart(2, '0');
      const monthLabel = `${year}-${month}`;
      monthly_trend.push({
        month: monthLabel,
        amount_usd: monthTotal,
        amount_vnd: monthTotal * rateVND,
      });
    }

    // Calculate average daily spending for current month
    const daysInCurrentMonth = Math.min(
      now.getDate(),
      new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
    );
    const avg_daily_usd =
      daysInCurrentMonth > 0 ? current_month_usd / daysInCurrentMonth : 0;
    const avg_daily_vnd = avg_daily_usd * rateVND;

    // Calculate available balance (income - expenses for the account)
    const incomeTxs = allTxs.filter(
      (t) => t.type === "INCOME" && (t.account || account) === account,
    );
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
    res.status(500).json({
      error: e?.message || "Failed to compute spending",
    });
  }
});

reportsRouter.get("/reports/pnl", async (_req, res) => {
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
  const entries = vaultRepository
    .findAllEntries(vaultName)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  if (entries.length === 0) {
    return {
      vault: vaultName,
      aum_usd: 0,
      pnl_usd: 0,
      roi_percent: 0,
      apr_percent: 0,
      twrr_percent: 0,
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
  let currentDate: string | undefined = undefined;
  let wasLiquidated = false;
  let liquidationDate: string | undefined = undefined;

  // Time-weighted return (TWRR) computed over event dates (cash flows / valuations).
  const twrrRows: Array<{
    aum_usd: number;
    deposits_cum_usd: number;
    withdrawals_cum_usd: number;
  }> = [];

  // Track all cash flows for IRR calculation
  const cashFlows: Array<{ amount: number; daysFromStart: number }> = [];

  for (const e of entries) {
    const entryDate = String(e.at).slice(0, 10);
    if (!currentDate) currentDate = entryDate;
    if (entryDate !== currentDate) {
      const aumAtEndOfDay =
        typeof lastValuationUSD === "number"
          ? lastValuationUSD + netFlowSinceValUSD
          : depositedCum - withdrawnCum;
      twrrRows.push({
        aum_usd: Number.isFinite(aumAtEndOfDay) ? aumAtEndOfDay : 0,
        deposits_cum_usd: Number.isFinite(depositedCum) ? depositedCum : 0,
        withdrawals_cum_usd: Number.isFinite(withdrawnCum) ? withdrawnCum : 0,
      });

      const netContributed = depositedCum - withdrawnCum;
      const isLiquidated = isLiquidatedState(
        lastValuationUSD,
        netFlowSinceValUSD,
        positions,
        netContributed,
      );
      if (isLiquidated && !wasLiquidated) {
        liquidationDate = currentDate;
      }
      wasLiquidated = isLiquidated;
      currentDate = entryDate;
    }
    if (e.type === "DEPOSIT") {
      const usd = e.usdValue || 0;
      depositedCum += usd;
      if (!firstDepositDate) {
        firstDepositDate = entryDate;
        firstDepositDateObj = new Date(firstDepositDate);
      }
      // Add deposit as negative cash flow (money going in)
      const daysFromStart = dateDiffInDays(
        firstDepositDateObj!,
        new Date(entryDate),
      );
      cashFlows.push({ amount: -usd, daysFromStart });

      const k = `${e.asset.type}:${e.asset.symbol.toUpperCase()}`;
      const cur = positions.get(k) || { asset: e.asset, units: 0 };
      cur.units += e.amount;
      positions.set(k, cur);
      if (typeof lastValuationUSD === "number") netFlowSinceValUSD += usd;
    } else if (e.type === "WITHDRAW") {
      const usd = e.usdValue || 0;
      withdrawnCum += usd;
      // Add withdrawal as positive cash flow (money coming out)
      if (firstDepositDateObj) {
        const daysFromStart = dateDiffInDays(
          firstDepositDateObj,
          new Date(entryDate),
        );
        cashFlows.push({ amount: usd, daysFromStart });
      }

      const k = `${e.asset.type}:${e.asset.symbol.toUpperCase()}`;
      const cur = positions.get(k) || { asset: e.asset, units: 0 };
      cur.units -= e.amount;
      positions.set(k, cur);
      if (typeof lastValuationUSD === "number") netFlowSinceValUSD -= usd;
    } else if (e.type === "VALUATION") {
      lastValuationUSD =
        typeof e.usdValue === "number" ? e.usdValue : lastValuationUSD;
      netFlowSinceValUSD = 0; // reset on new valuation
    }
  }
  if (currentDate) {
    const aumAtEndOfDay =
      typeof lastValuationUSD === "number"
        ? lastValuationUSD + netFlowSinceValUSD
        : depositedCum - withdrawnCum;
    twrrRows.push({
      aum_usd: Number.isFinite(aumAtEndOfDay) ? aumAtEndOfDay : 0,
      deposits_cum_usd: Number.isFinite(depositedCum) ? depositedCum : 0,
      withdrawals_cum_usd: Number.isFinite(withdrawnCum) ? withdrawnCum : 0,
    });

    const netContributed = depositedCum - withdrawnCum;
    const isLiquidated = isLiquidatedState(
      lastValuationUSD,
      netFlowSinceValUSD,
      positions,
      netContributed,
    );
    if (isLiquidated && !wasLiquidated) {
      liquidationDate = currentDate;
    }
    wasLiquidated = isLiquidated;
  }

  // AUM preference: last valuation + flows, else mark-to-market today
  let aum = 0;
  if (typeof lastValuationUSD === "number") {
    aum = lastValuationUSD + netFlowSinceValUSD;
  } else {
    aum = await computeMarkToMarketUSD(positions, undefined, priceCache);
  }

  const pnl = aum + withdrawnCum - depositedCum; // equity - net_contributed
  const netContributed = depositedCum - withdrawnCum;
  const roi = netContributed > 1e-8 ? (pnl / netContributed) * 100 : 0;

  let twrrFactor = 1;
  for (let i = 1; i < twrrRows.length; i++) {
    const prev = twrrRows[i - 1];
    const cur = twrrRows[i];
    const prevAum = prev.aum_usd || 0;
    const netFlow =
      (cur.deposits_cum_usd - prev.deposits_cum_usd) -
      (cur.withdrawals_cum_usd - prev.withdrawals_cum_usd);
    if (prevAum > 1e-8) {
      const r = (cur.aum_usd - prevAum - netFlow) / prevAum;
      const link = 1 + r;
      twrrFactor = link <= 0 ? 0 : twrrFactor * link;
    }
  }
  const twrrPercent = (twrrFactor - 1) * 100;

  let apr = 0;
  if (firstDepositDateObj) {
    const daysElapsed = Math.max(
      1,
      dateDiffInDays(firstDepositDateObj, new Date()) + 1,
    );

    if (aum < 1e-8) {
      if (netContributed > 1e-8) {
        apr = roi;
      } else if (liquidationDate) {
        apr = await computeAprBeforeLiquidation(
          entries as VaultEntry[],
          liquidationDate,
          firstDepositDateObj,
        );
      }
    } else {
      // Add terminal value (current AUM) as positive cash flow
      const cashFlowsWithTerminal = [
        ...cashFlows,
        { amount: aum, daysFromStart: daysElapsed - 1 },
      ];

      apr = calculateIRRBasedAPR(cashFlowsWithTerminal, daysElapsed, roi / 100);
    }
  }

  // Clamp APR to reasonable range (-100% to 1000%)
  const clampedApr = Number.isFinite(apr) ? Math.max(-100, Math.min(1000, apr)) : 0;

  return {
    vault: vaultName,
    aum_usd: Number.isFinite(aum) ? aum : 0,
    pnl_usd: Number.isFinite(pnl) ? pnl : 0,
    roi_percent: Number.isFinite(roi) ? roi : 0,
    apr_percent: clampedApr,
    twrr_percent: Number.isFinite(twrrPercent) ? twrrPercent : 0,
    last_valuation_usd:
      typeof lastValuationUSD === "number" && Number.isFinite(lastValuationUSD)
        ? lastValuationUSD
        : 0,
    net_flow_since_valuation_usd: Number.isFinite(netFlowSinceValUSD)
      ? netFlowSinceValUSD
      : 0,
    deposits_cum_usd: Number.isFinite(depositedCum) ? depositedCum : 0,
    withdrawals_cum_usd: Number.isFinite(withdrawnCum) ? withdrawnCum : 0,
    as_of: new Date().toISOString(),
  };
}

// --- New: Per-vault daily time series for AUM, PnL, ROI, APR ---
// Header metrics endpoint
reportsRouter.get("/reports/vaults/:name/header", async (req, res) => {
  try {
    const name = String(req.params.name);
    const v = vaultRepository.findByName(name);
    if (!v) return res.status(404).json({ error: "vault not found" });
    const metrics = await buildVaultHeaderMetrics(name);
    res.json(metrics);
  } catch (e: any) {
    res.status(500).json({
      error: e?.message || "Failed to build header metrics",
    });
  }
});

reportsRouter.get("/reports/vaults/:name/series", async (req, res) => {
  try {
    const name = String(req.params.name);
    const v = vaultRepository.findByName(name);
    if (!v) return res.status(404).json({ error: "vault not found" });
    const start = req.query.start ? String(req.query.start) : undefined;
    const end = req.query.end ? String(req.query.end) : undefined;

    const usdSeries = await buildVaultDailySeries(name, start, end);
    const vndRate = await usdToVnd();
    const series = usdSeries.map((p) => ({
      ...p,
      aum_vnd: p.aum_usd * vndRate,
      pnl_vnd: p.pnl_usd * vndRate,
    }));
    res.json({ vault: name, series });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to build series" });
  }
});

// --- New: Summary of latest metrics for each vault ---
reportsRouter.get("/reports/vaults/summary", async (req, res) => {
  try {
    const names = vaultRepository.findAll().map((v) => v.name);
    const vndRate = await usdToVnd();

    // Use optimized function that only computes latest metrics, not entire time series
    const vaultMetrics = await Promise.all(
      names.map(async (name) => {
        const metrics = await buildLatestVaultMetrics(name);
        if (!metrics) return null;
        return {
          vault: name,
          aum_usd: metrics.aum_usd,
          aum_vnd: metrics.aum_usd * vndRate,
          pnl_usd: metrics.pnl_usd,
          pnl_vnd: metrics.pnl_usd * vndRate,
          roi_percent: metrics.roi_percent,
          apr_percent: metrics.apr_percent,
          twrr_percent: metrics.twrr_percent,
        };
      }),
    );

    const rows = vaultMetrics.filter(
      (r): r is NonNullable<typeof r> => r !== null,
    );

    const totals = rows.reduce(
      (acc, r) => {
        acc.aum_usd += r.aum_usd || 0;
        acc.aum_vnd += r.aum_vnd || 0;
        acc.pnl_usd += r.pnl_usd || 0;
        acc.pnl_vnd += r.pnl_vnd || 0;
        return acc;
      },
      { aum_usd: 0, aum_vnd: 0, pnl_usd: 0, pnl_vnd: 0 },
    );

    res.json({ rows, totals });
  } catch (e: any) {
    res.status(500).json({
      error: e?.message || "Failed to summarize vaults",
    });
  }
});

// --- New: Aggregated time series across all vaults (or a single vault via account=) ---
reportsRouter.get("/reports/series", async (req, res) => {
  try {
    const account = req.query.account ? String(req.query.account) : undefined;
    const start = req.query.start ? String(req.query.start) : undefined;
    const end = req.query.end ? String(req.query.end) : undefined;

    const vaultsParam = req.query.vaults ? String(req.query.vaults) : undefined;
    const excludeParam = req.query.exclude
      ? String(req.query.exclude)
      : undefined;

    let targetVaults = account
      ? [account]
      : vaultRepository.findAll().map((v: any) => v.name);

    // Allow explicitly specifying the vault list (comma-separated) to support
    // frontend pages that want to exclude system vaults like "spend"/"borrowings".
    if (!account && vaultsParam) {
      const wanted = vaultsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (wanted.length > 0) targetVaults = wanted;
    }

    if (excludeParam) {
      const excluded = new Set(
        excludeParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
      targetVaults = targetVaults.filter((n) => !excluded.has(n));
    }
    const perVault = await Promise.all(
      targetVaults.map((n: any) =>
        buildVaultDailySeries(n, start, end).then((s) => ({
          name: n,
          s,
        })),
      ),
    );

    // Pre-index each vault series by date for fast lookup.
    const perVaultState = perVault.map(({ name, s }) => ({
      name,
      s,
      byDate: new Map<string, any>(s.map((p: any) => [p.date, p])),
    }));

    // union of dates
    const allDates = new Set<string>();
    for (const { s } of perVaultState) s.forEach((p: any) => allDates.add(p.date));
    const dates = Array.from(allDates).sort((a: any, b: any) =>
      a.localeCompare(b),
    );

    type Row = {
      date: string;
      aum_usd: number;
      deposits_cum_usd: number;
      withdrawals_cum_usd: number;
      pnl_usd: number;
      roi_percent: number;
      apr_percent: number;
      twrr_percent: number;
    };
    const rows: Row[] = [];

    // Aggregate cash flows from all vaults for proper IRR calculation.
    // IMPORTANT: This must be independent of the requested `start`/`end` range.
    // The series range only slices returned dates; APR/IRR must still be computed
    // from true inception cash flows (not "reset" to the requested start date).
    const endBoundary = end || new Date().toISOString().slice(0, 10);
    const aggregatedCashFlowsRaw: Array<{ amount: number; date: string }> = [];
    let firstDepositDate: string | undefined = undefined;

    for (const vaultName of targetVaults) {
      const entries = vaultRepository
        .findAllEntries(vaultName)
        .sort((a: any, b: any) => String(a.at).localeCompare(String(b.at)));

      for (const e of entries as any[]) {
        const entryDate = String(e.at).slice(0, 10);
        if (entryDate > endBoundary) continue;

        const usd = typeof e.usdValue === "number" ? e.usdValue : 0;
        if (!Number.isFinite(usd) || usd <= 1e-8) continue;

        if (e.type === "DEPOSIT") {
          if (!firstDepositDate || entryDate < firstDepositDate) {
            firstDepositDate = entryDate;
          }
          aggregatedCashFlowsRaw.push({ amount: -usd, date: entryDate });
        } else if (e.type === "WITHDRAW") {
          aggregatedCashFlowsRaw.push({ amount: usd, date: entryDate });
        }
      }
    }

    const firstDepositDateObj = firstDepositDate
      ? new Date(firstDepositDate)
      : undefined;

    const aggregatedCashFlows: Array<{
      amount: number;
      daysFromStart: number;
      date: string;
    }> = firstDepositDateObj
      ? aggregatedCashFlowsRaw
          .map((cf) => ({
            amount: cf.amount,
            date: cf.date,
            daysFromStart: dateDiffInDays(firstDepositDateObj, new Date(cf.date)),
          }))
          .sort((a, b) => a.date.localeCompare(b.date))
      : [];

    // Track last APR to keep it flat when AUM = 0
    let lastApr = 0;
    // Track time-weighted return (TWRR) across the aggregated series.
    let twrrFactor = 1;
    let twrrPrevAum = 0;
    let twrrPrevDep = 0;
    let twrrPrevWdr = 0;
    let hasPrevTwrrPoint = false;

    for (const date of dates) {
      let aum = 0,
        dep = 0,
        wdr = 0,
        pnl = 0;
      for (const v of perVaultState) {
        const pt = v.byDate.get(date);
        if (!pt) continue;

        aum += pt.aum_usd;

        const depositsCumUsd = pt.deposits_cum_usd || 0;
        const withdrawalsCumUsd = pt.withdrawals_cum_usd || 0;

        dep += depositsCumUsd;
        wdr += withdrawalsCumUsd;
        pnl += pt.pnl_usd;
      }

      const netContributed = dep - wdr;
      // Calculate ROI (consistent with per-vault: PnL / net contributed)
      const roi = netContributed > 1e-8 ? (pnl / netContributed) * 100 : 0;

      // Calculate APR using proper IRR with all aggregated cash flows
      let apr = lastApr;
      if (firstDepositDateObj && dep > 0) {
        const daysElapsed = Math.max(
          1,
          dateDiffInDays(firstDepositDateObj, new Date(date)) + 1,
        );

        // If vault is fully liquidated (AUM = 0 AND netContributed ≈ 0), keep the previous APR (stay flat)
        // But if there's still net contributed capital (like 100% loss), calculate actual APR
        if (aum < 1e-8 && netContributed < 1e-8) {
          apr = lastApr; // Keep previous APR for fully liquidated vaults
        } else if (aum < 1e-8) {
          // 100% loss scenario: AUM = 0 but still have net contributed capital
          apr = roi; // Use ROI as the realized return
        } else {
          // Build cash flows for IRR: all deposits/withdrawals up to this day + terminal value
          const cashFlowsForIRR = aggregatedCashFlows
            .filter((cf) => cf.date <= date)
            .map((cf) => ({
              amount: cf.amount,
              daysFromStart: cf.daysFromStart,
            }));

          // Add terminal value (current AUM) as positive cash flow
          cashFlowsForIRR.push({
            amount: aum,
            daysFromStart: daysElapsed - 1,
          });

          apr = calculateIRRBasedAPR(cashFlowsForIRR, daysElapsed, roi / 100);
        }
      }

      // Clamp APR to reasonable range (-100% to 1000%) to prevent extreme values
      let aprToUse = Number.isFinite(apr) ? apr : 0;
      aprToUse = Math.max(-100, Math.min(1000, aprToUse));

      if (hasPrevTwrrPoint && twrrPrevAum > 1e-8) {
        const netFlow = (dep - twrrPrevDep) - (wdr - twrrPrevWdr);
        const r = (aum - twrrPrevAum - netFlow) / twrrPrevAum;
        const link = 1 + r;
        twrrFactor = link <= 0 ? 0 : twrrFactor * link;
      }
      const twrrPercent = (twrrFactor - 1) * 100;

      rows.push({
        date,
        aum_usd: Number.isFinite(aum) ? aum : 0,
        deposits_cum_usd: Number.isFinite(dep) ? dep : 0,
        withdrawals_cum_usd: Number.isFinite(wdr) ? wdr : 0,
        pnl_usd: Number.isFinite(pnl) ? pnl : 0,
        roi_percent: Number.isFinite(roi) ? roi : 0,
        apr_percent: aprToUse,
        twrr_percent: Number.isFinite(twrrPercent) ? twrrPercent : 0,
      });

      // Update lastApr for next iteration (to keep APR flat when AUM = 0)
      lastApr = aprToUse;

      hasPrevTwrrPoint = true;
      twrrPrevAum = Number.isFinite(aum) ? aum : 0;
      twrrPrevDep = Number.isFinite(dep) ? dep : 0;
      twrrPrevWdr = Number.isFinite(wdr) ? wdr : 0;
    }

    const vndRate = await usdToVnd();
    const series = rows.map((p) => ({
      ...p,
      aum_vnd: p.aum_usd * vndRate,
      pnl_vnd: p.pnl_usd * vndRate,
    }));

    const latestUsd = rows.length > 0 ? rows[rows.length - 1] : undefined;
    const previousUsd = rows.length > 1 ? rows[rows.length - 2] : undefined;
    const latest = series.length > 0 ? series[series.length - 1] : undefined;
    const previous = series.length > 1 ? series[series.length - 2] : undefined;

    const totalDaysElapsed =
      latestUsd && firstDepositDateObj
        ? dateDiffInDays(firstDepositDateObj, new Date(latestUsd.date)) + 1
        : 0;
    const aprEligible = totalDaysElapsed >= 30;
    const { returnPercent: rangeReturnPercent, daysElapsed: rangeDaysElapsed } =
      calculateRangeReturnPercent(rows);
    const { returnPercent: rangeTwrrPercent, daysElapsed: rangeTwrrDaysElapsed } =
      calculateRangeTimeWeightedReturnPercent(rows);

    const summary =
      latest && latestUsd
        ? {
            aum_usd: latestUsd.aum_usd,
            aum_vnd: latestUsd.aum_usd * vndRate,
            pnl_usd: latestUsd.pnl_usd,
            pnl_vnd: latestUsd.pnl_usd * vndRate,
            apr_percent: latestUsd.apr_percent,
            roi_percent: latestUsd.roi_percent,
            twrr_percent: latestUsd.twrr_percent,
            aum_change_usd: previousUsd ? latestUsd.aum_usd - previousUsd.aum_usd : 0,
            aum_change_vnd: previous ? latest.aum_vnd - previous.aum_vnd : 0,
            aum_change_percent:
              previousUsd && Math.abs(previousUsd.aum_usd) > 1e-12
                ? ((latestUsd.aum_usd - previousUsd.aum_usd) / previousUsd.aum_usd) *
                  100
                : 0,
            pnl_change_usd: previousUsd ? latestUsd.pnl_usd - previousUsd.pnl_usd : 0,
            pnl_change_vnd: previous ? latest.pnl_vnd - previous.pnl_vnd : 0,
            pnl_change_percent:
              previousUsd && Math.abs(previousUsd.aum_usd) > 1e-12
                ? ((latestUsd.pnl_usd - previousUsd.pnl_usd) /
                    Math.abs(previousUsd.aum_usd)) *
                  100
                : 0,
            apr_change_percent_points: previousUsd
              ? latestUsd.apr_percent - previousUsd.apr_percent
              : 0,
            roi_change_percent_points: previousUsd
              ? latestUsd.roi_percent - previousUsd.roi_percent
              : 0,
            twrr_change_percent_points: previousUsd
              ? latestUsd.twrr_percent - previousUsd.twrr_percent
              : 0,
            apr_eligible: aprEligible,
            days_elapsed: totalDaysElapsed,
            range_return_percent: rangeReturnPercent,
            range_days_elapsed: rangeDaysElapsed,
            range_twrr_percent: rangeTwrrPercent,
            range_twrr_days_elapsed: rangeTwrrDaysElapsed,
          }
        : null;

    res.json({ account: account || "ALL", series, summary });
  } catch (e: any) {
    res.status(500).json({
      error: e?.message || "Failed to build aggregate series",
    });
  }
});
