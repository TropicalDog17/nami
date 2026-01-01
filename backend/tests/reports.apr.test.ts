import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

/**
 * APR Calculation Tests - Money-Weighted Return (IRR-based)
 *
 * These tests verify that APR is calculated using Internal Rate of Return (IRR),
 * which properly accounts for the timing and size of cash flows.
 *
 * IRR Formula: Find r such that NPV = Σ (CF_t / (1 + r)^t) = 0
 * - Deposits are negative cash flows (money invested)
 * - Withdrawals are positive cash flows (money returned)
 * - Final value is a positive cash flow (terminal value)
 *
 * Annualized IRR = ((1 + IRR)^(365/days) - 1) * 100
 */

type Asset = import('../src/types').Asset;
type VaultEntry = import('../src/types').VaultEntry;

describe('APR calculations using IRR (Money-Weighted Return)', () => {
  const vaultName = 'TestVault';
  let mockEntries: VaultEntry[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    mockEntries = [];
    vi.resetModules();

    // Mock the repositories index
    vi.doMock('../src/repositories', () => {
      return {
        vaultRepository: {
          findByName: (name: string) => (name === vaultName ? { name: vaultName, status: 'ACTIVE', createdAt: '2025-01-01T00:00:00Z' } : undefined),
          findAll: () => [{ name: vaultName, status: 'ACTIVE', createdAt: '2025-01-01T00:00:00Z' }],
          findAllEntries: (name: string) => (name === vaultName ? mockEntries : []),
        },
      };
    });

    // Mock the price service
    vi.doMock('../src/services/price.service', () => {
      return {
        priceService: {
          getRateUSD: async (asset: Asset) => {
            const symbol = asset.symbol.toUpperCase();
            const rateUSD = symbol === 'USD' ? 1 : symbol === 'VND' ? 1 / 26315 : 1;
            return { asset, rateUSD, timestamp: new Date().toISOString(), source: rateUSD === 1 ? 'FIXED' : 'FALLBACK' } as any;
          },
        },
      };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function appFactory(router: any) {
    const app = express();
    app.use(express.json());
    app.use('/api', router);
    return app;
  }

  const USD: Asset = { type: 'FIAT', symbol: 'USD' };

  // ============================================================================
  // SINGLE DEPOSIT SCENARIOS
  // For single deposit, IRR simplifies to: (FV/PV)^(1/years) - 1
  // ============================================================================

  describe('Single deposit scenarios', () => {
    it('should calculate 10% APR for $100 → $110 over exactly 1 year', async () => {
      vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));

      mockEntries = [
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 100, usdValue: 100, at: '2025-01-01T00:00:00Z' },
        { vault: vaultName, type: 'VALUATION', asset: USD, amount: 0, usdValue: 110, at: '2026-01-01T00:00:00Z' },
      ];

      const { reportsRouter } = await import('../src/handlers/reports.handler');
      const app = appFactory(reportsRouter);

      const res = await request(app).get(`/api/reports/vaults/${vaultName}/header`).expect(200);

      // IRR for single cash flow: (110/100)^(365/365) - 1 = 10%
      expect(res.body.apr_percent).toBeCloseTo(10, 1);
    });

    it('should calculate -10% APR for $100 → $90 over exactly 1 year (loss)', async () => {
      vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));

      mockEntries = [
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 100, usdValue: 100, at: '2025-01-01T00:00:00Z' },
        { vault: vaultName, type: 'VALUATION', asset: USD, amount: 0, usdValue: 90, at: '2026-01-01T00:00:00Z' },
      ];

      const { reportsRouter } = await import('../src/handlers/reports.handler');
      const app = appFactory(reportsRouter);

      const res = await request(app).get(`/api/reports/vaults/${vaultName}/header`).expect(200);

      // IRR: (90/100)^(365/365) - 1 = -10%
      expect(res.body.apr_percent).toBeCloseTo(-10, 1);
    });

    it('should annualize correctly for 6-month period: $100 → $105', async () => {
      // 5% gain in ~182 days should annualize to ~10.25% APR
      vi.setSystemTime(new Date('2025-07-02T12:00:00Z'));

      mockEntries = [
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 100, usdValue: 100, at: '2025-01-01T00:00:00Z' },
        { vault: vaultName, type: 'VALUATION', asset: USD, amount: 0, usdValue: 105, at: '2025-07-02T00:00:00Z' },
      ];

      const { reportsRouter } = await import('../src/handlers/reports.handler');
      const app = appFactory(reportsRouter);

      const res = await request(app).get(`/api/reports/vaults/${vaultName}/header`).expect(200);

      // Days elapsed: Jan 1 to Jul 2 = 182 days
      // IRR annualized: (105/100)^(365/182) - 1 ≈ 10.25%
      const days = 182;
      const expectedAPR = (Math.pow(105 / 100, 365 / days) - 1) * 100;
      expect(res.body.apr_percent).toBeCloseTo(expectedAPR, 1);
    });

    it('should NOT annualize for periods < 30 days (avoid misleading extrapolation)', async () => {
      // 2% gain in 15 days would annualize to ~60% which is misleading
      vi.setSystemTime(new Date('2025-01-16T12:00:00Z'));

      mockEntries = [
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 100, usdValue: 100, at: '2025-01-01T00:00:00Z' },
        { vault: vaultName, type: 'VALUATION', asset: USD, amount: 0, usdValue: 102, at: '2025-01-16T00:00:00Z' },
      ];

      const { reportsRouter } = await import('../src/handlers/reports.handler');
      const app = appFactory(reportsRouter);

      const res = await request(app).get(`/api/reports/vaults/${vaultName}/header`).expect(200);

      // For < 30 days, APR should equal ROI (non-annualized)
      expect(res.body.roi_percent).toBeCloseTo(2, 1);
      expect(res.body.apr_percent).toBeCloseTo(2, 1);
    });
  });

  // ============================================================================
  // MULTIPLE DEPOSITS (DCA Pattern)
  // IRR properly weights returns based on when money was invested
  // ============================================================================

  describe('Multiple deposits (DCA pattern)', () => {
    it('should weight early deposits more heavily in IRR calculation', async () => {
      // Scenario: $1000 on Jan 1, $100 on Dec 1, final value $1210 on Dec 31
      // The $1000 was invested for 365 days, $100 for only 30 days
      // Simple ROI: (1210-1100)/1100 = 10%
      // IRR should be close to 10% since most money was invested early
      vi.setSystemTime(new Date('2025-12-31T12:00:00Z'));

      mockEntries = [
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 1000, usdValue: 1000, at: '2025-01-01T00:00:00Z' },
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 100, usdValue: 100, at: '2025-12-01T00:00:00Z' },
        { vault: vaultName, type: 'VALUATION', asset: USD, amount: 0, usdValue: 1210, at: '2025-12-31T00:00:00Z' },
      ];

      const { reportsRouter } = await import('../src/handlers/reports.handler');
      const app = appFactory(reportsRouter);

      const res = await request(app).get(`/api/reports/vaults/${vaultName}/header`).expect(200);

      // IRR should be approximately 10-11% (the early $1000 dominates)
      // Cash flows: -1000 at t=0, -100 at t=334, +1210 at t=364
      // The actual IRR is slightly higher than simple 10% because the $100 late deposit
      // contributes to the gain but was only invested for 30 days
      expect(res.body.apr_percent).toBeGreaterThan(9);
      expect(res.body.apr_percent).toBeLessThan(12);
    });

    it('should weight late deposits less heavily in IRR calculation', async () => {
      // Scenario: $100 on Jan 1, $1000 on Dec 1, final value $1210 on Dec 31
      // The $100 was invested for 365 days, $1000 for only 30 days
      // Same total deposit and final value as above, but money-weighted return is different
      vi.setSystemTime(new Date('2025-12-31T12:00:00Z'));

      mockEntries = [
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 100, usdValue: 100, at: '2025-01-01T00:00:00Z' },
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 1000, usdValue: 1000, at: '2025-12-01T00:00:00Z' },
        { vault: vaultName, type: 'VALUATION', asset: USD, amount: 0, usdValue: 1210, at: '2025-12-31T00:00:00Z' },
      ];

      const { reportsRouter } = await import('../src/handlers/reports.handler');
      const app = appFactory(reportsRouter);

      const res = await request(app).get(`/api/reports/vaults/${vaultName}/header`).expect(200);

      // IRR should be MUCH higher because most money wasn't invested long
      // The $100 grew significantly while $1000 barely had time to grow
      // This correctly reflects that the investor's experience was different
      expect(res.body.apr_percent).toBeGreaterThan(50); // Much higher than simple 10%
    });

    it('should handle monthly DCA pattern correctly', async () => {
      // $100/month for 12 months, final value $1320 (10% total gain on $1200 invested)
      vi.setSystemTime(new Date('2025-12-31T12:00:00Z'));

      mockEntries = [
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 100, usdValue: 100, at: '2025-01-01T00:00:00Z' },
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 100, usdValue: 100, at: '2025-02-01T00:00:00Z' },
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 100, usdValue: 100, at: '2025-03-01T00:00:00Z' },
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 100, usdValue: 100, at: '2025-04-01T00:00:00Z' },
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 100, usdValue: 100, at: '2025-05-01T00:00:00Z' },
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 100, usdValue: 100, at: '2025-06-01T00:00:00Z' },
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 100, usdValue: 100, at: '2025-07-01T00:00:00Z' },
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 100, usdValue: 100, at: '2025-08-01T00:00:00Z' },
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 100, usdValue: 100, at: '2025-09-01T00:00:00Z' },
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 100, usdValue: 100, at: '2025-10-01T00:00:00Z' },
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 100, usdValue: 100, at: '2025-11-01T00:00:00Z' },
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 100, usdValue: 100, at: '2025-12-01T00:00:00Z' },
        { vault: vaultName, type: 'VALUATION', asset: USD, amount: 0, usdValue: 1320, at: '2025-12-31T00:00:00Z' },
      ];

      const { reportsRouter } = await import('../src/handlers/reports.handler');
      const app = appFactory(reportsRouter);

      const res = await request(app).get(`/api/reports/vaults/${vaultName}/header`).expect(200);

      // For DCA, IRR should be higher than simple ROI because average holding period is ~6 months
      // Simple ROI: 120/1200 = 10%
      // IRR should be ~18-20% annualized (money was invested on average for half the year)
      expect(res.body.roi_percent).toBeCloseTo(10, 1);
      expect(res.body.apr_percent).toBeGreaterThan(15); // IRR > simple ROI for DCA with gains
    });
  });

  // ============================================================================
  // MIXED FLOWS (Deposits + Withdrawals)
  // Most complex case - IRR is essential for accurate performance measurement
  // ============================================================================

  describe('Mixed flows (deposits and withdrawals)', () => {
    it('should handle mid-period withdrawal correctly', async () => {
      // Deposit $1000, withdraw $200 after 6 months, end with $900
      // This tests that withdrawals are treated as positive cash flows at their timing
      vi.setSystemTime(new Date('2025-12-31T12:00:00Z'));

      mockEntries = [
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 1000, usdValue: 1000, at: '2025-01-01T00:00:00Z' },
        { vault: vaultName, type: 'WITHDRAW', asset: USD, amount: 200, usdValue: 200, at: '2025-07-01T00:00:00Z' },
        { vault: vaultName, type: 'VALUATION', asset: USD, amount: 0, usdValue: 900, at: '2025-12-31T00:00:00Z' },
      ];

      const { reportsRouter } = await import('../src/handlers/reports.handler');
      const app = appFactory(reportsRouter);

      const res = await request(app).get(`/api/reports/vaults/${vaultName}/header`).expect(200);

      // Cash flows: -1000 at t=0, +200 at t=181, +900 at t=364
      // Total return: 200 + 900 - 1000 = 100 (10% simple return)
      // IRR accounts for timing of the $200 withdrawal
      expect(res.body.pnl_usd).toBeCloseTo(100, 1);
      expect(res.body.apr_percent).toBeGreaterThan(8); // Should be around 10%
      expect(res.body.apr_percent).toBeLessThan(15);
    });

    it('should calculate correct IRR when withdrawing profits', async () => {
      // Deposit $1000, gains to $1100, withdraw $100 profit, ends at $1000
      // This is a 10% gain where profit was taken out
      vi.setSystemTime(new Date('2025-12-31T12:00:00Z'));

      mockEntries = [
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 1000, usdValue: 1000, at: '2025-01-01T00:00:00Z' },
        { vault: vaultName, type: 'WITHDRAW', asset: USD, amount: 100, usdValue: 100, at: '2025-07-01T00:00:00Z' },
        { vault: vaultName, type: 'VALUATION', asset: USD, amount: 0, usdValue: 1000, at: '2025-12-31T00:00:00Z' },
      ];

      const { reportsRouter } = await import('../src/handlers/reports.handler');
      const app = appFactory(reportsRouter);

      const res = await request(app).get(`/api/reports/vaults/${vaultName}/header`).expect(200);

      // PnL = 1000 (final) + 100 (withdrawn) - 1000 (deposited) = 100
      expect(res.body.pnl_usd).toBeCloseTo(100, 1);
      // IRR: -1000 at t=0, +100 at t=181, +1000 at t=364
      // The IRR is slightly higher than 10% because the $100 withdrawn at mid-year
      // effectively reduced the capital at risk for the second half
      expect(res.body.apr_percent).toBeGreaterThan(9);
      expect(res.body.apr_percent).toBeLessThan(12);
    });

    it('should handle deposit-withdraw-deposit pattern', async () => {
      // Complex flow: deposit, partial withdraw, deposit more
      vi.setSystemTime(new Date('2025-12-31T12:00:00Z'));

      mockEntries = [
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 1000, usdValue: 1000, at: '2025-01-01T00:00:00Z' },
        { vault: vaultName, type: 'WITHDRAW', asset: USD, amount: 500, usdValue: 500, at: '2025-04-01T00:00:00Z' },
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 500, usdValue: 500, at: '2025-07-01T00:00:00Z' },
        { vault: vaultName, type: 'VALUATION', asset: USD, amount: 0, usdValue: 1100, at: '2025-12-31T00:00:00Z' },
      ];

      const { reportsRouter } = await import('../src/handlers/reports.handler');
      const app = appFactory(reportsRouter);

      const res = await request(app).get(`/api/reports/vaults/${vaultName}/header`).expect(200);

      // Net deposited: 1000 - 500 + 500 = 1000
      // PnL = 1100 + 500 - 1500 = 100
      expect(res.body.pnl_usd).toBeCloseTo(100, 1);
      // IRR should reflect the actual timing of when capital was at work
      expect(res.body.apr_percent).toBeGreaterThan(5);
    });

    it('should handle full withdrawal and re-deposit', async () => {
      // Deposit, full withdraw, re-deposit - tests gap handling
      vi.setSystemTime(new Date('2025-12-31T12:00:00Z'));

      mockEntries = [
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 1000, usdValue: 1000, at: '2025-01-01T00:00:00Z' },
        { vault: vaultName, type: 'WITHDRAW', asset: USD, amount: 1050, usdValue: 1050, at: '2025-04-01T00:00:00Z' }, // 5% gain
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 1050, usdValue: 1050, at: '2025-07-01T00:00:00Z' },
        { vault: vaultName, type: 'VALUATION', asset: USD, amount: 0, usdValue: 1102.5, at: '2025-12-31T00:00:00Z' }, // Another 5% gain
      ];

      const { reportsRouter } = await import('../src/handlers/reports.handler');
      const app = appFactory(reportsRouter);

      const res = await request(app).get(`/api/reports/vaults/${vaultName}/header`).expect(200);

      // Two periods of 5% gain each
      // PnL = 1102.5 + 1050 - 1000 - 1050 = 102.5
      expect(res.body.pnl_usd).toBeCloseTo(102.5, 1);
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge cases', () => {
    it('should return 0% APR when no deposits', async () => {
      vi.setSystemTime(new Date('2025-06-01T12:00:00Z'));
      mockEntries = [];

      const { reportsRouter } = await import('../src/handlers/reports.handler');
      const app = appFactory(reportsRouter);

      const res = await request(app).get(`/api/reports/vaults/${vaultName}/header`).expect(200);

      expect(res.body.apr_percent).toBe(0);
      expect(res.body.roi_percent).toBe(0);
    });

    it('should handle zero gain correctly (0% APR)', async () => {
      vi.setSystemTime(new Date('2025-12-31T12:00:00Z'));

      mockEntries = [
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 1000, usdValue: 1000, at: '2025-01-01T00:00:00Z' },
        { vault: vaultName, type: 'VALUATION', asset: USD, amount: 0, usdValue: 1000, at: '2025-12-31T00:00:00Z' },
      ];

      const { reportsRouter } = await import('../src/handlers/reports.handler');
      const app = appFactory(reportsRouter);

      const res = await request(app).get(`/api/reports/vaults/${vaultName}/header`).expect(200);

      expect(res.body.apr_percent).toBeCloseTo(0, 5);
      expect(res.body.roi_percent).toBeCloseTo(0, 5);
    });

    it('should handle 100% loss correctly', async () => {
      vi.setSystemTime(new Date('2025-12-31T12:00:00Z'));

      mockEntries = [
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 1000, usdValue: 1000, at: '2025-01-01T00:00:00Z' },
        { vault: vaultName, type: 'VALUATION', asset: USD, amount: 0, usdValue: 0, at: '2025-12-31T00:00:00Z' },
      ];

      const { reportsRouter } = await import('../src/handlers/reports.handler');
      const app = appFactory(reportsRouter);

      const res = await request(app).get(`/api/reports/vaults/${vaultName}/header`).expect(200);

      expect(res.body.roi_percent).toBeCloseTo(-100, 1);
      expect(res.body.apr_percent).toBeCloseTo(-100, 1);
    });

    it('should handle very small amounts without floating point errors', async () => {
      vi.setSystemTime(new Date('2025-12-31T12:00:00Z'));

      mockEntries = [
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 0.01, usdValue: 0.01, at: '2025-01-01T00:00:00Z' },
        { vault: vaultName, type: 'VALUATION', asset: USD, amount: 0, usdValue: 0.011, at: '2025-12-31T00:00:00Z' },
      ];

      const { reportsRouter } = await import('../src/handlers/reports.handler');
      const app = appFactory(reportsRouter);

      const res = await request(app).get(`/api/reports/vaults/${vaultName}/header`).expect(200);

      // 10% gain
      expect(res.body.roi_percent).toBeCloseTo(10, 0);
      expect(res.body.apr_percent).toBeCloseTo(10, 0);
    });

    it('should handle same-day deposit and valuation', async () => {
      vi.setSystemTime(new Date('2025-01-01T12:00:00Z'));

      mockEntries = [
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 100, usdValue: 100, at: '2025-01-01T00:00:00Z' },
        { vault: vaultName, type: 'VALUATION', asset: USD, amount: 0, usdValue: 100, at: '2025-01-01T12:00:00Z' },
      ];

      const { reportsRouter } = await import('../src/handlers/reports.handler');
      const app = appFactory(reportsRouter);

      const res = await request(app).get(`/api/reports/vaults/${vaultName}/header`).expect(200);

      // No time elapsed, should be 0% or handle gracefully
      expect(res.body.apr_percent).toBeCloseTo(0, 5);
    });
  });

  // ============================================================================
  // TIME SERIES TESTS
  // Verify APR is calculated correctly at each point in the series
  // ============================================================================

  describe('Time series APR calculations', () => {
    it('should show APR progression over time for growing investment', async () => {
      vi.setSystemTime(new Date('2025-03-01T12:00:00Z'));

      mockEntries = [
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 100, usdValue: 100, at: '2025-01-01T00:00:00Z' },
        { vault: vaultName, type: 'VALUATION', asset: USD, amount: 0, usdValue: 101, at: '2025-01-15T00:00:00Z' },
        { vault: vaultName, type: 'VALUATION', asset: USD, amount: 0, usdValue: 103, at: '2025-02-01T00:00:00Z' },
        { vault: vaultName, type: 'VALUATION', asset: USD, amount: 0, usdValue: 106, at: '2025-03-01T00:00:00Z' },
      ];

      const { reportsRouter } = await import('../src/handlers/reports.handler');
      const app = appFactory(reportsRouter);

      const res = await request(app)
        .get(`/api/reports/vaults/${vaultName}/series`)
        .query({ end: '2025-03-01' })
        .expect(200);

      const series = res.body.series;

      // Jan 15: 1% gain in 14 days, < 30 days so APR = ROI
      const jan15 = series.find((p: any) => p.date === '2025-01-15');
      expect(jan15).toBeTruthy();
      expect(jan15.roi_percent).toBeCloseTo(1, 1);
      expect(jan15.apr_percent).toBeCloseTo(1, 1); // No annualization < 30 days

      // Feb 1: 3% gain in 31 days, should annualize
      const feb1 = series.find((p: any) => p.date === '2025-02-01');
      expect(feb1).toBeTruthy();
      expect(feb1.roi_percent).toBeCloseTo(3, 1);
      // Annualized: (1.03)^(365/31) - 1 ≈ 42%
      const expectedFebAPR = (Math.pow(1.03, 365 / 31) - 1) * 100;
      expect(feb1.apr_percent).toBeCloseTo(expectedFebAPR, 0);

      // Mar 1: 6% gain in 59 days
      const mar1 = series.find((p: any) => p.date === '2025-03-01');
      expect(mar1).toBeTruthy();
      expect(mar1.roi_percent).toBeCloseTo(6, 1);
      // Annualized: (1.06)^(365/59) - 1 ≈ 43%
      const expectedMarAPR = (Math.pow(1.06, 365 / 59) - 1) * 100;
      expect(mar1.apr_percent).toBeCloseTo(expectedMarAPR, 0);
    });

    it('should handle DCA in series with proper IRR at each point', async () => {
      vi.setSystemTime(new Date('2025-04-01T12:00:00Z'));

      mockEntries = [
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 100, usdValue: 100, at: '2025-01-01T00:00:00Z' },
        { vault: vaultName, type: 'VALUATION', asset: USD, amount: 0, usdValue: 102, at: '2025-01-31T00:00:00Z' },
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 100, usdValue: 100, at: '2025-02-01T00:00:00Z' },
        { vault: vaultName, type: 'VALUATION', asset: USD, amount: 0, usdValue: 206, at: '2025-02-28T00:00:00Z' },
        { vault: vaultName, type: 'DEPOSIT', asset: USD, amount: 100, usdValue: 100, at: '2025-03-01T00:00:00Z' },
        { vault: vaultName, type: 'VALUATION', asset: USD, amount: 0, usdValue: 312, at: '2025-04-01T00:00:00Z' },
      ];

      const { reportsRouter } = await import('../src/handlers/reports.handler');
      const app = appFactory(reportsRouter);

      const res = await request(app)
        .get(`/api/reports/vaults/${vaultName}/series`)
        .query({ end: '2025-04-01' })
        .expect(200);

      const series = res.body.series;

      // At Apr 1: $300 deposited, $312 value = $12 profit = 4% simple ROI
      const apr1 = series.find((p: any) => p.date === '2025-04-01');
      expect(apr1).toBeTruthy();
      expect(apr1.roi_percent).toBeCloseTo(4, 1);
      // IRR should be higher because later deposits had less time
      expect(apr1.apr_percent).toBeGreaterThan(4);
    });
  });
});
