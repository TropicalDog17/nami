import { Transaction } from "../types";
import { readStore, writeStore } from "./base.repository";

export class TransactionRepository {
  findAll(): Transaction[] {
    return readStore().transactions;
  }

  findById(id: string): Transaction | undefined {
    return readStore().transactions.find(t => t.id === id);
  }

  findByLoanId(loanId: string): Transaction[] {
    return readStore().transactions.filter(t => t.loanId === loanId);
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
    store.transactions = store.transactions.filter(t => t.id !== id);
    writeStore(store);
    return store.transactions.length < initialLength;
  }

  findByAccount(account: string): Transaction[] {
    return readStore().transactions.filter(t => t.account === account);
  }

  findByType(type: string): Transaction[] {
    return readStore().transactions.filter(t => t.type === type);
  }

  findByDateRange(startDate: string, endDate: string): Transaction[] {
    return readStore().transactions.filter(
      t => t.createdAt >= startDate && t.createdAt <= endDate
    );
  }

  findBySourceRef(sourceRef: string): Transaction | undefined {
    return readStore().transactions.find(t => t.sourceRef === sourceRef);
  }

  /**
   * Find existing transaction for deduplication.
   * Matches by source_ref (highest priority), then date+amount+type combination.
   * Returns undefined if no duplicate found.
   */
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
    const dateStr = date.startsWith('T') ? date.split('T')[0] : date;
    const candidates = readStore().transactions.filter(t => {
      const txDate = t.createdAt.startsWith('T') ? t.createdAt.split('T')[0] : t.createdAt;
      return txDate === dateStr &&
             Math.abs(t.amount - amount) < 0.01 &&
             t.type === type &&
             (!account || t.account === account);
    });

    // If exact match found, return it
    if (candidates.length > 0) {
      return candidates[0];
    }

    return undefined;
  }
}

export const transactionRepository = new TransactionRepository();
