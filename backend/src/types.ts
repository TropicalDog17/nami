import { z } from "zod";

export type AssetType = "CRYPTO" | "FIAT";

export interface Asset {
    type: AssetType;
    symbol: string; // e.g., BTC, ETH, USD, IDR
}

export type TransactionType =
    | "INITIAL"
    | "INCOME"
    | "EXPENSE"
    | "BORROW"
    | "LOAN"
    | "REPAY"
    | "TRANSFER_OUT"
    | "TRANSFER_IN";

export type RepayDirection = "BORROW" | "LOAN";

export interface Rate {
    asset: Asset;
    rateUSD: number; // 1 asset -> USD
    timestamp: string; // ISO, minute precision
    source: "COINGECKO" | "EXCHANGE_RATE_HOST" | "FIXED";
}

export interface TransactionBase {
    id: string;
    type: TransactionType;
    asset: Asset;
    amount: number; // positive value in asset units provided by the request
    createdAt: string; // ISO date
    account?: string; // optional account/source of funds
    note?: string;
    category?: string;
    tags?: string[];
    transferId?: string; // Links TRANSFER_OUT and TRANSFER_IN pairs
    rate: Rate; // rate used at the time of transaction
    usdAmount: number; // amount * rateUSD (may be negative based on delta sign)
}

export interface CounterpartyTxn {
    counterparty: string; // e.g., friend name, bank, etc.
}

export interface RepayMeta {
    direction: RepayDirection; // repay a borrow (liability) or a loan (receivable)
}

export type Transaction =
    | (TransactionBase & { type: "INITIAL" })
    | (TransactionBase & { type: "INCOME" })
    | (TransactionBase & { type: "EXPENSE" })
    | (TransactionBase & { type: "TRANSFER_OUT" })
    | (TransactionBase & { type: "TRANSFER_IN" })
    | (TransactionBase & { type: "BORROW" } & CounterpartyTxn)
    | (TransactionBase & { type: "LOAN" } & CounterpartyTxn)
    | (TransactionBase & { type: "REPAY" } & RepayMeta &
        Partial<CounterpartyTxn>);

export interface PortfolioReportItem {
    asset: Asset;
    account?: string; // account that holds this asset
    balance: number; // current units
    rateUSD: number;
    valueUSD: number;
}

export interface ObligationItem {
    counterparty: string;
    asset: Asset;
    amount: number; // units owed (+ for outstanding)
    rateUSD: number;
    valueUSD: number; // valuation of obligation
}

export interface PortfolioReport {
    holdings: PortfolioReportItem[];
    liabilities: ObligationItem[]; // BORROW outstanding
    receivables: ObligationItem[]; // LOAN outstanding
    totals: {
        holdingsUSD: number;
        liabilitiesUSD: number;
        receivablesUSD: number;
        netWorthUSD: number; // holdings - liabilities + receivables
    };
}

// Vaults
export type VaultStatus = 'ACTIVE' | 'CLOSED';
export interface Vault {
    name: string;
    status: VaultStatus;
    createdAt: string;
}
export type VaultEntryType = 'DEPOSIT' | 'WITHDRAW';
export interface VaultEntry {
    vault: string; // vault name
    type: VaultEntryType;
    asset: Asset;
    amount: number; // in asset units
    usdValue: number; // valuation at time
    at: string; // ISO
    account?: string;
    note?: string;
}

// Zod Schemas
export const AssetSchema = z.object({
    type: z.enum(["CRYPTO", "FIAT"]),
    symbol: z.string().min(1),
});

export const InitialRequestSchema = z.object({
    items: z
        .array(
            z.object({
                asset: AssetSchema,
                amount: z.number().positive(),
                account: z.string().optional(),
                note: z.string().optional(),
                at: z.string().datetime().optional(),
            })
        )
        .min(1),
});

export const IncomeExpenseSchema = z.object({
    asset: AssetSchema,
    amount: z.number().positive(),
    account: z.string().optional(),
    note: z.string().optional(),
    at: z.string().datetime().optional(),
});

export const BorrowLoanSchema = z.object({
    asset: AssetSchema,
    amount: z.number().positive(),
    account: z.string().optional(),
    counterparty: z.string().default("general"),
    note: z.string().optional(),
    at: z.string().datetime().optional(),
});

export const RepaySchema = z.object({
    asset: AssetSchema,
    amount: z.number().positive(),
    account: z.string().optional(),
    direction: z.enum(["BORROW", "LOAN"]),
    counterparty: z.string().default("general").optional(),
    note: z.string().optional(),
    at: z.string().datetime().optional(),
});

export type InitialRequest = z.infer<typeof InitialRequestSchema>;
export type IncomeExpenseRequest = z.infer<typeof IncomeExpenseSchema>;
export type BorrowLoanRequest = z.infer<typeof BorrowLoanSchema>;
export type RepayRequest = z.infer<typeof RepaySchema>;

export function assetKey(a: Asset): string {
    return `${a.type}:${a.symbol.toUpperCase()}`;
}
