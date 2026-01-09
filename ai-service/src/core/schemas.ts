import { z } from "zod";

// Common params schema for all transaction actions
// All fields that might be needed are included as optional
export const TransactionParamsSchema = z.object({
  account: z.string().min(0), // Allow empty string for backend vault default assignment
  vnd_amount: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Optional string fields – allow nulls from LLM output as well as omission
  counterparty: z.string().nullable().optional(),
  tag: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  // Additional field for card payments
  from_account: z.string().nullable().optional(),
});

// Alias for backward compatibility
export const SpendParamsSchema = TransactionParamsSchema;
export const IncomeParamsSchema = TransactionParamsSchema;
export const CardPaymentParamsSchema = TransactionParamsSchema;

export const ActionRequestSchema = z.object({
  action: z.enum([
    "spend_vnd", // Expense from debit account
    "credit_spend_vnd", // Expense on credit card
    "income_vnd", // Income to debit account
    "card_payment_vnd", // Payment to credit card
  ]),
  params: TransactionParamsSchema,
});

export type TransactionParams = z.infer<typeof TransactionParamsSchema>;
export type SpendParams = TransactionParams;
export type IncomeParams = TransactionParams;
export type CardPaymentParams = TransactionParams;
export type ActionRequest = z.infer<typeof ActionRequestSchema>;

export type PendingSource =
  | "telegram_text"
  | "telegram_image"
  | "bank_statement_excel";

export interface PendingActionCreate {
  source: PendingSource;
  raw_input: string;
  toon_text?: string;
  action_json?: ActionRequest;
  confidence?: number;
  batch_id?: string;
  meta?: Record<string, unknown>;
}

export interface AccountRef {
  name: string;
}
export interface TagRef {
  name: string;
}
