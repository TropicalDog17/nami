import XLSX from "xlsx";
import { createCorrelationLogger } from "../utils/logger.js";

export interface BankTransaction {
  date: string; // "29/11/2025"
  remitter: string; // Counterparty
  remitter_bank: string; // Bank name
  details: string; // Description
  transaction_no: string; // Reference ID
  debit: string; // "52,000" or ""
  credit: string; // "284" or ""
  balance: string; // "2,978,361"
}

/**
 * Statement type determines how debit/credit columns are interpreted:
 * - DEBIT_ACCOUNT (bank account): debit = expense, credit = income
 * - CREDIT_CARD: debit/charge = expense, credit/payment = payment to card (reduces balance)
 */
export type StatementType = "DEBIT_ACCOUNT" | "CREDIT_CARD";

export interface BankStatementConfig {
  bank: string;
  statementType: StatementType;
  headerRow: number;
  dataStartRow: number;
  columns: {
    date: number;
    remitter: number;
    remitterBank: number;
    details: number;
    transactionNo: number;
    debit: number;
    credit: number;
    balance: number;
  };
  skipPattern?: RegExp;
}

// Techcombank debit account configuration based on analyzed Excel file
export const TECHCOMBANK_DEBIT_CONFIG: BankStatementConfig = {
  bank: "techcombank",
  statementType: "DEBIT_ACCOUNT",
  headerRow: 33,
  dataStartRow: 35,
  columns: {
    date: 1,
    remitter: 7,
    remitterBank: 16,
    details: 24,
    transactionNo: 32,
    debit: 45,
    credit: 53,
    balance: 59,
  },
  skipPattern: /Số dư đầu kỳ|Phiếu này|Diễn giải|Description|Opening balance/i,
};

// Techcombank credit card configuration (placeholder - adjust columns when you have a sample file)
export const TECHCOMBANK_CREDIT_CONFIG: BankStatementConfig = {
  bank: "techcombank_credit",
  statementType: "CREDIT_CARD",
  headerRow: 33,
  dataStartRow: 35,
  columns: {
    date: 1,
    remitter: 7,
    remitterBank: 16,
    details: 24,
    transactionNo: 32,
    debit: 45, // Charges on credit card
    credit: 53, // Payments/refunds on credit card
    balance: 59,
  },
  skipPattern: /Số dư đầu kỳ|Phiếu này|Diễn giải|Description|Opening balance/i,
};

// Alias for backward compatibility
export const TECHCOMBANK_CONFIG = TECHCOMBANK_DEBIT_CONFIG;

/**
 * Parse an Excel bank statement file
 */
export function parseExcelBankStatement(
  filePath: string,
  config: BankStatementConfig,
  correlationId?: string,
): BankTransaction[] {
  const logger = createCorrelationLogger(correlationId);

  logger.info(
    { filePath, bank: config.bank },
    "Starting Excel bank statement parsing",
  );

  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Convert to array of arrays
  const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    raw: false,
  });

  logger.debug({ totalRows: rows.length, sheetName }, "Loaded worksheet");

  const transactions: BankTransaction[] = [];
  const skipPattern = config.skipPattern || /Số dư đầu kỳ|Phiếu này|Diễn giải/i;

  for (let i = config.dataStartRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const dateVal = row[config.columns.date];

    // Skip invalid rows
    if (!dateVal) continue;
    if (skipPattern.test(String(dateVal))) continue;

    // Check if it looks like a date (DD/MM/YYYY format)
    if (!/\d{1,2}\/\d{1,2}\/\d{4}/.test(String(dateVal))) continue;

    const transaction: BankTransaction = {
      date: String(row[config.columns.date] || "").trim(),
      remitter: String(row[config.columns.remitter] || "").trim(),
      remitter_bank: String(row[config.columns.remitterBank] || "").trim(),
      details: String(row[config.columns.details] || "").trim(),
      transaction_no: String(row[config.columns.transactionNo] || "").trim(),
      debit: String(row[config.columns.debit] || "").trim(),
      credit: String(row[config.columns.credit] || "").trim(),
      balance: String(row[config.columns.balance] || "").trim(),
    };

    // Must have either debit or credit
    if (!transaction.debit && !transaction.credit) continue;

    transactions.push(transaction);
  }

  logger.info(
    {
      transactionCount: transactions.length,
      filePath,
      bank: config.bank,
    },
    "Finished parsing Excel bank statement",
  );

  return transactions;
}

/**
 * Parse Vietnamese number format "52,000" -> 52000
 */
export function parseVNDAmount(amount: string): number {
  if (!amount || amount.trim() === "") return 0;
  return Number(amount.replace(/,/g, "")) || 0;
}

/**
 * Convert DD/MM/YYYY to YYYY-MM-DD
 */
export function convertDateFormat(ddmmyyyy: string): string {
  const parts = ddmmyyyy.split("/");
  if (parts.length !== 3) return ddmmyyyy;

  const [day, month, year] = parts;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/**
 * Transaction type after classification
 */
export type TransactionCategory = "INCOME" | "EXPENSE" | "CARD_PAYMENT";

/**
 * Get transaction type based on debit/credit fields and statement type
 *
 * For DEBIT_ACCOUNT (bank account):
 * - debit = money leaving account = EXPENSE
 * - credit = money entering account = INCOME
 *
 * For CREDIT_CARD:
 * - debit = charges/purchases = EXPENSE
 * - credit = payments to card or refunds = CARD_PAYMENT (not income)
 */
export function getTransactionType(
  transaction: BankTransaction,
  statementType: StatementType = "DEBIT_ACCOUNT",
): TransactionCategory {
  const hasDebit = transaction.debit && parseVNDAmount(transaction.debit) > 0;
  const hasCredit =
    transaction.credit && parseVNDAmount(transaction.credit) > 0;

  if (statementType === "DEBIT_ACCOUNT") {
    // Bank account: debit = expense, credit = income
    return hasDebit ? "EXPENSE" : "INCOME";
  } else {
    // Credit card: debit = expense, credit = payment to card
    return hasDebit ? "EXPENSE" : "CARD_PAYMENT";
  }
}

/**
 * Get amount from transaction
 */
export function getTransactionAmount(transaction: BankTransaction): number {
  const debitAmount = parseVNDAmount(transaction.debit);
  const creditAmount = parseVNDAmount(transaction.credit);
  return debitAmount > 0 ? debitAmount : creditAmount;
}

/**
 * Check if transaction should be recorded as an expense
 * Both DEBIT_ACCOUNT debits and CREDIT_CARD charges are expenses
 */
export function isExpense(
  transaction: BankTransaction,
  statementType: StatementType = "DEBIT_ACCOUNT",
): boolean {
  const type = getTransactionType(transaction, statementType);
  return type === "EXPENSE";
}

/**
 * Check if transaction represents income (only for DEBIT_ACCOUNT credits)
 */
export function isIncome(
  transaction: BankTransaction,
  statementType: StatementType = "DEBIT_ACCOUNT",
): boolean {
  const type = getTransactionType(transaction, statementType);
  return type === "INCOME";
}

/**
 * Check if transaction is a credit card payment (only for CREDIT_CARD credits)
 */
export function isCardPayment(
  transaction: BankTransaction,
  statementType: StatementType = "DEBIT_ACCOUNT",
): boolean {
  const type = getTransactionType(transaction, statementType);
  return type === "CARD_PAYMENT";
}
