import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";

type Asset = import("../src/types").Asset;

describe("reports/predicted-outflows", () => {
  const defaultAccount = "Spending";
  let mockTxs: any[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    mockTxs = [];
    vi.resetModules();

    vi.doMock("../src/repositories", () => {
      return {
        settingsRepository: {
          getDefaultSpendingVaultName: () => defaultAccount,
        },
        transactionRepository: {
          findAll: () => mockTxs,
        },
        borrowingRepository: {
          findByStatus: () => [],
        },
        vaultRepository: {
          findByName: () => undefined,
          findAll: () => [],
          findAllEntries: () => [],
        },
      };
    });

    vi.doMock("../src/services/price.service", () => {
      return {
        priceService: {
          getRateUSD: async (asset: Asset) => {
            const symbol = String(asset.symbol || "").toUpperCase();
            const rateUSD = symbol === "VND" ? 1 / 25000 : 1;
            return {
              asset,
              rateUSD,
              timestamp: new Date().toISOString(),
              source: "FIXED",
            } as any;
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
    app.use("/api", router);
    return app;
  }

  it("anchors start_date to month start and derives baseline from recorded expense days", async () => {
    vi.setSystemTime(new Date("2025-07-18T12:00:00Z"));

    mockTxs = [
      {
        type: "EXPENSE",
        account: defaultAccount,
        usdAmount: -300,
        createdAt: "2025-04-10T00:00:00Z",
      },
      {
        type: "EXPENSE",
        account: defaultAccount,
        usdAmount: -600,
        createdAt: "2025-06-05T00:00:00Z",
      },
    ];

    const { reportsRouter } = await import("../src/handlers/reports.handler");
    const app = appFactory(reportsRouter);

    const res = await request(app)
      .get(
        "/api/reports/predicted-outflows?start_date=2025-07-15&end_date=2025-08-31",
      )
      .expect(200);

    expect(res.body.start_date).toBe("2025-08-01");
    expect(res.body.end_date).toBe("2025-08-31");

    // History window is Feb-Jul 2025 (6 months, since forecast starts Aug 1).
    // Baseline = total expense / total recorded days (unique dates with expenses).
    const expectedBaselineDaily = (300 + 600) / 2;

    expect(res.body.baseline_daily_spend_usd).toBeCloseTo(
      expectedBaselineDaily,
      6,
    );
    expect(res.body.series[0].predicted_spend_usd).toBeCloseTo(
      expectedBaselineDaily,
      6,
    );
  });

  it("counts unique recorded days (multiple expenses on one day count as 1)", async () => {
    vi.setSystemTime(new Date("2025-07-18T12:00:00Z"));

    mockTxs = [
      { type: "EXPENSE", account: defaultAccount, usdAmount: -10, createdAt: "2025-02-01T00:00:00Z" },
      { type: "EXPENSE", account: defaultAccount, usdAmount: -20, createdAt: "2025-02-01T12:00:00Z" },
      { type: "EXPENSE", account: defaultAccount, usdAmount: -30, createdAt: "2025-03-02T00:00:00Z" },
    ];

    const { reportsRouter } = await import("../src/handlers/reports.handler");
    const app = appFactory(reportsRouter);

    const res = await request(app)
      .get(
        "/api/reports/predicted-outflows?start_date=2025-07-18&end_date=2025-08-31",
      )
      .expect(200);

    expect(res.body.start_date).toBe("2025-08-01");
    expect(res.body.end_date).toBe("2025-08-31");

    // Total expense = 60; recorded days = {2025-02-01, 2025-03-02} => 2 days.
    const expectedBaselineDaily = 60 / 2;
    expect(res.body.baseline_daily_spend_usd).toBeCloseTo(expectedBaselineDaily, 6);
    expect(res.body.series[0].predicted_spend_usd).toBeCloseTo(
      expectedBaselineDaily,
      6,
    );
  });

  it("predicts per-day using weekday averages and falls back to overall average when missing weekday data", async () => {
    vi.setSystemTime(new Date("2025-07-18T12:00:00Z"));

    // History window is Feb–Jul 2025; include two Mondays and two Tuesdays, and a single Wednesday.
    mockTxs = [
      { type: "EXPENSE", account: defaultAccount, usdAmount: -10, createdAt: "2025-02-03T00:00:00Z" }, // Mon
      { type: "EXPENSE", account: defaultAccount, usdAmount: -30, createdAt: "2025-03-03T00:00:00Z" }, // Mon
      { type: "EXPENSE", account: defaultAccount, usdAmount: -20, createdAt: "2025-02-04T00:00:00Z" }, // Tue
      { type: "EXPENSE", account: defaultAccount, usdAmount: -40, createdAt: "2025-03-04T00:00:00Z" }, // Tue
      { type: "EXPENSE", account: defaultAccount, usdAmount: -70, createdAt: "2025-02-05T00:00:00Z" }, // Wed
    ];

    const { reportsRouter } = await import("../src/handlers/reports.handler");
    const app = appFactory(reportsRouter);

    const res = await request(app)
      .get(
        "/api/reports/predicted-outflows?start_date=2025-07-15&end_date=2025-08-07",
      )
      .expect(200);

    const expectedOverallBaseline = (10 + 30 + 20 + 40 + 70) / 5; // 34
    const expectedMonday = (10 + 30) / 2; // 20
    const expectedTuesday = (20 + 40) / 2; // 30
    const expectedWednesday = 70; // single sample should be used

    expect(res.body.baseline_daily_spend_usd).toBeCloseTo(
      expectedOverallBaseline,
      6,
    );

    const byDate = Object.fromEntries(
      (res.body.series || []).map((d: any) => [d.date, d]),
    );
    // Aug 1, 2025 is Fri; there is no Fri history, so fall back to overall baseline.
    expect(byDate["2025-08-01"].predicted_spend_usd).toBeCloseTo(
      expectedOverallBaseline,
      6,
    );
    // Aug 4/5, 2025 are Mon/Tue and should use weekday-specific baselines.
    expect(byDate["2025-08-04"].predicted_spend_usd).toBeCloseTo(
      expectedMonday,
      6,
    );
    expect(byDate["2025-08-05"].predicted_spend_usd).toBeCloseTo(
      expectedTuesday,
      6,
    );
    // Aug 6, 2025 is Wed and should use the single-sample baseline (no fallback).
    expect(byDate["2025-08-06"].predicted_spend_usd).toBeCloseTo(
      expectedWednesday,
      6,
    );
  });

  it("uses at most the last 6 months for baseline calculations", async () => {
    vi.setSystemTime(new Date("2025-07-18T12:00:00Z"));

    // Forecast starts Aug 1, 2025, so the 6-month history window is Feb–Jul 2025.
    // Older months (e.g., Dec 2024, Jan 2025) should be ignored.
    mockTxs = [
      { type: "EXPENSE", account: defaultAccount, usdAmount: -1000, createdAt: "2024-12-01T00:00:00Z" },
      { type: "EXPENSE", account: defaultAccount, usdAmount: -900, createdAt: "2025-01-01T00:00:00Z" },
      { type: "EXPENSE", account: defaultAccount, usdAmount: -10, createdAt: "2025-02-01T00:00:00Z" },
      { type: "EXPENSE", account: defaultAccount, usdAmount: -20, createdAt: "2025-03-01T00:00:00Z" },
      { type: "EXPENSE", account: defaultAccount, usdAmount: -30, createdAt: "2025-04-01T00:00:00Z" },
      { type: "EXPENSE", account: defaultAccount, usdAmount: -40, createdAt: "2025-05-01T00:00:00Z" },
      { type: "EXPENSE", account: defaultAccount, usdAmount: -50, createdAt: "2025-06-01T00:00:00Z" },
      { type: "EXPENSE", account: defaultAccount, usdAmount: -60, createdAt: "2025-07-01T00:00:00Z" },
    ];

    const { reportsRouter } = await import("../src/handlers/reports.handler");
    const app = appFactory(reportsRouter);

    const res = await request(app)
      .get(
        "/api/reports/predicted-outflows?start_date=2025-07-15&end_date=2025-08-31",
      )
      .expect(200);

    const expectedBaselineDaily = (10 + 20 + 30 + 40 + 50 + 60) / 6;
    expect(res.body.baseline_daily_spend_usd).toBeCloseTo(expectedBaselineDaily, 6);
    expect(res.body.series[0].predicted_spend_usd).toBeCloseTo(expectedBaselineDaily, 6);
  });
});
