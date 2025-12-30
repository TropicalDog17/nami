import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  Asset,
  InitialRequest,
  InitialRequestSchema,
  IncomeExpenseRequest,
  IncomeExpenseSchema,
  BorrowLoanRequest,
  BorrowLoanSchema,
  RepayRequest,
  RepaySchema,
  Transaction,
} from "../types";
import { transactionService } from "../services/transaction.service";
import { vaultService } from "../services/vault.service";
import { vaultRepository } from "../repositories";
import { transactionRepository } from "../repositories";
import { priceService } from "../services/price.service";

export const transactionsRouter = Router();

transactionsRouter.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

transactionsRouter.post(
  "/transactions/initial",
  async (req: Request, res: Response) => {
    try {
      const body: InitialRequest = InitialRequestSchema.parse(req.body);
      const results = await transactionService.createInitialTransactions(
        body.items,
      );

      res.status(201).json({
        created: results.length,
        transactions: results,
      });
    } catch (e: any) {
      res.status(400).json({ error: e?.message || "Invalid request" });
    }
  },
);

transactionsRouter.post(
  "/transactions/income",
  async (req: Request, res: Response) => {
    try {
      const body: IncomeExpenseRequest = IncomeExpenseSchema.parse(req.body);
      const tx = await transactionService.createIncomeTransaction({
        asset: body.asset,
        amount: body.amount,
        at: body.at,
        account: body.account,
        note: body.note,
        category: body.category,
        tags: body.tags,
        counterparty: body.counterparty,
        dueDate: body.dueDate,
      });

      res.status(201).json(tx);
    } catch (e: any) {
      res.status(400).json({ error: e?.message || "Invalid request" });
    }
  },
);

transactionsRouter.post(
  "/transactions/expense",
  async (req: Request, res: Response) => {
    try {
      const body: IncomeExpenseRequest = IncomeExpenseSchema.parse(req.body);
      const tx = await transactionService.createExpenseTransaction({
        asset: body.asset,
        amount: body.amount,
        at: body.at,
        account: body.account,
        note: body.note,
        category: body.category,
        tags: body.tags,
        counterparty: body.counterparty,
        dueDate: body.dueDate,
      });

      res.status(201).json(tx);
    } catch (e: any) {
      res.status(400).json({ error: e?.message || "Invalid request" });
    }
  },
);

transactionsRouter.post(
  "/transactions/borrow",
  async (req: Request, res: Response) => {
    try {
      const body: BorrowLoanRequest = BorrowLoanSchema.parse(req.body);
      const tx = await transactionService.createBorrowTransaction({
        asset: body.asset,
        amount: body.amount,
        at: body.at,
        account: body.account,
        counterparty: body.counterparty,
        note: body.note,
      });

      res.status(201).json(tx);
    } catch (e: any) {
      res.status(400).json({ error: e?.message || "Invalid request" });
    }
  },
);

transactionsRouter.post(
  "/transactions/loan",
  async (req: Request, res: Response) => {
    try {
      const body: BorrowLoanRequest = BorrowLoanSchema.parse(req.body);
      const tx = await transactionService.createLoanTransaction({
        asset: body.asset,
        amount: body.amount,
        at: body.at,
        account: body.account,
        counterparty: body.counterparty,
        note: body.note,
      });

      res.status(201).json(tx);
    } catch (e: any) {
      res.status(400).json({ error: e?.message || "Invalid request" });
    }
  },
);

transactionsRouter.post(
  "/transactions/repay",
  async (req: Request, res: Response) => {
    try {
      const body: RepayRequest = RepaySchema.parse(req.body);
      const tx = await transactionService.createRepayTransaction({
        asset: body.asset,
        amount: body.amount,
        direction: body.direction,
        at: body.at,
        account: body.account,
        counterparty: body.counterparty,
        note: body.note,
      });

      res.status(201).json(tx);
    } catch (e: any) {
      res.status(400).json({ error: e?.message || "Invalid request" });
    }
  },
);

transactionsRouter.get("/report", async (_req: Request, res: Response) => {
  try {
    const report = await transactionService.generateReport();
    res.json(report);
  } catch (e: any) {
    res.status(500).json({
      error: e?.message || "Failed to generate report",
    });
  }
});

