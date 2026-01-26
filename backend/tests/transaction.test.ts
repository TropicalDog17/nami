import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

/**
 * Transaction Handler Tests
 *
 * Tests for the transaction API endpoints including:
 * - Creating income transactions
 * - Creating expense transactions
 * - Listing transactions
 * - Deleting transactions
 * - Unified transaction endpoint (buy/sell)
 */

type Asset = import("../src/types").Asset;
type Transaction = import("../src/types").Transaction;
type Vault = import("../src/types").Vault;
type VaultEntry = import("../src/types").VaultEntry;

// Create mock functions at module level for vi.mock hoisting
const mockGetVaultEntries = vi.fn();
const mockListVaults = vi.fn(() => []);
const mockEnsureVault = vi.fn();
const mockAddVaultEntry = vi.fn();
const mockGetVault = vi.fn();

// Mock vault service module
vi.mock("../src/services/vault.service", () => ({
  vaultService: {
    ensureVault: mockEnsureVault,
    addVaultEntry: mockAddVaultEntry,
    getVault: mockGetVault,
    getVaultEntries: mockGetVaultEntries,
    listVaults: mockListVaults,
  },
}));

describe("Transaction Handler", () => {
  let mockTransactions: Transaction[] = [];
  let mockVaults: Vault[] = [];
  let mockEntries: VaultEntry[] = [];

  beforeEach(() => {
    vi.resetModules();
    mockTransactions = [];
    mockVaults = [];
    mockEntries = [];

    // Update the mock implementation to return current mockEntries
    mockGetVaultEntries.mockImplementation((vaultName: string) =>
      mockEntries.filter((e) => e.vault === vaultName),
    );
    mockListVaults.mockReturnValue(mockVaults);

    // Mock all repositories from index
    vi.doMock("../src/repositories", () => ({
      transactionRepository: {
        findAll: () => mockTransactions,
        findById: (id: string) => mockTransactions.find((t) => t.id === id),
        create: (tx: Transaction) => {
          mockTransactions.push(tx);
          return tx;
        },
        delete: (id: string) => {
          const idx = mockTransactions.findIndex((t) => t.id === id);
          if (idx === -1) return false;
          mockTransactions.splice(idx, 1);
          return true;
        },
      },
      vaultRepository: {
        findByName: (name: string) => mockVaults.find((v) => v.name === name),
        findAll: () => mockVaults,
        create: (vault: Vault) => {
          mockVaults.push(vault);
          return vault;
        },
        findAllEntries: (vaultName: string) =>
          mockEntries.filter((e) => e.vault === vaultName),
        createEntry: (entry: VaultEntry) => {
          mockEntries.push(entry);
          return entry;
        },
      },
      settingsRepository: {
        getDefaultSpendingVaultName: () => "Spend",
        getDefaultIncomeVaultName: () => "Income",
        getBorrowingSettings: () => ({ borrowingVaultName: "Borrowing" }),
        get: (key: string) => {
          if (key === "defaultSpendingVaultName") return "Spend";
          if (key === "defaultIncomeVaultName") return "Income";
          return undefined;
        },
        set: vi.fn(),
      },
    }));

    // Mock price service
    vi.doMock("../src/services/price.service", () => ({
      priceService: {
        getRateUSD: async (asset: Asset) => {
          const symbol = asset.symbol.toUpperCase();
          let rateUSD = 1;
          if (symbol === "BTC") rateUSD = 50000;
          else if (symbol === "ETH") rateUSD = 3000;
          else if (symbol === "VND") rateUSD = 1 / 24000;
          return {
            asset,
            rateUSD,
            timestamp: new Date().toISOString(),
            source: "MOCK",
          };
        },
      },
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function createApp() {
    const { transactionsRouter } =
      await import("../src/handlers/transaction.handler");
    const app = express();
    app.use(express.json());
    app.use("/api", transactionsRouter);
    return app;
  }

  describe("GET /health", () => {
    it("should return ok", async () => {
      const app = await createApp();
      const res = await request(app).get("/api/health").expect(200);
      expect(res.body).toEqual({ ok: true });
    });
  });

  describe("POST /transactions/income - Create income transaction", () => {
    it("should create an income transaction", async () => {
      const app = await createApp();
      const res = await request(app)
        .post("/api/transactions/income")
        .send({
          asset: { type: "FIAT", symbol: "USD" },
          amount: 1000,
          note: "Salary",
          category: "salary",
        })
        .expect(201);

      expect(res.body.type).toBe("INCOME");
      expect(res.body.amount).toBe(1000);
      expect(res.body.note).toBe("Salary");
      expect(mockTransactions).toHaveLength(1);
    });

    it("should reject invalid request", async () => {
      const app = await createApp();
      const res = await request(app)
        .post("/api/transactions/income")
        .send({
          // Missing required fields
          note: "Invalid",
        })
        .expect(400);

      expect(res.body).toHaveProperty("error");
    });
  });

  describe("POST /transactions/expense - Create expense transaction", () => {
    it("should create an expense transaction", async () => {
      const app = await createApp();
      const res = await request(app)
        .post("/api/transactions/expense")
        .send({
          asset: { type: "FIAT", symbol: "USD" },
          amount: 50,
          note: "Groceries",
          category: "food",
          account: "Spend", // Explicitly set account to 'Spend' to pass validation
        })
        .expect(201);

      expect(res.body.type).toBe("EXPENSE");
      expect(res.body.amount).toBe(50);
      expect(mockTransactions).toHaveLength(1);
    });
  });

  describe("GET /transactions - List transactions", () => {
    it("should return empty array when no transactions exist", async () => {
      const app = await createApp();
      const res = await request(app).get("/api/transactions").expect(200);
      expect(res.body).toEqual([]);
    });

    it("should return all transactions", async () => {
      mockTransactions = [
        {
          id: "1",
          type: "INCOME",
          asset: { type: "FIAT", symbol: "USD" },
          amount: 1000,
          createdAt: "2025-01-01T00:00:00Z",
          usdAmount: 1000,
        } as Transaction,
        {
          id: "2",
          type: "EXPENSE",
          asset: { type: "FIAT", symbol: "USD" },
          amount: 50,
          createdAt: "2025-01-02T00:00:00Z",
          usdAmount: 50,
        } as Transaction,
      ];

      const app = await createApp();
      const res = await request(app).get("/api/transactions").expect(200);
      expect(res.body).toHaveLength(2);
    });

    it("should filter by investment_id (vault)", async () => {
      mockVaults = [
        { name: "TestVault", status: "ACTIVE", createdAt: "2025-01-01" },
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
      const res = await request(app)
        .get("/api/transactions?investment_id=TestVault")
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].type).toBe("deposit");
      expect(res.body[0].investment_id).toBe("TestVault");
    });
  });

  describe("DELETE /transactions/:id - Delete transaction", () => {
    it("should delete an existing transaction", async () => {
      mockTransactions = [
        {
          id: "tx-1",
          type: "INCOME",
          asset: { type: "FIAT", symbol: "USD" },
          amount: 100,
          createdAt: "2025-01-01T00:00:00Z",
          usdAmount: 100,
        } as Transaction,
      ];

      const app = await createApp();
      await request(app).delete("/api/transactions/tx-1").expect(204);
      expect(mockTransactions).toHaveLength(0);
    });

    it("should return 404 for non-existent transaction", async () => {
      const app = await createApp();
      const res = await request(app)
        .delete("/api/transactions/non-existent")
        .expect(404);
      expect(res.body.error).toBe("Transaction not found");
    });
  });

  describe("POST /transactions - Unified endpoint", () => {
    it("should create income transaction via unified endpoint", async () => {
      const app = await createApp();
      const res = await request(app)
        .post("/api/transactions")
        .send({
          type: "income",
          asset: "USD",
          quantity: 500,
          note: "Freelance work",
        })
        .expect(201);

      expect(res.body.ok).toBe(true);
      expect(res.body.transactions[0].type).toBe("INCOME");
    });

    it("should create expense transaction via unified endpoint", async () => {
      const app = await createApp();
      const res = await request(app)
        .post("/api/transactions")
        .send({
          type: "expense",
          asset: "USD",
          quantity: 100,
          note: "Dinner",
          category: "food",
          account: "Spend", // Explicitly set account to 'Spend' to pass validation
        })
        .expect(201);

      expect(res.body.ok).toBe(true);
      expect(res.body.transactions[0].type).toBe("EXPENSE");
    });

    it("should create buy transaction (two transactions)", async () => {
      const app = await createApp();
      const res = await request(app)
        .post("/api/transactions")
        .send({
          type: "buy",
          asset: "BTC",
          quantity: 0.1,
          price_local: 50000,
        })
        .expect(201);

      expect(res.body.ok).toBe(true);
      expect(res.body.created).toBe(2);
      expect(res.body.transactions).toHaveLength(2);
      // First is INCOME (receiving BTC), second is EXPENSE (spending USD)
      expect(res.body.transactions[0].type).toBe("INCOME");
      expect(res.body.transactions[1].type).toBe("EXPENSE");
    });

    it("should create sell transaction (two transactions)", async () => {
      const app = await createApp();
      const res = await request(app)
        .post("/api/transactions")
        .send({
          type: "sell",
          asset: "BTC",
          quantity: 0.1,
          price_local: 55000,
        })
        .expect(201);

      expect(res.body.ok).toBe(true);
      expect(res.body.created).toBe(2);
      // First is EXPENSE (spending BTC), second is INCOME (receiving USD)
      expect(res.body.transactions[0].type).toBe("EXPENSE");
      expect(res.body.transactions[1].type).toBe("INCOME");
    });

    it("should reject unsupported transaction type", async () => {
      const app = await createApp();
      const res = await request(app)
        .post("/api/transactions")
        .send({
          type: "unknown",
          asset: "USD",
          quantity: 100,
        })
        .expect(400);

      expect(res.body.error).toContain("Unsupported transaction type");
    });

    it("should reject buy without valid quantity", async () => {
      const app = await createApp();
      const res = await request(app)
        .post("/api/transactions")
        .send({
          type: "buy",
          asset: "BTC",
          quantity: 0,
          price_local: 50000,
        })
        .expect(400);

      expect(res.body.error).toBe("Invalid buy payload");
    });
  });

  describe("POST /transactions/borrow - Create borrow transaction", () => {
    it("should create a borrow transaction", async () => {
      const app = await createApp();
      const res = await request(app)
        .post("/api/transactions/borrow")
        .send({
          asset: { type: "FIAT", symbol: "USD" },
          amount: 5000,
          counterparty: "Bank",
          note: "Personal loan",
        })
        .expect(201);

      expect(res.body.type).toBe("BORROW");
      expect(res.body.amount).toBe(5000);
    });
  });

  describe("POST /transactions/loan - Create loan transaction", () => {
    it("should create a loan transaction", async () => {
      const app = await createApp();
      const res = await request(app)
        .post("/api/transactions/loan")
        .send({
          asset: { type: "FIAT", symbol: "USD" },
          amount: 1000,
          counterparty: "Friend",
          note: "Lent to friend",
        })
        .expect(201);

      expect(res.body.type).toBe("LOAN");
      expect(res.body.amount).toBe(1000);
    });
  });
});

/**
 * Transaction Service Tests
 *
 * Tests for transaction service validation including:
 * - Description validation (note or counterparty required)
 */
describe("TransactionService - Description Validation", () => {
  let transactionService: any;
  let mockTransactions: Transaction[] = [];

  beforeEach(async () => {
    vi.resetModules();
    mockTransactions = [];

    // Mock repositories
    vi.doMock("../src/repositories", () => ({
      transactionRepository: {
        findAll: () => mockTransactions,
        create: (tx: Transaction) => {
          mockTransactions.push(tx);
          return tx;
        },
      },
      settingsRepository: {
        getDefaultSpendingVaultName: () => "Spend",
        getDefaultIncomeVaultName: () => "Income",
      },
    }));

    // Mock vault service
    vi.doMock("../src/services/vault.service", () => ({
      vaultService: {
        ensureVault: vi.fn(),
        addVaultEntry: vi.fn(),
      },
    }));

    // Mock price service
    vi.doMock("../src/services/price.service", () => ({
      priceService: {
        getRateUSD: async () => ({
          symbol: "VND",
          rateUSD: 0.00004,
          timestamp: new Date().toISOString(),
        }),
      },
    }));

    // Import service after mocks are set up
    const serviceModule = await import("../src/services/transaction.service");
    transactionService = serviceModule.transactionService;
  });

  describe("createExpenseTransaction", () => {
    it("should throw error when creating expense without description", async () => {
      const params = {
        asset: { type: "FIAT" as const, symbol: "VND" },
        amount: 100000,
        category: "food", // Only category, no note/counterparty
      };

      await expect(
        transactionService.createExpenseTransaction(params),
      ).rejects.toThrow("must have either");
    });

    it("should create expense with note", async () => {
      const params = {
        asset: { type: "FIAT" as const, symbol: "VND" },
        amount: 100000,
        note: "Coffee",
      };

      const tx = await transactionService.createExpenseTransaction(params);

      expect(tx.id).toBeDefined();
      expect(tx.note).toBe("Coffee");
      expect(tx.type).toBe("EXPENSE");
    });

    it("should create expense with counterparty", async () => {
      const params = {
        asset: { type: "FIAT" as const, symbol: "VND" },
        amount: 100000,
        counterparty: "Starbucks",
      };

      const tx = await transactionService.createExpenseTransaction(params);

      expect(tx.id).toBeDefined();
      expect(tx.counterparty).toBe("Starbucks");
      expect(tx.type).toBe("EXPENSE");
    });

    it("should create expense with both note and counterparty", async () => {
      const params = {
        asset: { type: "FIAT" as const, symbol: "VND" },
        amount: 100000,
        note: "Morning coffee",
        counterparty: "Starbucks",
        category: "food",
      };

      const tx = await transactionService.createExpenseTransaction(params);

      expect(tx.id).toBeDefined();
      expect(tx.note).toBe("Morning coffee");
      expect(tx.counterparty).toBe("Starbucks");
    });

    it("should throw error with whitespace-only note", async () => {
      const params = {
        asset: { type: "FIAT" as const, symbol: "VND" },
        amount: 100000,
        note: "   ", // Whitespace only
      };

      await expect(
        transactionService.createExpenseTransaction(params),
      ).rejects.toThrow("must have either");
    });
  });

  describe("createIncomeTransaction", () => {
    it("should throw error when creating income without description", async () => {
      const params = {
        asset: { type: "FIAT" as const, symbol: "VND" },
        amount: 500000,
        category: "salary", // Only category
      };

      await expect(
        transactionService.createIncomeTransaction(params),
      ).rejects.toThrow("must have either");
    });

    it("should create income with note", async () => {
      const params = {
        asset: { type: "FIAT" as const, symbol: "VND" },
        amount: 500000,
        note: "Monthly salary",
      };

      const tx = await transactionService.createIncomeTransaction(params);

      expect(tx.id).toBeDefined();
      expect(tx.note).toBe("Monthly salary");
      expect(tx.type).toBe("INCOME");
    });

    it("should create income with counterparty", async () => {
      const params = {
        asset: { type: "FIAT" as const, symbol: "VND" },
        amount: 500000,
        counterparty: "Acme Corp",
      };

      const tx = await transactionService.createIncomeTransaction(params);

      expect(tx.id).toBeDefined();
      expect(tx.counterparty).toBe("Acme Corp");
      expect(tx.type).toBe("INCOME");
    });
  });
});
