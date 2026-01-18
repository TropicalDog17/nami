import { getConnection } from "../database/connection";
import {
  Transaction,
  Vault,
  VaultEntry,
  LoanAgreement,
  BorrowingAgreement,
} from "../types";
import { coerceNumber } from "../utils/number.util";

// Helper to convert SQLite row to Transaction
export function rowToTransaction(row: any): Transaction {
  const tx: any = {
    id: row.id,
    type: row.type,
    asset: {
      type: row.asset_type,
      symbol: row.asset_symbol,
    },
    amount: row.amount,
    createdAt: row.created_at,
    account: row.account,
    note: row.note,
    category: row.category,
    tags: row.tags ? JSON.parse(row.tags) : undefined,
    counterparty: row.counterparty,
    dueDate: row.due_date,
    transferId: row.transfer_id,
    loanId: row.loan_id,
    sourceRef: row.source_ref,
    rate: JSON.parse(row.rate),
    usdAmount: row.usd_amount,
  };

  if (row.repay_direction) {
    tx.direction = row.repay_direction;
  }

  return tx as Transaction;
}

// Helper to convert Transaction to SQLite row
export function transactionToRow(tx: Transaction): any {
  const row: any = {
    id: tx.id,
    type: tx.type,
    asset_type: tx.asset.type,
    asset_symbol: tx.asset.symbol,
    amount: tx.amount,
    created_at: tx.createdAt,
    account: tx.account,
    note: tx.note,
    category: tx.category,
    tags: tx.tags ? JSON.stringify(tx.tags) : null,
    counterparty: tx.counterparty,
    due_date: tx.dueDate,
    transfer_id: tx.transferId,
    loan_id: tx.loanId,
    source_ref: tx.sourceRef,
    rate: JSON.stringify(tx.rate),
    usd_amount: tx.usdAmount,
  };

  if ((tx as any).direction) {
    row.repay_direction = (tx as any).direction;
  }

  return row;
}

// Helper to convert SQLite row to Vault
export function rowToVault(row: any): Vault {
  return {
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
  };
}

// Helper to convert Vault to SQLite row
export function vaultToRow(vault: Vault): any {
  return {
    name: vault.name,
    status: vault.status,
    created_at: vault.createdAt,
  };
}

// Helper to convert SQLite row to VaultEntry
export function rowToVaultEntry(row: any): VaultEntry {
  return {
    vault: row.vault,
    type: row.type,
    asset: {
      type: row.asset_type,
      symbol: row.asset_symbol,
    },
    amount: coerceNumber(row.amount),
    usdValue: coerceNumber(row.usd_value),
    at: row.at,
    account: row.account,
    note: row.note,
  };
}

// Helper to convert VaultEntry to SQLite row
export function vaultEntryToRow(entry: VaultEntry): any {
  return {
    vault: entry.vault,
    type: entry.type,
    asset_type: entry.asset.type,
    asset_symbol: entry.asset.symbol,
    amount: coerceNumber(entry.amount),
    usd_value: coerceNumber(entry.usdValue),
    at: entry.at,
    account: entry.account,
    note: entry.note,
  };
}

// Helper to convert SQLite row to LoanAgreement
export function rowToLoan(row: any): LoanAgreement {
  return {
    id: row.id,
    counterparty: row.counterparty,
    asset: {
      type: row.asset_type,
      symbol: row.asset_symbol,
    },
    principal: row.principal,
    interestRate: row.interest_rate,
    period: row.period,
    startAt: row.start_at,
    maturityAt: row.maturity_at,
    note: row.note,
    account: row.account,
    status: row.status,
    createdAt: row.created_at,
  };
}

// Helper to convert LoanAgreement to SQLite row
export function loanToRow(loan: LoanAgreement): any {
  return {
    id: loan.id,
    counterparty: loan.counterparty,
    asset_type: loan.asset.type,
    asset_symbol: loan.asset.symbol,
    principal: loan.principal,
    interest_rate: loan.interestRate,
    period: loan.period,
    start_at: loan.startAt,
    maturity_at: loan.maturityAt,
    note: loan.note,
    account: loan.account,
    status: loan.status,
    created_at: loan.createdAt,
  };
}

// Helper to convert SQLite row to BorrowingAgreement
export function rowToBorrowing(row: any): BorrowingAgreement {
  return {
    id: row.id,
    counterparty: row.counterparty,
    asset: {
      type: row.asset_type,
      symbol: row.asset_symbol,
    },
    principal: coerceNumber(row.principal),
    monthlyPayment: coerceNumber(row.monthly_payment),
    startAt: row.start_at,
    firstDueAt: row.first_due_at,
    nextPaymentAt: row.next_payment_at,
    outstanding: coerceNumber(row.outstanding),
    note: row.note,
    account: row.account,
    status: row.status,
    createdAt: row.created_at,
  };
}

// Helper to convert BorrowingAgreement to SQLite row
export function borrowingToRow(borrowing: BorrowingAgreement): any {
  return {
    id: borrowing.id,
    counterparty: borrowing.counterparty,
    asset_type: borrowing.asset.type,
    asset_symbol: borrowing.asset.symbol,
    principal: coerceNumber(borrowing.principal),
    monthly_payment: coerceNumber(borrowing.monthlyPayment),
    start_at: borrowing.startAt,
    first_due_at: borrowing.firstDueAt,
    next_payment_at: borrowing.nextPaymentAt,
    outstanding: coerceNumber(borrowing.outstanding),
    note: borrowing.note,
    account: borrowing.account,
    status: borrowing.status,
    created_at: borrowing.createdAt,
  };
}

// Base class for database repositories
export class BaseDbRepository {
  protected db = getConnection();

  protected findMany(
    sql: string,
    params: any[] = [],
    rowMapper: (row: any) => any,
  ): any[] {
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params);
    return rows.map(rowMapper);
  }

  protected findOne(
    sql: string,
    params: any[] = [],
    rowMapper: (row: any) => any,
  ): any | undefined {
    const stmt = this.db.prepare(sql);
    const row = stmt.get(...params);
    return row ? rowMapper(row) : undefined;
  }

  protected execute(
    sql: string,
    params: any[],
  ): { changes: number; lastInsertRowid: number } {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);
    return {
      changes: result.changes,
      lastInsertRowid:
        typeof result.lastInsertRowid === "bigint"
          ? Number(result.lastInsertRowid)
          : result.lastInsertRowid,
    };
  }
}
