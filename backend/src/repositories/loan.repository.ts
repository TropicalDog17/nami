import { LoanAgreement } from "../types";
import { readStore, writeStore } from "./base.repository";
import { ILoanRepository } from "./repository.interface";
import { BaseDbRepository, rowToLoan, loanToRow } from "./base-db.repository";

// JSON-based implementation
export class LoanRepositoryJson implements ILoanRepository {
  findAll(): LoanAgreement[] {
    return readStore().loans;
  }

  findById(id: string): LoanAgreement | undefined {
    return readStore().loans.find((l) => l.id === id);
  }

  findByCounterparty(counterparty: string): LoanAgreement[] {
    return readStore().loans.filter((l) => l.counterparty === counterparty);
  }

  findByStatus(status: string): LoanAgreement[] {
    return readStore().loans.filter((l) => l.status === status);
  }

  create(loan: LoanAgreement): LoanAgreement {
    const store = readStore();
    store.loans.push(loan);
    writeStore(store);
    return loan;
  }

  update(
    id: string,
    updates: Partial<LoanAgreement>,
  ): LoanAgreement | undefined {
    const store = readStore();
    const index = store.loans.findIndex((l) => l.id === id);
    if (index === -1) return undefined;

    store.loans[index] = { ...store.loans[index], ...updates };
    writeStore(store);
    return store.loans[index];
  }

  delete(id: string): boolean {
    const store = readStore();
    const initialLength = store.loans.length;
    store.loans = store.loans.filter((l) => l.id !== id);
    writeStore(store);
    return store.loans.length < initialLength;
  }
}

// Database-based implementation
export class LoanRepositoryDb
  extends BaseDbRepository
  implements ILoanRepository
{
  findAll(): LoanAgreement[] {
    return this.findMany(
      "SELECT * FROM loans ORDER BY created_at DESC",
      [],
      rowToLoan,
    );
  }

  findById(id: string): LoanAgreement | undefined {
    return this.findOne("SELECT * FROM loans WHERE id = ?", [id], rowToLoan);
  }

  findByCounterparty(counterparty: string): LoanAgreement[] {
    return this.findMany(
      "SELECT * FROM loans WHERE counterparty = ? ORDER BY created_at DESC",
      [counterparty],
      rowToLoan,
    );
  }

  findByStatus(status: string): LoanAgreement[] {
    return this.findMany(
      "SELECT * FROM loans WHERE status = ? ORDER BY created_at DESC",
      [status],
      rowToLoan,
    );
  }

  create(loan: LoanAgreement): LoanAgreement {
    const row = loanToRow(loan);
    this.execute(
      `INSERT INTO loans (
        id, counterparty, asset_type, asset_symbol, principal, interest_rate,
        period, start_at, maturity_at, note, account, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.counterparty,
        row.asset_type,
        row.asset_symbol,
        row.principal,
        row.interest_rate,
        row.period,
        row.start_at,
        row.maturity_at,
        row.note,
        row.account,
        row.status,
        row.created_at,
      ],
    );
    return loan;
  }

  update(
    id: string,
    updates: Partial<LoanAgreement>,
  ): LoanAgreement | undefined {
    const fields: string[] = [];
    const values: any[] = [];

    const updateFields: (keyof LoanAgreement)[] = [
      "counterparty",
      "principal",
      "interestRate",
      "period",
      "startAt",
      "maturityAt",
      "note",
      "account",
      "status",
    ];

    for (const field of updateFields) {
      if (field in updates) {
        const dbField =
          field === "interestRate"
            ? "interest_rate"
            : field === "startAt"
              ? "start_at"
              : field === "maturityAt"
                ? "maturity_at"
                : field;
        fields.push(`${dbField} = ?`);
        values.push(updates[field]);
      }
    }

    if (fields.length === 0) return this.findById(id);

    values.push(id);
    this.execute(`UPDATE loans SET ${fields.join(", ")} WHERE id = ?`, values);
    return this.findById(id);
  }

  delete(id: string): boolean {
    const result = this.execute("DELETE FROM loans WHERE id = ?", [id]);
    return result.changes > 0;
  }
}
