import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";

type Asset = import("../src/types").Asset;
type VaultEntry = import("../src/types").VaultEntry;

describe("reports/series aggregate APR", () => {
  const vaultName = "TestVault";
  const USD: Asset = { type: "FIAT", symbol: "USD" };

  let mockEntries: VaultEntry[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    mockEntries = [];
    vi.resetModules();

    vi.doMock("../src/repositories", () => {
      return {
        vaultRepository: {
          findByName: (name: string) =>
            name === vaultName
              ? {
                  name: vaultName,
                  status: "ACTIVE",
                  createdAt: "2025-01-01T00:00:00Z",
                }
              : undefined,
          findAll: () => [
            {
              name: vaultName,
              status: "ACTIVE",
              createdAt: "2025-01-01T00:00:00Z",
            },
          ],
          findAllEntries: (name: string) =>
            name === vaultName ? mockEntries : [],
        },
      };
    });

    vi.doMock("../src/services/price.service", () => {
      return {
        priceService: {
          getRateUSD: async (asset: Asset) => {
            const symbol = asset.symbol.toUpperCase();
            const rateUSD =
              symbol === "USD" ? 1 : symbol === "VND" ? 1 / 26315 : 1;
            return {
              asset,
              rateUSD,
              timestamp: new Date().toISOString(),
              source: rateUSD === 1 ? "FIXED" : "FALLBACK",
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

  it("matches per-vault series APR when only one vault exists", async () => {
    vi.setSystemTime(new Date("2025-03-02T12:00:00Z"));

    mockEntries = [
      {
        vault: vaultName,
        type: "DEPOSIT",
        asset: USD,
        amount: 100,
        usdValue: 100,
        at: "2025-01-01T00:00:00Z",
      },
      {
        vault: vaultName,
        type: "DEPOSIT",
        asset: USD,
        amount: 100,
        usdValue: 100,
        at: "2025-02-01T00:00:00Z",
      },
    ];

    const { reportsRouter } = await import("../src/handlers/reports.handler");
    const app = appFactory(reportsRouter);

    const [vaultRes, aggRes] = await Promise.all([
      request(app)
        .get(
          `/api/reports/vaults/${vaultName}/series?start=2025-01-01&end=2025-03-02`,
        )
        .expect(200),
      request(app)
        .get(`/api/reports/series?start=2025-01-01&end=2025-03-02`)
        .expect(200),
    ]);

    const vaultSeries = vaultRes.body.series as Array<{
      date: string;
      apr_percent: number;
    }>;
    const aggSeries = aggRes.body.series as Array<{
      date: string;
      apr_percent: number;
    }>;

    expect(Array.isArray(vaultSeries)).toBe(true);
    expect(Array.isArray(aggSeries)).toBe(true);
    expect(vaultSeries.length).toBeGreaterThan(0);
    expect(aggSeries.length).toBeGreaterThan(0);

    const vaultLast = vaultSeries[vaultSeries.length - 1];
    const aggLast = aggSeries[aggSeries.length - 1];

    expect(vaultLast.date).toBe("2025-03-02");
    expect(aggLast.date).toBe("2025-03-02");
    expect(aggLast.apr_percent).toBeCloseTo(vaultLast.apr_percent, 6);
    expect(aggLast.apr_percent).toBeCloseTo(0, 6);
  });
});

