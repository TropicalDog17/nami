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
}

export const transactionRepository = new TransactionRepository();
