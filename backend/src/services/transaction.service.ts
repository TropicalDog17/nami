import { v4 as uuidv4 } from "uuid";
import {
  Asset,
  Transaction,
  PortfolioReport,
  PortfolioReportItem,
  assetKey,
} from "../types";
import { transactionRepository } from "../repositories";
import { vaultRepository } from "../repositories";
import { settingsRepository } from "../repositories";
import { priceService } from "./price.service";

export interface TransactionBase {
  asset: Asset;
  amount: number;
  createdAt: string;
  account: string;
  rate: any;
  usdAmount: number;
}

export class TransactionService {
  async buildTransactionBase(
    asset: Asset,
    amount: number,
    at?: string,
    account?: string,
    transactionType?: string,
  ): Promise<TransactionBase> {
    const rate = await priceService.getRateUSD(asset, at);
    const acc =
      account && String(account).trim().length
        ? String(account).trim()
        : settingsRepository.getDefaultSpendingVaultName();

    // WARNING: Expenses should come from Spend vault
    if (transactionType === "EXPENSE" && acc.toLowerCase() !== "spend") {
      console.error(
        `[MIGRATION] Creating expense with non-Spend account (${acc}). After migration, this will be enforced.`,
      );
      // TODO: After migration complete, throw error instead of warning
      throw new Error("All expenses must be from Spend vault");
    }

    return {
      asset,
      amount,
      createdAt: at ?? new Date().toISOString(),
      account: acc,
      rate,
      usdAmount: amount * rate.rateUSD,
    };
  }

  async createInitialTransactions(
    items: Array<{
      asset: Asset;
      amount: number;
      at?: string;
      account?: string;
      note?: string;
    }>,
  ): Promise<Transaction[]> {
    const results: Transaction[] = [];

    for (const item of items) {
      const base = await this.buildTransactionBase(
        item.asset,
        item.amount,
        item.at,
        item.account,
      );

      const tx: Transaction = {
        id: uuidv4(),
        type: "INITIAL",
        note: item.note,
        ...base,
      } as Transaction;

      transactionRepository.create(tx);
      results.push(tx);
    }

    return results;
  }

  async createIncomeTransaction(params: {
    asset: Asset;
    amount: number;
    at?: string;
    account?: string;
    note?: string;
    category?: string;
    tags?: string[];
    counterparty?: string;
    dueDate?: string;
    sourceRef?: string;
  }): Promise<Transaction> {
    const base = await this.buildTransactionBase(
      params.asset,
      params.amount,
      params.at,
      params.account,
      "INCOME",
    );

    const tx: Transaction = {
      id: uuidv4(),
      type: "INCOME",
      note: params.note,
      category: params.category,
      tags: params.tags,
      counterparty: params.counterparty,
      dueDate: params.dueDate,
      sourceRef: params.sourceRef,
      ...base,
    } as Transaction;

    transactionRepository.create(tx);
    return tx;
  }

  async createExpenseTransaction(params: {
    asset: Asset;
    amount: number;
    at?: string;
    account?: string;
    note?: string;
    category?: string;
    tags?: string[];
    counterparty?: string;
    dueDate?: string;
    sourceRef?: string;
  }): Promise<Transaction> {
    const base = await this.buildTransactionBase(
      params.asset,
      params.amount,
      params.at,
      params.account,
      "EXPENSE",
    );

    const tx: Transaction = {
      id: uuidv4(),
      type: "EXPENSE",
      note: params.note,
      category: params.category,
      tags: params.tags,
      counterparty: params.counterparty,
      dueDate: params.dueDate,
      sourceRef: params.sourceRef,
      ...(params.category ? { tag: params.category } : ({} as any)),
      ...base,
    } as Transaction;

    transactionRepository.create(tx);

    // Auto-create vault WITHDRAW entry for Spend vault
    const isSpendVault = base.account.toLowerCase() === "spend";
    if (isSpendVault) {
      const { vaultService } = require("./vault.service");

      // Ensure Spend vault exists
      vaultService.ensureVault("Spend");

      // Create WITHDRAW entry
      const vaultEntry = {
        vault: "Spend",
        type: "WITHDRAW" as const,
        asset: params.asset,
        amount: params.amount,
        usdValue: tx.usdAmount,
        at: base.createdAt,
        account: base.account,
        note: params.note ? `Expense: ${params.note}` : "Expense",
      };

      vaultService.addVaultEntry(vaultEntry);
    }

    return tx;
  }