// List transactions
transactionsRouter.get("/transactions", (req: Request, res: Response) => {
  const investmentId = (
    req.query.investment_id as string | undefined
  )?.toString();

  if (investmentId) {
    const entries = vaultService.getVaultEntries(investmentId);
    const mapped = entries.map((e, idx) => {
      const isVal = e.type === "VALUATION";
      return {
        id: `${investmentId}-${e.at}-${e.type}-${idx}`,
        date: e.at,
        type:
          e.type === "DEPOSIT"
            ? "deposit"
            : e.type === "WITHDRAW"
              ? "withdraw"
              : "valuation",
        asset: isVal ? "USD" : e.asset.symbol,
        account: e.account ?? investmentId,
        quantity: isVal
          ? e.usdValue
          : e.asset.symbol === "USD"
            ? e.usdValue
            : e.amount,
        amount_usd: e.usdValue,
        amount_vnd: undefined,
        counterparty: investmentId,
        note: e.note,
        investment_id: investmentId,
      };
    });
    return res.json(mapped);
  }

  const transactions = transactionService.getAllTransactions();
  if (!transactions || transactions.length === 0) {
    // Vault-only fallback
    const vaults = vaultService.listVaults();
    const rows: any[] = [];
    for (const v of vaults) {
      const entries = vaultService.getVaultEntries(v.name);
      entries.forEach((e, idx) => {
        rows.push({
          id: `${v.name}-${e.at}-${e.type}-${idx}`,
          date: e.at,
          type: e.type === "DEPOSIT" ? "deposit" : "withdraw",
          asset: e.asset.symbol,
          account: e.account ?? v.name,
          quantity: e.asset.symbol === "USD" ? e.usdValue : e.amount,
          amount_usd: e.usdValue,
          amount_vnd: undefined,
          counterparty: v.name,
          note: e.note,
          investment_id: v.name,
        });
      });
    }
    rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return res.json(rows);
  }

  res.json(transactions);
});

// Delete transaction
transactionsRouter.delete(
  "/transactions/:id",
  (req: Request, res: Response) => {
    const id = req.params.id;
    const existing = transactionService.getTransactionById(id);

    if (!existing) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    const ok = transactionService.deleteTransaction(id);
    if (!ok) return res.status(500).json({ error: "Failed to delete" });

    return res.status(204).send();
  },
);

