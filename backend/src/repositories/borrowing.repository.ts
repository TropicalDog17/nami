import { BorrowingAgreement } from "../types";
import { readStore, writeStore } from "./base.repository";
import { IBorrowingRepository } from "./repository.interface";
import {
  BaseDbRepository,
  rowToBorrowing,
  borrowingToRow,
} from "./base-db.repository";

// JSON-based implementation
export class BorrowingRepositoryJson implements IBorrowingRepository {
  findAll(): BorrowingAgreement[] {
    return readStore().borrowings;
  }

  findById(id: string): BorrowingAgreement | undefined {
    return readStore().borrowings.find((b) => b.id === id);
  }

  findByStatus(status: string): BorrowingAgreement[] {
    return readStore().borrowings.filter((b) => b.status === status);
  }

  create(borrowing: BorrowingAgreement): BorrowingAgreement {
    const store = readStore();
    store.borrowings.push(borrowing);
    writeStore(store);
    return borrowing;
  }

  update(
    id: string,
    updates: Partial<BorrowingAgreement>,
  ): BorrowingAgreement | undefined {
    const store = readStore();
    const index = store.borrowings.findIndex((b) => b.id === id);
    if (index === -1) return undefined;
    store.borrowings[index] = { ...store.borrowings[index], ...updates };
    writeStore(store);
    return store.borrowings[index];
  }

  delete(id: string): boolean {
    const store = readStore();
    const initialLength = store.borrowings.length;
    store.borrowings = store.borrowings.filter((b) => b.id !== id);
    writeStore(store);
    return store.borrowings.length < initialLength;
  }
}

// Database-based implementation
export class BorrowingRepositoryDb
  extends BaseDbRepository
  implements IBorrowingRepository
{
  findAll(): BorrowingAgreement[] {
    return this.findMany(
      "SELECT * FROM borrowings ORDER BY created_at DESC",
      [],
      rowToBorrowing,
    );
  }

  findById(id: string): BorrowingAgreement | undefined {
    return this.findOne(
      "SELECT * FROM borrowings WHERE id = ?",
      [id],
      rowToBorrowing,
    );
  }

  findByStatus(status: string): BorrowingAgreement[] {
    return this.findMany(
      "SELECT * FROM borrowings WHERE status = ? ORDER BY created_at DESC",
      [status],
      rowToBorrowing,
    );
  }

  create(borrowing: BorrowingAgreement): BorrowingAgreement {
    const row = borrowingToRow(borrowing);
    this.execute(
      `INSERT INTO borrowings (
        id, counterparty, asset_type, asset_symbol, principal, monthly_payment,
        start_at, first_due_at, next_payment_at, outstanding, note, account,
        status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.counterparty,
        row.asset_type,
        row.asset_symbol,
        row.principal,
        row.monthly_payment,
        row.start_at,
        row.first_due_at,
        row.next_payment_at,
        row.outstanding,
        row.note,
        row.account,
        row.status,
        row.created_at,
      ],
    );
    return borrowing;
  }

  update(
    id: string,
    updates: Partial<BorrowingAgreement>,
  ): BorrowingAgreement | undefined {
    const fields: string[] = [];
    const values: any[] = [];

    const updateFields: (keyof BorrowingAgreement)[] = [
      "counterparty",
      "principal",
      "monthlyPayment",
      "startAt",
      "firstDueAt",
      "nextPaymentAt",
      "outstanding",
      "note",
      "account",
      "status",
    ];

    for (const field of updateFields) {
      if (field in updates) {
        const dbField =
          field === "monthlyPayment"
            ? "monthly_payment"
            : field === "startAt"
              ? "start_at"
              : field === "firstDueAt"
                ? "first_due_at"
                : field === "nextPaymentAt"
                  ? "next_payment_at"
                  : field;
        fields.push(`${dbField} = ?`);
        values.push((updates as any)[field]);
      }
    }

    if (fields.length === 0) return this.findById(id);

    values.push(id);
    this.execute(
      `UPDATE borrowings SET ${fields.join(", ")} WHERE id = ?`,
      values,
    );
    return this.findById(id);
  }

  delete(id: string): boolean {
    const result = this.execute("DELETE FROM borrowings WHERE id = ?", [id]);
    return result.changes > 0;
  }
}