  async createBorrowTransaction(params: {
    asset: Asset;
    amount: number;
    at?: string;
    account?: string;
    counterparty?: string;
    note?: string;
  }): Promise<Transaction> {
    const base = await this.buildTransactionBase(
      params.asset,
      params.amount,
      params.at,
      params.account,
    );

    const tx: Transaction = {
      id: uuidv4(),
      type: "BORROW",
      counterparty: params.counterparty,
      note: params.note,
      ...base,
    } as Transaction;

    transactionRepository.create(tx);
    return tx;
  }

  async createLoanTransaction(params: {
    asset: Asset;
    amount: number;
    at?: string;
    account?: string;
    counterparty?: string;
    note?: string;
  }): Promise<Transaction> {
    const base = await this.buildTransactionBase(
      params.asset,
      params.amount,
      params.at,
      params.account,
    );

    const tx: Transaction = {
      id: uuidv4(),
      type: "LOAN",
      counterparty: params.counterparty,
      note: params.note,
      ...base,
    } as Transaction;

    transactionRepository.create(tx);
    return tx;
  }

  async createRepayTransaction(params: {
    asset: Asset;
    amount: number;
    direction: string;
    at?: string;
    account?: string;
    counterparty?: string;
    note?: string;
  }): Promise<Transaction> {
    const base = await this.buildTransactionBase(
      params.asset,
      params.amount,
      params.at,
      params.account,
    );

    const tx: Transaction = {
      id: uuidv4(),
      type: "REPAY",
      direction: params.direction,
      counterparty: params.counterparty,
      note: params.note,
      ...base,
    } as Transaction;

    transactionRepository.create(tx);
    return tx;
  }

  getAllTransactions(): Transaction[] {
    return transactionRepository.findAll();
  }

  getTransactionById(id: string): Transaction | undefined {
    return transactionRepository.findById(id);
  }

  deleteTransaction(id: string): boolean {
    return transactionRepository.delete(id);
  }

  // Generate portfolio report
  async generateReport(): Promise<PortfolioReport> {
    const vaultEntries = vaultRepository.findAll();
    const balances = new Map<
      string,
      { asset: Asset; account?: string; units: number }
    >();

    // Get all vault entries across all vaults
    for (const vault of vaultEntries) {
      const entries = vaultRepository.findAllEntries(vault.name);
      for (const e of entries) {
        const account = e.vault;
        const k = `${assetKey(e.asset)}|${account}`;
        const cur = balances.get(k) || { asset: e.asset, account, units: 0 };
        cur.units += e.type === "DEPOSIT" ? e.amount : -e.amount;
        balances.set(k, cur);
      }
    }

    const holdings: PortfolioReportItem[] = [];
    for (const v of balances.values()) {
      if (Math.abs(v.units) > 1e-12) {
        holdings.push({
          asset: v.asset,
          account: v.account,
          balance: v.units,
          rateUSD: 0,
          valueUSD: 0,
        });
      }
    }

    for (const h of holdings) {
      const rate = await priceService.getRateUSD(h.asset);
      h.rateUSD = rate.rateUSD;
      h.valueUSD = h.balance * rate.rateUSD;
    }

    const holdingsUSD = holdings.reduce((s, i) => s + i.valueUSD, 0);

    return {
      holdings,
      liabilities: [],
      receivables: [],
      totals: {
        holdingsUSD,
        liabilitiesUSD: 0,
        receivablesUSD: 0,
        netWorthUSD: holdingsUSD,
      },
    };
  }
}

export const transactionService = new TransactionService();