// Unified create endpoint
transactionsRouter.post(
  "/transactions",
  async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const type = String(body.type || "").toLowerCase();
      const at = String(body.date || body.at || "") || undefined;

      if (type === "deposit" || type === "withdraw") {
        const symbol = String(body.asset || "USD").toUpperCase();
        const qty = Number(body.quantity || body.amount || 0);
        const at = String(body.date || body.at || "") || undefined;
        const account = body.account
          ? String(body.account)
          : vaultService.getDefaultSpendingVaultName();

        if (!symbol || !(qty > 0)) {
          return res.status(400).json({ error: "Invalid payload" });
        }

        const asset: Asset = {
          type: symbol === "USD" || symbol.length === 3 ? "FIAT" : "CRYPTO",
          symbol,
        };
        const rate = await priceService.getRateUSD(asset, at);
        const common = {
          asset,
          amount: qty,
          createdAt: at ?? new Date().toISOString(),
          rate,
          usdAmount: qty * rate.rateUSD,
          account,
        };

        if (type === "deposit") {
          const tx: Transaction = {
            id: uuidv4(),
            type: "EXPENSE",
            note: body.note ?? "deposit",
            ...common,
          } as Transaction;
          transactionRepository.create(tx);
          return res.status(201).json({ ok: true, transactions: [tx] });
        } else {
          const tx: Transaction = {
            id: uuidv4(),
            type: "INCOME",
            note: body.note ?? "withdraw",
            ...common,
          } as Transaction;
          transactionRepository.create(tx);
          return res.status(201).json({ ok: true, transactions: [tx] });
        }
      }

      if (type === "income" || type === "expense") {
        const symbol = String(
          body.asset || body.base_asset || "USD",
        ).toUpperCase();
        const qty = Number(body.quantity || body.amount || 0);
        const account = body.account ? String(body.account) : undefined;

        if (!symbol || !(qty > 0)) {
          return res.status(400).json({ error: "Invalid payload" });
        }

        const asset: Asset = {
          type: symbol === "USD" || symbol.length === 3 ? "FIAT" : "CRYPTO",
          symbol,
        };

        const tx =
          type.toUpperCase() === "INCOME"
            ? await transactionService.createIncomeTransaction({
                asset,
                amount: qty,
                at,
                account,
                note: body.note,
                category: body.category ?? body.tag,
                tags: body.tags,
                counterparty: body.counterparty,
                dueDate: body.dueDate,
              })
            : await transactionService.createExpenseTransaction({
                asset,
                amount: qty,
                at,
                account,
                note: body.note,
                category: body.category ?? body.tag,
                tags: body.tags,
                counterparty: body.counterparty,
                dueDate: body.dueDate,
              });

        return res.status(201).json({ ok: true, transactions: [tx] });
      }

      if (type === "sell") {
        const symbol = String(
          body.asset || body.base_asset || "",
        ).toUpperCase();
        const qty = Number(body.quantity || body.qty || 0);
        const unitPriceUSD = Number(
          body.price_local || body.unit_price_usd || 0,
        );

        if (!symbol || !(qty > 0) || !(unitPriceUSD > 0)) {
          return res.status(400).json({ error: "Invalid sell payload" });
        }

        const asset: Asset = {
          type: symbol === "USD" || symbol.length === 3 ? "FIAT" : "CRYPTO",
          symbol,
        };
        const usd: Asset = { type: "FIAT", symbol: "USD" };

        const baseRate = await priceService.getRateUSD(asset, at);
        const usdRate = await priceService.getRateUSD(usd, at);

        const expenseTx: Transaction = {
          id: uuidv4(),
          type: "EXPENSE",
          note: `spot_sell ${qty} ${symbol} @ ${unitPriceUSD} USD`,
          asset,
          amount: qty,
          createdAt: at ?? new Date().toISOString(),
          rate: baseRate,
          usdAmount: qty * baseRate.rateUSD,
        } as Transaction;

        const incomeTx: Transaction = {
          id: uuidv4(),
          type: "INCOME",
          note: `spot_sell proceeds ${qty * unitPriceUSD} USD`,
          asset: usd,
          amount: qty * unitPriceUSD,
          createdAt: at ?? new Date().toISOString(),
          rate: usdRate,
          usdAmount: qty * unitPriceUSD * usdRate.rateUSD,
        } as Transaction;

        transactionRepository.create(expenseTx);
        transactionRepository.create(incomeTx);

        return res.status(201).json({
          ok: true,
          created: 2,
          transactions: [expenseTx, incomeTx],
        });
      }

      if (type === "buy") {
        const symbol = String(
          body.asset || body.base_asset || "",
        ).toUpperCase();
        const qty = Number(body.quantity || body.qty || 0);
        const unitPriceUSD = Number(
          body.price_local || body.unit_price_usd || 0,
        );

        if (!symbol || !(qty > 0) || !(unitPriceUSD > 0)) {
          return res.status(400).json({ error: "Invalid buy payload" });
        }

        const asset: Asset = {
          type: symbol === "USD" || symbol.length === 3 ? "FIAT" : "CRYPTO",
          symbol,
        };
        const usd: Asset = { type: "FIAT", symbol: "USD" };

        const baseRate = await priceService.getRateUSD(asset, at);
        const usdRate = await priceService.getRateUSD(usd, at);

        const incomeTx: Transaction = {
          id: uuidv4(),
          type: "INCOME",
          note: `spot_buy ${qty} ${symbol} @ ${unitPriceUSD} USD`,
          asset,
          amount: qty,
          createdAt: at ?? new Date().toISOString(),
          rate: baseRate,
          usdAmount: qty * baseRate.rateUSD,
        } as Transaction;

        const expenseTx: Transaction = {
          id: uuidv4(),
          type: "EXPENSE",
          note: `spot_buy cost ${qty * unitPriceUSD} USD`,
          asset: usd,
          amount: qty * unitPriceUSD,
          createdAt: at ?? new Date().toISOString(),
          rate: usdRate,
          usdAmount: qty * unitPriceUSD * usdRate.rateUSD,
        } as Transaction;

        transactionRepository.create(incomeTx);
        transactionRepository.create(expenseTx);

        return res.status(201).json({
          ok: true,
          created: 2,
          transactions: [incomeTx, expenseTx],
        });
      }

      return res.status(400).json({
        error:
          "Unsupported transaction type. Use income/expense, deposit/withdraw, buy/sell or specific endpoints.",
      });
    } catch (e: any) {
      res.status(400).json({
        error: e?.message || "Invalid transaction request",
      });
    }
  },
);
