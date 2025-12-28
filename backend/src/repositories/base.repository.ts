import fs from "fs";
import path from "path";
import {
  Transaction,
  Vault,
  VaultEntry,
  LoanAgreement,
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
  category?: string;
  is_active: boolean;
  created_at: string;
}

export interface StoreShape {
  transactions: Transaction[];
  loans: LoanAgreement[];
  vaults: Vault[];
  vaultEntries: VaultEntry[];
  adminTypes: AdminType[];
  adminAccounts: AdminAccount[];
  adminAssets: AdminAsset[];
  adminTags: AdminTag[];
  settings?: {
    borrowingVaultName?: string;
    borrowingMonthlyRate?: number;
    borrowingLastAccrualAt?: string;
    migratedVaultOnly?: boolean;
    migratedBorrowingPrincipal?: boolean;
    defaultSpendingVaultName?: string;
  };
}

function ensureDataFile(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    const initial: StoreShape = {
      transactions: [],
      loans: [],
      vaults: [],
      vaultEntries: [],
      adminTypes: [],
      adminAccounts: [],
      adminAssets: [],
      adminTags: [],
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
      vaults: Array.isArray(data.vaults) ? data.vaults : [],
      vaultEntries: Array.isArray(data.vaultEntries) ? data.vaultEntries : [],
      adminTypes: Array.isArray(data.adminTypes) ? data.adminTypes : [],
      adminAccounts: Array.isArray(data.adminAccounts) ? data.adminAccounts : [],
      adminAssets: Array.isArray(data.adminAssets) ? data.adminAssets : [],
      adminTags: Array.isArray(data.adminTags) ? data.adminTags : [],
      settings: typeof data.settings === 'object' && data.settings ? data.settings : {},
    } as StoreShape;
  } catch {
    return {
      transactions: [],
      loans: [],
      vaults: [],
      vaultEntries: [],
      adminTypes: [],
      adminAccounts: [],
      adminAssets: [],
      adminTags: [],
      settings: {}
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
