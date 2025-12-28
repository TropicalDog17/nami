import { LoanAgreement } from "../types";
import { readStore, writeStore } from "./base.repository";

export class LoanRepository {
  findAll(): LoanAgreement[] {
    return readStore().loans;
  }

  findById(id: string): LoanAgreement | undefined {
    return readStore().loans.find(l => l.id === id);
  }

  findByCounterparty(counterparty: string): LoanAgreement[] {
    return readStore().loans.filter(l => l.counterparty === counterparty);
  }

  findByStatus(status: string): LoanAgreement[] {
    return readStore().loans.filter(l => l.status === status);
  }

  create(loan: LoanAgreement): LoanAgreement {
    const store = readStore();
    store.loans.push(loan);
    writeStore(store);
    return loan;
  }

  update(id: string, updates: Partial<LoanAgreement>): LoanAgreement | undefined {
    const store = readStore();
    const index = store.loans.findIndex(l => l.id === id);
    if (index === -1) return undefined;

    store.loans[index] = { ...store.loans[index], ...updates };
    writeStore(store);
    return store.loans[index];
  }

  delete(id: string): boolean {
    const store = readStore();
    const initialLength = store.loans.length;
    store.loans = store.loans.filter(l => l.id !== id);
    writeStore(store);
    return store.loans.length < initialLength;
  }
}

export const loanRepository = new LoanRepository();
