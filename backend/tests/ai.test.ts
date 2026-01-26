import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import crypto from "crypto";

/**
 * AI Handler Tests
 *
 * Tests for AI service endpoints including:
 * - Expense VND endpoint validation
 * - Income VND endpoint validation
 * - Credit Expense VND endpoint validation
 * - Description validation (note or counterparty required)
 */

type Transaction = import("../src/types").Transaction;
type Vault = import("../src/types").Vault;

describe("AI Handler - Description Validation", () => {
  let app: express.Application;
  let mockTransactions: Transaction[] = [];
  let signingSecret: string;

  beforeEach(async () => {
    vi.resetModules();
    mockTransactions = [];
    signingSecret = "test-secret-key";

    // Set environment variable for signature validation
    process.env.BACKEND_SIGNING_SECRET = signingSecret;

    // Mock repositories
    vi.doMock("../src/repositories", () => ({
      transactionRepository: {
        findAll: () => mockTransactions,
        findById: (id: string) => mockTransactions.find((t) => t.id === id),
        create: (tx: Transaction) => {
          mockTransactions.push(tx);
          return tx;
        },
        findExisting: () => undefined, // No duplicates by default
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

    // Import handler after mocks are set up
    const { aiRouter } = await import("../src/handlers/ai.handler");
    app = express();
    app.use(express.json());
    app.use("/api", aiRouter);
  });

  // Helper function to generate valid signature
  function generateSignature(body: any): string {
    const bodyString = JSON.stringify(body);
    return crypto
      .createHmac("sha256", signingSecret)
      .update(bodyString)
      .digest("hex");
  }

  describe("POST /api/ai/expense-vnd", () => {
    it("should reject expense without note or counterparty", async () => {
      const body = {
        vnd_amount: 100000,
        date: "2025-01-26",
        tag: "food", // Only tag, no description
      };

      const response = await request(app)
        .post("/api/ai/expense-vnd")
        .set("x-ai-signature", generateSignature(body))
        .send(body);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("counterparty");
      expect(response.body.error).toContain("note");
    });

    it("should accept expense with note only", async () => {
      const body = {
        vnd_amount: 100000,
        date: "2025-01-26",
        note: "Coffee at Starbucks",
      };

      const response = await request(app)
        .post("/api/ai/expense-vnd")
        .set("x-ai-signature", generateSignature(body))
        .send(body);

      expect(response.status).toBe(201);
      expect(response.body.ok).toBe(true);
      expect(response.body.transaction_id).toBeDefined();
    });

    it("should accept expense with counterparty only", async () => {
      const body = {
        vnd_amount: 100000,
        date: "2025-01-26",
        counterparty: "Starbucks",
        tag: "food",
      };

      const response = await request(app)
        .post("/api/ai/expense-vnd")
        .set("x-ai-signature", generateSignature(body))
        .send(body);

      expect(response.status).toBe(201);
      expect(response.body.ok).toBe(true);
      expect(response.body.transaction_id).toBeDefined();
    });

    it("should accept expense with both note and counterparty", async () => {
      const body = {
        vnd_amount: 100000,
        date: "2025-01-26",
        note: "Morning coffee",
        counterparty: "Starbucks",
        tag: "food",
      };

      const response = await request(app)
        .post("/api/ai/expense-vnd")
        .set("x-ai-signature", generateSignature(body))
        .send(body);

      expect(response.status).toBe(201);
      expect(response.body.ok).toBe(true);
      expect(response.body.transaction_id).toBeDefined();
    });

    it("should reject expense with empty strings", async () => {
      const body = {
        vnd_amount: 100000,
        date: "2025-01-26",
        note: "   ", // Whitespace only
        counterparty: "",
      };

      const response = await request(app)
        .post("/api/ai/expense-vnd")
        .set("x-ai-signature", generateSignature(body))
        .send(body);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("counterparty");
    });
  });

  describe("POST /api/ai/income-vnd", () => {
    it("should reject income without note or counterparty", async () => {
      const body = {
        vnd_amount: 500000,
        date: "2025-01-26",
        tag: "salary", // Only tag
      };

      const response = await request(app)
        .post("/api/ai/income-vnd")
        .set("x-ai-signature", generateSignature(body))
        .send(body);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("counterparty");
      expect(response.body.error).toContain("note");
    });

    it("should accept income with note", async () => {
      const body = {
        vnd_amount: 500000,
        date: "2025-01-26",
        note: "Monthly salary",
      };

      const response = await request(app)
        .post("/api/ai/income-vnd")
        .set("x-ai-signature", generateSignature(body))
        .send(body);

      expect(response.status).toBe(201);
      expect(response.body.ok).toBe(true);
    });

    it("should accept income with counterparty", async () => {
      const body = {
        vnd_amount: 500000,
        date: "2025-01-26",
        counterparty: "Acme Corp",
        tag: "salary",
      };

      const response = await request(app)
        .post("/api/ai/income-vnd")
        .set("x-ai-signature", generateSignature(body))
        .send(body);

      expect(response.status).toBe(201);
      expect(response.body.ok).toBe(true);
    });
  });

  describe("POST /api/ai/credit-expense-vnd", () => {
    it("should reject credit expense without note or counterparty", async () => {
      const body = {
        vnd_amount: 200000,
        date: "2025-01-26",
        tag: "shopping",
      };

      const response = await request(app)
        .post("/api/ai/credit-expense-vnd")
        .set("x-ai-signature", generateSignature(body))
        .send(body);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("counterparty");
      expect(response.body.error).toContain("note");
    });

    it("should accept credit expense with note", async () => {
      const body = {
        vnd_amount: 200000,
        date: "2025-01-26",
        note: "Online shopping",
      };

      const response = await request(app)
        .post("/api/ai/credit-expense-vnd")
        .set("x-ai-signature", generateSignature(body))
        .send(body);

      expect(response.status).toBe(201);
      expect(response.body.ok).toBe(true);
    });
  });
});
