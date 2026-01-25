import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

/**
 * Vault Handler Tests
 *
 * Tests for the vault API endpoints including:
 * - Creating vaults
 * - Listing vaults
 * - Getting vault details
 * - Depositing into vaults
 * - Withdrawing from vaults
 * - Deleting vaults
 */

type Asset = import("../src/types").Asset;
type Vault = import("../src/types").Vault;
type VaultEntry = import("../src/types").VaultEntry;

describe("Vault Handler", () => {
  let mockVaults: Vault[] = [];
  let mockEntries: VaultEntry[] = [];

  beforeEach(() => {
    vi.resetModules();
    mockVaults = [];
    mockEntries = [];

    // Mock the repositories index
    vi.doMock("../src/repositories", () => ({
      vaultRepository: {
        findByName: (name: string) => mockVaults.find((v) => v.name === name),
        findAll: () => mockVaults,
        create: (vault: Vault) => {
          mockVaults.push(vault);
          return vault;
        },
        update: (name: string, updates: Partial<Vault>) => {
          const idx = mockVaults.findIndex((v) => v.name === name);
          if (idx === -1) return undefined;
          mockVaults[idx] = { ...mockVaults[idx], ...updates };
          return mockVaults[idx];
        },
        delete: (name: string) => {
          const len = mockVaults.length;
          mockVaults = mockVaults.filter((v) => v.name !== name);
          mockEntries = mockEntries.filter((e) => e.vault !== name);
          return mockVaults.length < len;
        },
        findAllEntries: (vaultName: string) =>
          mockEntries
            .filter((e) => e.vault === vaultName)
            .sort((a, b) => String(a.at).localeCompare(String(b.at))),
        createEntry: (entry: VaultEntry) => {
          mockEntries.push(entry);
          return entry;
        },
      },
      transactionRepository: {
        create: vi.fn(),
      },
      settingsRepository: {
        getDefaultSpendingVaultName: () => "Spend",
      },
    }));

    // Mock the price service
    vi.doMock("../src/services/price.service", () => ({
      priceService: {
        getRateUSD: async (asset: Asset) => {
          const symbol = asset.symbol.toUpperCase();
          const rateUSD =
            symbol === "USD"
              ? 1
              : symbol === "BTC"
                ? 50000
                : symbol === "ETH"
                  ? 3000
                  : 1;
          return {
            asset,
            rateUSD,
            timestamp: new Date().toISOString(),
            source: "MOCK",
          };
        },
      },
    }));

    // Mock settings repository
    vi.doMock("../src/repositories/settings.repository", () => ({
      settingsRepository: {
        getDefaultSpendingVaultName: () => "Spend",
        getDefaultIncomeVaultName: () => "Income",
        getBorrowingSettings: () => ({ borrowingVaultName: "Borrowing" }),
      },
    }));

    // Mock transaction repository
    vi.doMock("../src/repositories/transaction.repository", () => ({
      transactionRepository: {
        findAll: () => [],
        create: (tx: any) => tx,
      },
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function createApp() {
    const { vaultsRouter } = await import("../src/handlers/vault.handler");
    const app = express();
    app.use(express.json());
    app.use("/api", vaultsRouter);
    return app;
  }

  describe("POST /vaults - Create vault", () => {
    it("should create a new vault", async () => {
      const app = await createApp();
      const res = await request(app)
        .post("/api/vaults")
        .send({ name: "TestVault" })
        .expect(201);

      expect(res.body.name).toBe("TestVault");
      expect(res.body.status).toBe("ACTIVE");
      expect(mockVaults).toHaveLength(1);
    });

    it("should return 200 if vault already exists", async () => {
      mockVaults.push({
        name: "ExistingVault",
        status: "ACTIVE",
        createdAt: "2025-01-01T00:00:00Z",
      });

      const app = await createApp();
      const res = await request(app)
        .post("/api/vaults")
        .send({ name: "ExistingVault" })
        .expect(200);

      expect(res.body.name).toBe("ExistingVault");
      expect(mockVaults).toHaveLength(1);
    });

    it("should return 400 if name is empty", async () => {
      const app = await createApp();
      const res = await request(app)
        .post("/api/vaults")
        .send({ name: "" })
        .expect(400);

      expect(res.body.error).toBe("name is required");
    });
  });

  describe("GET /vaults - List vaults", () => {
    it("should return empty array when no vaults exist", async () => {
      const app = await createApp();
      const res = await request(app).get("/api/vaults").expect(200);

      expect(res.body).toEqual([]);
    });

    it("should return all vaults", async () => {
      mockVaults = [
        { name: "Vault1", status: "ACTIVE", createdAt: "2025-01-01T00:00:00Z" },
        { name: "Vault2", status: "CLOSED", createdAt: "2025-01-02T00:00:00Z" },
      ];

      const app = await createApp();
      const res = await request(app).get("/api/vaults").expect(200);

      expect(res.body).toHaveLength(2);
    });

    it("should filter active vaults with is_open=true", async () => {
      mockVaults = [
        { name: "Active", status: "ACTIVE", createdAt: "2025-01-01T00:00:00Z" },
        { name: "Closed", status: "CLOSED", createdAt: "2025-01-02T00:00:00Z" },
      ];

      const app = await createApp();
      const res = await request(app)
        .get("/api/vaults?is_open=true")
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe("Active");
    });
  });

  describe("GET /vaults/:name - Get single vault", () => {
    it("should return vault details", async () => {
      mockVaults = [
        {
          name: "TestVault",
          status: "ACTIVE",
          createdAt: "2025-01-01T00:00:00Z",
        },
      ];
      mockEntries = [
        {
          vault: "TestVault",
          type: "DEPOSIT",
          asset: { type: "FIAT", symbol: "USD" },
          amount: 1000,
          usdValue: 1000,
          at: "2025-01-01T00:00:00Z",
        },
      ];

      const app = await createApp();
      const res = await request(app).get("/api/vaults/TestVault").expect(200);

      expect(res.body.vault_name).toBe("TestVault");
      expect(res.body.vault_status).toBe("active");
      expect(res.body.is_open).toBe(true);
    });

    it("should return 404 for non-existent vault", async () => {
      const app = await createApp();
      const res = await request(app).get("/api/vaults/NonExistent").expect(404);

      expect(res.body.error).toBe("not found");
    });
  });

  describe("POST /vaults/:name/deposit - Deposit into vault", () => {
    it("should create a USD deposit entry", async () => {
      const app = await createApp();
      const res = await request(app)
        .post("/api/vaults/TestVault/deposit")
        .send({ amount: 1000, asset: "USD" })
        .expect(201);

      expect(res.body.ok).toBe(true);
      expect(res.body.entry.type).toBe("DEPOSIT");
      expect(res.body.entry.usdValue).toBe(1000);
      expect(mockEntries).toHaveLength(1);
    });

    it("should create vault if it does not exist", async () => {
      const app = await createApp();
      await request(app)
        .post("/api/vaults/NewVault/deposit")
        .send({ amount: 500, asset: "USD" })
        .expect(201);

      expect(mockVaults.some((v) => v.name === "NewVault")).toBe(true);
    });

    it("should handle crypto deposits with quantity and cost", async () => {
      const app = await createApp();
      const res = await request(app)
        .post("/api/vaults/TestVault/deposit")
        .send({ quantity: 0.1, cost: 5000, asset: "BTC" })
        .expect(201);

      expect(res.body.entry.amount).toBe(0.1);
      expect(res.body.entry.usdValue).toBe(5000);
      expect(res.body.entry.asset.symbol).toBe("BTC");
    });
  });

  describe("POST /vaults/:name/withdraw - Withdraw from vault", () => {
    it("should create a withdrawal entry", async () => {
      mockVaults = [
        {
          name: "TestVault",
          status: "ACTIVE",
          createdAt: "2025-01-01T00:00:00Z",
        },
      ];

      const app = await createApp();
      const res = await request(app)
        .post("/api/vaults/TestVault/withdraw")
        .send({ amount: 500, asset: "USD" })
        .expect(201);

      expect(res.body.ok).toBe(true);
      expect(res.body.entry.type).toBe("WITHDRAW");
      expect(res.body.entry.usdValue).toBe(500);
    });

    it("should create a withdrawal entry and a deposit entry when target_account is provided", async () => {
      mockVaults = [
        {
          name: "SourceVault",
          status: "ACTIVE",
          createdAt: "2025-01-01T00:00:00Z",
        },
        {
          name: "DestVault",
          status: "ACTIVE",
          createdAt: "2025-01-01T00:00:00Z",
        },
      ];

      const app = await createApp();
      const res = await request(app)
        .post("/api/vaults/SourceVault/withdraw")
        .send({ amount: 250, asset: "USD", target_account: "DestVault" })
        .expect(201);

      expect(res.body.ok).toBe(true);
      expect(res.body.withdrawEntry.type).toBe("WITHDRAW");
      expect(res.body.withdrawEntry.vault).toBe("SourceVault");
      expect(res.body.withdrawEntry.account).toBe("DestVault");

      expect(res.body.depositEntry.type).toBe("DEPOSIT");
      expect(res.body.depositEntry.vault).toBe("DestVault");
      expect(res.body.depositEntry.account).toBe("SourceVault");

      expect(
        mockEntries.filter((e) => e.vault === "SourceVault" && e.type === "WITHDRAW")
          .length,
      ).toBe(1);
      expect(
        mockEntries.filter((e) => e.vault === "DestVault" && e.type === "DEPOSIT")
          .length,
      ).toBe(1);
    });
  });

  describe("DELETE /vaults/:name - Delete vault", () => {
    it("should delete an existing vault", async () => {
      mockVaults = [
        {
          name: "ToDelete",
          status: "ACTIVE",
          createdAt: "2025-01-01T00:00:00Z",
        },
      ];

      const app = await createApp();
      const res = await request(app).delete("/api/vaults/ToDelete").expect(200);

      expect(res.body.ok).toBe(true);
      expect(mockVaults).toHaveLength(0);
    });

    it("should return 404 for non-existent vault", async () => {
      const app = await createApp();
      const res = await request(app)
        .delete("/api/vaults/NonExistent")
        .expect(404);

      expect(res.body.error).toBe("not found");
    });
  });

  describe("POST /vaults/:name/end - End vault", () => {
    it("should mark vault as CLOSED", async () => {
      mockVaults = [
        { name: "ToEnd", status: "ACTIVE", createdAt: "2025-01-01T00:00:00Z" },
      ];

      const app = await createApp();
      const res = await request(app).post("/api/vaults/ToEnd/end").expect(200);

      expect(res.body.ok).toBe(true);
      expect(mockVaults[0].status).toBe("CLOSED");
    });

    it("should return 404 for non-existent vault", async () => {
      const app = await createApp();
      const res = await request(app)
        .post("/api/vaults/NonExistent/end")
        .expect(404);

      expect(res.body.error).toBe("not found");
    });
  });

  describe("GET /vaults/:name/transactions - List vault transactions", () => {
    it("should return vault entries", async () => {
      mockVaults = [
        {
          name: "TestVault",
          status: "ACTIVE",
          createdAt: "2025-01-01T00:00:00Z",
        },
      ];
      mockEntries = [
        {
          vault: "TestVault",
          type: "DEPOSIT",
          asset: { type: "FIAT", symbol: "USD" },
          amount: 1000,
          usdValue: 1000,
          at: "2025-01-01T00:00:00Z",
        },
        {
          vault: "TestVault",
          type: "WITHDRAW",
          asset: { type: "FIAT", symbol: "USD" },
          amount: 200,
          usdValue: 200,
          at: "2025-01-15T00:00:00Z",
        },
      ];

      const app = await createApp();
      const res = await request(app)
        .get("/api/vaults/TestVault/transactions")
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[0].type).toBe("DEPOSIT");
      expect(res.body[1].type).toBe("WITHDRAW");
    });

    it("should return 404 for non-existent vault", async () => {
      const app = await createApp();
      const res = await request(app)
        .get("/api/vaults/NonExistent/transactions")
        .expect(404);

      expect(res.body.error).toBe("not found");
    });
  });

  describe("Multi-Asset Vault Calculations", () => {
    it("should calculate USD and non-USD AUM separately without manual valuation", async () => {
      mockVaults = [
        {
          name: "MultiAssetVault",
          status: "ACTIVE",
          createdAt: "2025-01-01T00:00:00Z",
        },
      ];
      mockEntries = [
        {
          vault: "MultiAssetVault",
          type: "DEPOSIT",
          asset: { type: "FIAT", symbol: "USD" },
          amount: 1000,
          usdValue: 1000,
          at: "2025-01-01T00:00:00Z",
        },
        {
          vault: "MultiAssetVault",
          type: "DEPOSIT",
          asset: { type: "CRYPTO", symbol: "BTC" },
          amount: 0.1,
          usdValue: 5000,
          at: "2025-01-02T00:00:00Z",
        },
      ];

      const app = await createApp();
      const res = await request(app)
        .get("/api/vaults/MultiAssetVault")
        .expect(200);

      expect(res.body.remaining_qty).toBe("6000");
      expect(res.body.total_usd_manual).toBe(1000);
      expect(res.body.total_usd_market).toBe(5000);
    });

    it("should use manual valuation for USD and market prices for other assets", async () => {
      mockVaults = [
        {
          name: "ManualValVault",
          status: "ACTIVE",
          createdAt: "2025-01-01T00:00:00Z",
        },
      ];
      mockEntries = [
        {
          vault: "ManualValVault",
          type: "DEPOSIT",
          asset: { type: "FIAT", symbol: "USD" },
          amount: 1000,
          usdValue: 1000,
          at: "2025-01-01T00:00:00Z",
        },
        {
          vault: "ManualValVault",
          type: "DEPOSIT",
          asset: { type: "CRYPTO", symbol: "BTC" },
          amount: 0.1,
          usdValue: 5000,
          at: "2025-01-02T00:00:00Z",
        },
        {
          vault: "ManualValVault",
          type: "VALUATION",
          asset: { type: "FIAT", symbol: "USD" },
          amount: 0,
          usdValue: 1500,
          at: "2025-01-03T00:00:00Z",
          note: "Manual valuation update",
        },
      ];

      const app = await createApp();
      const res = await request(app)
        .get("/api/vaults/ManualValVault")
        .expect(200);

      expect(res.body.remaining_qty).toBe("6500");
      expect(res.body.total_usd_manual).toBe(1500);
      expect(res.body.total_usd_market).toBe(5000);
    });

    it("should handle deposits and withdrawals for mixed assets after manual valuation", async () => {
      mockVaults = [
        {
          name: "MixedVault",
          status: "ACTIVE",
          createdAt: "2025-01-01T00:00:00Z",
        },
      ];
      mockEntries = [
        {
          vault: "MixedVault",
          type: "DEPOSIT",
          asset: { type: "FIAT", symbol: "USD" },
          amount: 1000,
          usdValue: 1000,
          at: "2025-01-01T00:00:00Z",
        },
        {
          vault: "MixedVault",
          type: "DEPOSIT",
          asset: { type: "CRYPTO", symbol: "BTC" },
          amount: 0.1,
          usdValue: 5000,
          at: "2025-01-02T00:00:00Z",
        },
        {
          vault: "MixedVault",
          type: "VALUATION",
          asset: { type: "FIAT", symbol: "USD" },
          amount: 0,
          usdValue: 1200,
          at: "2025-01-03T00:00:00Z",
          note: "Manual valuation update",
        },
        {
          vault: "MixedVault",
          type: "WITHDRAW",
          asset: { type: "FIAT", symbol: "USD" },
          amount: 200,
          usdValue: 200,
          at: "2025-01-04T00:00:00Z",
        },
        {
          vault: "MixedVault",
          type: "DEPOSIT",
          asset: { type: "CRYPTO", symbol: "ETH" },
          amount: 1,
          usdValue: 3000,
          at: "2025-01-05T00:00:00Z",
        },
      ];

      const app = await createApp();
      const res = await request(app).get("/api/vaults/MixedVault").expect(200);

      expect(res.body.remaining_qty).toBe("9000");
      expect(res.body.total_usd_manual).toBe(1000);
      expect(res.body.total_usd_market).toBe(8000);
    });

    it("should show breakdown in enriched vault list", async () => {
      mockVaults = [
        {
          name: "EnrichedVault",
          status: "ACTIVE",
          createdAt: "2025-01-01T00:00:00Z",
        },
      ];
      mockEntries = [
        {
          vault: "EnrichedVault",
          type: "DEPOSIT",
          asset: { type: "FIAT", symbol: "USD" },
          amount: 1000,
          usdValue: 1000,
          at: "2025-01-01T00:00:00Z",
        },
        {
          vault: "EnrichedVault",
          type: "DEPOSIT",
          asset: { type: "CRYPTO", symbol: "BTC" },
          amount: 0.1,
          usdValue: 5000,
          at: "2025-01-02T00:00:00Z",
        },
      ];

      const app = await createApp();
      const res = await request(app).get("/api/vaults?enrich=true").expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].total_assets_under_management).toBe(6000);
      expect(res.body[0].total_usd_manual).toBe(1000);
      expect(res.body[0].total_usd_market).toBe(5000);
    });

    it("should show breakdown in holdings endpoint", async () => {
      mockVaults = [
        {
          name: "HoldingsVault",
          status: "ACTIVE",
          createdAt: "2025-01-01T00:00:00Z",
        },
      ];
      mockEntries = [
        {
          vault: "HoldingsVault",
          type: "DEPOSIT",
          asset: { type: "FIAT", symbol: "USD" },
          amount: 1000,
          usdValue: 1000,
          at: "2025-01-01T00:00:00Z",
        },
        {
          vault: "HoldingsVault",
          type: "DEPOSIT",
          asset: { type: "CRYPTO", symbol: "BTC" },
          amount: 0.1,
          usdValue: 5000,
          at: "2025-01-02T00:00:00Z",
        },
      ];

      const app = await createApp();
      const res = await request(app)
        .get("/api/vaults/HoldingsVault/holdings")
        .expect(200);

      expect(res.body.total_aum).toBe(6000);
      expect(res.body.total_usd_manual).toBe(1000);
      expect(res.body.total_usd_market).toBe(5000);
    });
  });
});
