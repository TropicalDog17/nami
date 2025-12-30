/**
 * Financial calculation service
 * Provides financial formulas like IRR, ROI, APR
 */

import { Asset } from "../types";

export interface CashFlow {
  amount: number;
  daysFromStart: number;
}

export interface CashFlowWithDate extends CashFlow {
  date: string;
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
export function calculateIRR(
  cashFlows: CashFlow[],
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
export function calculateIRRBasedAPR(
  cashFlows: CashFlow[],
  totalDays: number,
  roi: number,
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

/**
 * Calculate simple ROI
 */
export function calculateROI(profit: number, cost: number): number {
  if (cost <= 0) return 0;
  return (profit / cost) * 100;
}

/**
 * Annualize a return rate
 */
export function annualizeRate(rate: number, days: number): number {
  if (days <= 0) return 0;
  return (Math.pow(1 + rate, 365 / days) - 1) * 100;
}

/**
 * Date utilities
 */
export function toISODate(d: Date): string {
  const dd = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
  return dd.toISOString().slice(0, 10);
}

export function addDays(d: Date, n: number): Date {
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

export function dateDiffInDays(a: Date, b: Date): number {
  const ms = addDays(b, 0).getTime() - addDays(a, 0).getTime();
  return Math.floor(ms / (24 * 3600 * 1000));
}

/**
 * Asset key generator for maps
 */
export function assetKey(a: Asset): string {
  return `${a.type}:${a.symbol.toUpperCase()}`;
}
