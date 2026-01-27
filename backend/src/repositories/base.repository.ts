import fs from "fs";
import path from "path";
import {
  Transaction,
  Vault,
  VaultEntry,
  LoanAgreement,
  BorrowingAgreement,
} from "../types";

const DATA_DIR = path.resolve(__dirname, "..", "..", "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

// Admin config entities
export interface AdminType {
  id: number;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
}

export interface AdminAccount {
  id: number;
  name: string;
  type?: string;
  is_active: boolean;
  created_at: string;
}

export interface AdminAsset {
  id: number;
  symbol: string;
  name?: string;
  decimals?: number;
  is_active: boolean;
  created_at: string;
}

export interface AdminTag {
  id: number;
  name: string;
  is_active: boolean;
  created_at: string;
}

export type PendingSource =
  | "telegram_text"
  | "telegram_image"
  | "bank_statement_excel";
export type PendingStatus = "pending" | "accepted" | "rejected";

export interface PendingAction {
  id: string;
  source: PendingSource;
  raw_input: string;
  toon_text?: string;
  action_json?: unknown;
  confidence?: number;
  batch_id?: string;
  meta?: Record<string, unknown>;
  status: PendingStatus;
  created_tx_ids?: string[];
  error?: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoreShape {
  transactions: Transaction[];
  loans: LoanAgreement[];
  borrowings: BorrowingAgreement[];
  vaults: Vault[];
  vaultEntries: VaultEntry[];
  adminTypes: AdminType[];
  adminAccounts: AdminAccount[];
  adminAssets: AdminAsset[];
  adminTags: AdminTag[];
  pendingActions: PendingAction[];
  settings?: {
    borrowingVaultName?: string;
    borrowingMonthlyRate?: number;
    borrowingLastAccrualAt?: string;
    migratedVaultOnly?: boolean;
    migratedBorrowingPrincipal?: boolean;
    migratedIncomeToSpend?: boolean;
    defaultSpendingVaultName?: string;
    defaultIncomeVaultName?: string;
  };
}

function ensureDataFile(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    const initial: StoreShape = {
      transactions: [],
      loans: [],
      borrowings: [],
      vaults: [],
      vaultEntries: [],
      adminTypes: [],
      adminAccounts: [],
      adminAssets: [],
      adminTags: [],
      pendingActions: [],
      settings: {},
    };
    fs.writeFileSync(STORE_FILE, JSON.stringify(initial, null, 2));
  }
}

export function readStore(): StoreShape {
  ensureDataFile();
  const raw = fs.readFileSync(STORE_FILE, "utf8");
  try {
    const data = JSON.parse(raw);
    return {
      transactions: Array.isArray(data.transactions) ? data.transactions : [],
      loans: Array.isArray(data.loans) ? data.loans : [],
      borrowings: Array.isArray(data.borrowings) ? data.borrowings : [],
      vaults: Array.isArray(data.vaults) ? data.vaults : [],
      vaultEntries: Array.isArray(data.vaultEntries) ? data.vaultEntries : [],
      adminTypes: Array.isArray(data.adminTypes) ? data.adminTypes : [],
      adminAccounts: Array.isArray(data.adminAccounts)
        ? data.adminAccounts
        : [],
      adminAssets: Array.isArray(data.adminAssets) ? data.adminAssets : [],
      adminTags: Array.isArray(data.adminTags) ? data.adminTags : [],
      pendingActions: Array.isArray(data.pendingActions)
        ? data.pendingActions
        : [],
      settings:
        typeof data.settings === "object" && data.settings ? data.settings : {},
    } as StoreShape;
  } catch {
    return {
      transactions: [],
      loans: [],
      borrowings: [],
      vaults: [],
      vaultEntries: [],
      adminTypes: [],
      adminAccounts: [],
      adminAssets: [],
      adminTags: [],
      pendingActions: [],
      settings: {},
    } as StoreShape;
  }
}

export function writeStore(s: StoreShape): void {
  ensureDataFile();
  fs.writeFileSync(STORE_FILE, JSON.stringify(s, null, 2));
}

export function nextId<T extends { id: number }>(items: T[]): number {
  const max = items.reduce((m, x) => (x.id > m ? x.id : m), 0);
  return max + 1;
}
