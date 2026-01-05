import { Transaction } from "../types";
import { readStore, writeStore } from "./base.repository";
import { ITransactionRepository } from "./repository.interface";
import {
  BaseDbRepository,
  rowToTransaction,
  transactionToRow,
} from "./base-db.repository";

// JSON-based implementation
export class TransactionRepositoryJson implements ITransactionRepository {
  findAll(): Transaction[] {
    return readStore().transactions.sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
    );
  }

  findById(id: string): Transaction | undefined {
    return readStore().transactions.find((t) => t.id === id);
  }

  findByLoanId(loanId: string): Transaction[] {
    return readStore().transactions.filter((t) => t.loanId === loanId);
  }

  create(transaction: Transaction): Transaction {
    const store = readStore();
    store.transactions.push(transaction);
    writeStore(store);
    return transaction;
  }

  delete(id: string): boolean {
    const store = readStore();
    const initialLength = store.transactions.length;
    store.transactions = store.transactions.filter((t) => t.id !== id);
    writeStore(store);
    return store.transactions.length < initialLength;
  }

  findByAccount(account: string): Transaction[] {
    return readStore().transactions.filter((t) => t.account === account);
  }

  findByType(type: string): Transaction[] {
    return readStore().transactions.filter((t) => t.type === type);
  }

  findByDateRange(startDate: string, endDate: string): Transaction[] {
    return readStore().transactions.filter(
      (t) => t.createdAt >= startDate && t.createdAt <= endDate,
    );
  }

  findBySourceRef(sourceRef: string): Transaction | undefined {
    return readStore().transactions.find((t) => t.sourceRef === sourceRef);
  }

  findExisting(params: {
    sourceRef?: string;
    date: string;
    amount: number;
    type: string;
    account?: string;
  }): Transaction | undefined {
    const { sourceRef, date, amount, type, account } = params;

    // First try: exact match by sourceRef (most reliable)
    if (sourceRef) {
      const byRef = this.findBySourceRef(sourceRef);
      if (byRef) {
        return byRef;
      }
    }

    // Second try: match by date, amount, type, and optional account
    const dateStr = date.startsWith("T") ? date.split("T")[0] : date;
    const candidates = readStore().transactions.filter((t) => {
      const txDate = t.createdAt.startsWith("T")
        ? t.createdAt.split("T")[0]
        : t.createdAt;
      return (
        txDate === dateStr &&
        Math.abs(t.amount - amount) < 0.01 &&
        t.type === type &&
        (!account || t.account === account)
      );
    });

    // If exact match found, return it
    if (candidates.length > 0) {
      return candidates[0];
    }

    return undefined;
  }
}

// Database-based implementation
export class TransactionRepositoryDb
  extends BaseDbRepository
  implements ITransactionRepository
{
  findAll(): Transaction[] {
    return this.findMany(
      "SELECT * FROM transactions ORDER BY created_at DESC",
      [],
      rowToTransaction,
    );
  }

  findById(id: string): Transaction | undefined {
    return this.findOne(
      "SELECT * FROM transactions WHERE id = ?",
      [id],
      rowToTransaction,
    );
  }

  findByLoanId(loanId: string): Transaction[] {
    return this.findMany(
      "SELECT * FROM transactions WHERE loan_id = ? ORDER BY created_at DESC",
      [loanId],
      rowToTransaction,
    );
  }

  create(transaction: Transaction): Transaction {
    const row = transactionToRow(transaction);
    this.execute(
      `INSERT INTO transactions (
        id, type, asset_type, asset_symbol, amount, created_at, account,
        note, category, tags, counterparty, due_date, transfer_id,
        loan_id, source_ref, repay_direction, rate, usd_amount
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.type,
        row.asset_type,
        row.asset_symbol,
        row.amount,
        row.created_at,
        row.account,
        row.note,
        row.category,
        row.tags,
        row.counterparty,
        row.due_date,
        row.transfer_id,
        row.loan_id,
        row.source_ref,
        row.repay_direction,
        row.rate,
        row.usd_amount,
      ],
    );
    return transaction;
  }

  delete(id: string): boolean {
    const result = this.execute("DELETE FROM transactions WHERE id = ?", [id]);
    return result.changes > 0;
  }

  findByAccount(account: string): Transaction[] {
    return this.findMany(
      "SELECT * FROM transactions WHERE account = ? ORDER BY created_at DESC",
      [account],
      rowToTransaction,
    );
  }

  findByType(type: string): Transaction[] {
    return this.findMany(
      "SELECT * FROM transactions WHERE type = ? ORDER BY created_at DESC",
      [type],
      rowToTransaction,
    );
  }

  findByDateRange(startDate: string, endDate: string): Transaction[] {
    return this.findMany(
      `SELECT * FROM transactions
       WHERE created_at >= ? AND created_at <= ?
       ORDER BY created_at DESC`,
      [startDate, endDate],
      rowToTransaction,
    );
  }

  findBySourceRef(sourceRef: string): Transaction | undefined {
    return this.findOne(
      "SELECT * FROM transactions WHERE source_ref = ?",
      [sourceRef],
      rowToTransaction,
    );
  }

  findExisting(params: {
    sourceRef?: string;
    date: string;
    amount: number;
    type: string;
    account?: string;
  }): Transaction | undefined {
    const { sourceRef, date, amount, type, account } = params;

    // First try: exact match by sourceRef (most reliable)
    if (sourceRef) {
      return this.findBySourceRef(sourceRef);
    }

    // Second try: match by date, amount, type, and optional account
    const dateStr = date.startsWith("T") ? date.split("T")[0] : date;
    const startDate = `${dateStr}T00:00:00Z`;
    const endDate = `${dateStr}T23:59:59Z`;

    const sql = account
      ? `SELECT * FROM transactions
         WHERE created_at >= ? AND created_at <= ?
         AND type = ? AND account = ?
         ORDER BY created_at DESC LIMIT 1`
      : `SELECT * FROM transactions
         WHERE created_at >= ? AND created_at <= ?
         AND type = ?
         ORDER BY created_at DESC LIMIT 1`;

    const candidates = this.findMany(
      sql,
      account
        ? [startDate, endDate, type, account]
        : [startDate, endDate, type],
      rowToTransaction,
    );

    // Filter by amount in memory (close match)
    return candidates.find((t) => Math.abs(t.amount - amount) < 0.01);
  }
}
