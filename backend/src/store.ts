import fs from "fs";
import path from "path";
import {
  Transaction,
  Asset,
  assetKey,
  PortfolioReport,
  ObligationItem,
  PortfolioReportItem,
  Vault,
  VaultEntry,
} from "./types";
import { priceService } from "./priceService";
import { v4 as uuidv4 } from "uuid";

const DATA_DIR = path.resolve(__dirname, "..", "data");
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

interface StoreShape {
  transactions: Transaction[];
  vaults: Vault[];
  vaultEntries: VaultEntry[];
  adminTypes: AdminType[];
  adminAccounts: AdminAccount[];
  adminAssets: AdminAsset[];
  adminTags: AdminTag[];
}

function ensureDataFile(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    const initial: StoreShape = {
      transactions: [],
      vaults: [],
      vaultEntries: [],
      adminTypes: [],
      adminAccounts: [],
      adminAssets: [],
      adminTags: [],
    };
    fs.writeFileSync(STORE_FILE, JSON.stringify(initial, null, 2));
  }
}

function readStore(): StoreShape {
  ensureDataFile();
  const raw = fs.readFileSync(STORE_FILE, "utf8");
  try {
    const data = JSON.parse(raw);
    return {
      transactions: Array.isArray(data.transactions) ? data.transactions : [],
      vaults: Array.isArray(data.vaults) ? data.vaults : [],
      vaultEntries: Array.isArray(data.vaultEntries) ? data.vaultEntries : [],
      adminTypes: Array.isArray(data.adminTypes) ? data.adminTypes : [],
      adminAccounts: Array.isArray(data.adminAccounts) ? data.adminAccounts : [],
      adminAssets: Array.isArray(data.adminAssets) ? data.adminAssets : [],
      adminTags: Array.isArray(data.adminTags) ? data.adminTags : [],
    } as StoreShape;
  } catch {
    return { transactions: [], vaults: [], vaultEntries: [], adminTypes: [], adminAccounts: [], adminAssets: [], adminTags: [] } as StoreShape;
  }
}

function writeStore(s: StoreShape): void {
  ensureDataFile();
  fs.writeFileSync(STORE_FILE, JSON.stringify(s, null, 2));
}

function normAccount(acc?: string): string | undefined {
  const a = (acc ?? "").trim();
  return a.length ? a : undefined;
}

function nextId<T extends { id: number }>(items: T[]): number {
  const max = items.reduce((m, x) => (x.id > m ? x.id : m), 0);
  return max + 1;
}

const DEFAULT_TRANSACTION_TYPES: Array<Pick<AdminType, 'name' | 'description'>> = [
  { name: 'INITIAL', description: 'Starting balance entries for assets/accounts' },
  { name: 'INCOME', description: 'Incoming funds (salary, sales, deposits)' },
  { name: 'EXPENSE', description: 'Outgoing funds (purchases, fees, withdrawals)' },
  { name: 'BORROW', description: 'Borrowed funds creating a liability' },
  { name: 'LOAN', description: 'Lent funds creating a receivable' },
  { name: 'REPAY', description: 'Repayment against a borrow/loan' },
  { name: 'TRANSFER_OUT', description: 'Transfer out from an account' },
  { name: 'TRANSFER_IN', description: 'Transfer in to an account' },
];

function seedDefaultTypesIfEmpty(): void {
  const s = readStore();
  if ((s.adminTypes?.length ?? 0) > 0) return;
  const now = new Date().toISOString();
  s.adminTypes = DEFAULT_TRANSACTION_TYPES.map((t, idx) => ({
    id: idx + 1,
    name: t.name,
    description: t.description,
    is_active: true,
    created_at: now,
  }));
  writeStore(s);
}

export const store = {
  // Transactions -------------------------------------------------------------
  addTransaction(tx: Transaction) {
    const s = readStore();
    s.transactions.push(tx);
    writeStore(s);
  },
  async recordIncomeTx({ asset, amount, at, account, note }: { asset: Asset; amount: number; at?: string; account?: string; note?: string; }) {
    const createdAt = at ?? new Date().toISOString();
    const rate = await priceService.getRateUSD(asset, at);
    const tx: Transaction = {
      id: uuidv4(),
      type: 'INCOME',
      asset,
      amount,
      createdAt,
      account: normAccount(account),
      note,
      rate,
      usdAmount: amount * rate.rateUSD,
    } as Transaction;
    this.addTransaction(tx);
    return tx;
  },
  async recordExpenseTx({ asset, amount, at, account, note }: { asset: Asset; amount: number; at?: string; account?: string; note?: string; }) {
    const createdAt = at ?? new Date().toISOString();
    const rate = await priceService.getRateUSD(asset, at);
    const tx: Transaction = {
      id: uuidv4(),
      type: 'EXPENSE',
      asset,
      amount,
      createdAt,
      account: normAccount(account),
      note,
      rate,
      usdAmount: amount * rate.rateUSD,
    } as Transaction;
    this.addTransaction(tx);
    return tx;
  },
  all(): Transaction[] {
    return readStore().transactions;
  },
  getTransaction(id: string): Transaction | undefined {
    return readStore().transactions.find(t => t.id === id);
  },
  deleteTransaction(id: string): boolean {
    const s = readStore();
    const before = s.transactions.length;
    s.transactions = s.transactions.filter(t => t.id !== id);
    writeStore(s);
    return s.transactions.length < before;
  },

  // Vaults ------------------------------------------------------------------
  ensureVault(name: string): boolean {
    const s = readStore();
    const exist = s.vaults.find(v => v.name === name);
    if (exist) return false;
    const v: Vault = { name, status: 'ACTIVE', createdAt: new Date().toISOString() };
    s.vaults.push(v);
    writeStore(s);
    return true;
  },
  getVault(name: string): Vault | undefined {
    return readStore().vaults.find(v => v.name === name);
  },
  listVaults(): Vault[] {
    return readStore().vaults;
  },
  endVault(name: string): boolean {
    const s = readStore();
    const v = s.vaults.find(x => x.name === name);
    if (!v) return false;
    v.status = 'CLOSED';
    writeStore(s);
    return true;
  },
  deleteVault(name: string): boolean {
    const s = readStore();
    const before = s.vaults.length;
    s.vaults = s.vaults.filter(v => v.name !== name);
    s.vaultEntries = s.vaultEntries.filter(e => e.vault !== name);
    writeStore(s);
    return s.vaults.length < before;
  },
  addVaultEntry(entry: VaultEntry) {
    const s = readStore();
    s.vaultEntries.push(entry);
    writeStore(s);
  },
  getVaultEntries(name: string): VaultEntry[] {
    return readStore().vaultEntries.filter(e => e.vault === name);
  },
  async vaultStats(name: string): Promise<{ totalDepositedUSD: number; totalWithdrawnUSD: number; aumUSD: number; }> {
    const s = readStore();
    const entries = s.vaultEntries.filter(e => e.vault === name);
    const deposited = entries.filter(e => e.type === 'DEPOSIT').reduce((sum, e) => sum + (e.usdValue || 0), 0);
    const withdrawn = entries.filter(e => e.type === 'WITHDRAW').reduce((sum, e) => sum + (e.usdValue || 0), 0);

    const rep = await this.report();
    const vaultHoldings = rep.holdings.filter(h => h.account === name);
    // If no transactions yet, fallback to net invested? No, true AUM should be based on holdings. 
    // If we haven't migrated old entries to transactions, this might be 0.
    // For now we assume transactions will be created.
    const aum = vaultHoldings.reduce((sum, h) => sum + h.valueUSD, 0);

    return { totalDepositedUSD: deposited, totalWithdrawnUSD: withdrawn, aumUSD: aum };
  },

  // Reports -----------------------------------------------------------------
  async report(): Promise<PortfolioReport> {
    const txs = readStore().transactions;

    // Holdings balances per asset+account
    const balances = new Map<string, { asset: Asset; account?: string; units: number }>();

    // Obligations
    const liabilities = new Map<string, { counterparty: string; asset: Asset; units: number }>();
    const receivables = new Map<string, { counterparty: string; asset: Asset; units: number }>();

    for (const tx of txs) {
      const acc = normAccount(tx.account);
      const k = `${assetKey(tx.asset)}|${acc ?? 'default'}`;
      if (!balances.has(k)) balances.set(k, { asset: tx.asset, account: acc, units: 0 });

      switch (tx.type) {
        case "INITIAL":
        case "INCOME":
          balances.get(k)!.units += tx.amount;
          break;
        case "EXPENSE":
          balances.get(k)!.units -= tx.amount;
          break;
        case "BORROW": {
          balances.get(k)!.units += tx.amount;
          const key = `${(tx as any).counterparty}|${assetKey(tx.asset)}`;
          const cur = liabilities.get(key) || { counterparty: (tx as any).counterparty, asset: tx.asset, units: 0 };
          cur.units += tx.amount;
          liabilities.set(key, cur);
          break;
        }
        case "LOAN": {
          balances.get(k)!.units -= tx.amount;
          const key = `${(tx as any).counterparty}|${assetKey(tx.asset)}`;
          const cur = receivables.get(key) || { counterparty: (tx as any).counterparty, asset: tx.asset, units: 0 };
          cur.units += tx.amount;
          receivables.set(key, cur);
          break;
        }
        case "REPAY": {
          if ((tx as any).direction === "BORROW") {
            balances.get(k)!.units -= tx.amount;
            const cp = (tx as any).counterparty || "general";
            const key = `${cp}|${assetKey(tx.asset)}`;
            const cur = liabilities.get(key) || { counterparty: cp, asset: tx.asset, units: 0 };
            cur.units -= tx.amount; // reduce liability
            liabilities.set(key, cur);
          } else {
            balances.get(k)!.units += tx.amount;
            const cp = (tx as any).counterparty || "general";
            const key = `${cp}|${assetKey(tx.asset)}`;
            const cur = receivables.get(key) || { counterparty: cp, asset: tx.asset, units: 0 };
            cur.units -= tx.amount; // reduce receivable
            receivables.set(key, cur);
          }
          break;
        }
        case "TRANSFER_OUT":
          balances.get(k)!.units -= tx.amount;
          break;
        case "TRANSFER_IN":
          balances.get(k)!.units += tx.amount;
          break;
      }
    }

    // Filter out near-zero obligations
    const liabs: ObligationItem[] = [];
    for (const v of liabilities.values()) {
      if (Math.abs(v.units) > 1e-12) liabs.push({ counterparty: v.counterparty, asset: v.asset, amount: v.units, rateUSD: 0, valueUSD: 0 });
    }
    const recs: ObligationItem[] = [];
    for (const v of receivables.values()) {
      if (Math.abs(v.units) > 1e-12) recs.push({ counterparty: v.counterparty, asset: v.asset, amount: v.units, rateUSD: 0, valueUSD: 0 });
    }

    const holdings: PortfolioReportItem[] = [];
    for (const v of balances.values()) {
      // If balance is negative, treat as liability?
      // For simplicity, strict "liabilities" from BORROW are separate.
      // But if a bank/CC balance is negative, it's effectively a liability.
      // The original code pushed all > 1e-12 to holdings. 
      // We will keep negative balances in holdings for now, but `netWorthUSD` arithmetic needs to handle it.
      // `valueUSD` will be negative for negative balance.
      if (Math.abs(v.units) > 1e-12) {
        holdings.push({ asset: v.asset, account: v.account, balance: v.units, rateUSD: 0, valueUSD: 0 });
      }
    }

    // Fetch current minute rates for valuation
    for (const h of holdings) {
      const rate = await priceService.getRateUSD(h.asset);
      h.rateUSD = rate.rateUSD;
      h.valueUSD = h.balance * rate.rateUSD;
    }
    for (const o of liabs) {
      const rate = await priceService.getRateUSD(o.asset);
      o.rateUSD = rate.rateUSD;
      o.valueUSD = o.amount * rate.rateUSD;
    }
    for (const o of recs) {
      const rate = await priceService.getRateUSD(o.asset);
      o.rateUSD = rate.rateUSD;
      o.valueUSD = o.amount * rate.rateUSD;
    }

    const holdingsUSD = holdings.reduce((s, i) => s + i.valueUSD, 0); // can be negative if some holdings are negative
    const liabilitiesUSD = liabs.reduce((s, i) => s + i.valueUSD, 0);
    const receivablesUSD = recs.reduce((s, i) => s + i.valueUSD, 0);

    return {
      holdings,
      liabilities: liabs,
      receivables: recs,
      totals: {
        holdingsUSD,
        liabilitiesUSD,
        receivablesUSD,
        netWorthUSD: holdingsUSD - liabilitiesUSD + receivablesUSD,
      },
    };
  },

  // Admin config CRUD -------------------------------------------------------
  listTypes(): AdminType[] { seedDefaultTypesIfEmpty(); return readStore().adminTypes; },
  getType(id: number): AdminType | undefined { return readStore().adminTypes.find(t => t.id === id); },
  createType(data: Partial<AdminType> & { name: string }): AdminType {
    const s = readStore();
    const item: AdminType = {
      id: nextId(s.adminTypes),
      name: data.name,
      description: data.description ?? "",
      is_active: data.is_active !== false,
      created_at: new Date().toISOString(),
    };
    s.adminTypes.push(item);
    writeStore(s);
    return item;
  },
  updateType(id: number, data: Partial<AdminType>): AdminType | undefined {
    const s = readStore();
    const idx = s.adminTypes.findIndex(t => t.id === id);
    if (idx === -1) return undefined;
    const prev = s.adminTypes[idx];
    const updated: AdminType = { ...prev, ...data, id: prev.id, created_at: prev.created_at };
    s.adminTypes[idx] = updated;
    writeStore(s);
    return updated;
  },
  deleteType(id: number): boolean {
    const s = readStore();
    const before = s.adminTypes.length;
    s.adminTypes = s.adminTypes.filter(t => t.id !== id);
    writeStore(s);
    return s.adminTypes.length < before;
  },

  listAccounts(): AdminAccount[] { return readStore().adminAccounts; },
  getAccount(id: number): AdminAccount | undefined { return readStore().adminAccounts.find(t => t.id === id); },
  createAccount(data: Partial<AdminAccount> & { name: string }): AdminAccount {
    const s = readStore();
    const item: AdminAccount = {
      id: nextId(s.adminAccounts),
      name: data.name,
      type: data.type ?? "",
      is_active: data.is_active !== false,
      created_at: new Date().toISOString(),
    };
    s.adminAccounts.push(item);
    writeStore(s);
    return item;
  },
  updateAccount(id: number, data: Partial<AdminAccount>): AdminAccount | undefined {
    const s = readStore();
    const idx = s.adminAccounts.findIndex(t => t.id === id);
    if (idx === -1) return undefined;
    const prev = s.adminAccounts[idx];
    const updated: AdminAccount = { ...prev, ...data, id: prev.id, created_at: prev.created_at };
    s.adminAccounts[idx] = updated;
    writeStore(s);
    return updated;
  },
  deleteAccount(id: number): boolean {
    const s = readStore();
    const before = s.adminAccounts.length;
    s.adminAccounts = s.adminAccounts.filter(t => t.id !== id);
    writeStore(s);
    return s.adminAccounts.length < before;
  },

  listAdminAssets(): AdminAsset[] { return readStore().adminAssets; },
  getAdminAsset(id: number): AdminAsset | undefined { return readStore().adminAssets.find(t => t.id === id); },
  createAdminAsset(data: Partial<AdminAsset> & { symbol: string }): AdminAsset {
    const s = readStore();
    const item: AdminAsset = {
      id: nextId(s.adminAssets),
      symbol: data.symbol.toUpperCase(),
      name: data.name ?? "",
      decimals: typeof data.decimals === 'number' ? data.decimals : 8,
      is_active: data.is_active !== false,
      created_at: new Date().toISOString(),
    };
    s.adminAssets.push(item);
    writeStore(s);
    return item;
  },
  updateAdminAsset(id: number, data: Partial<AdminAsset>): AdminAsset | undefined {
    const s = readStore();
    const idx = s.adminAssets.findIndex(t => t.id === id);
    if (idx === -1) return undefined;
    const prev = s.adminAssets[idx];
    const updated: AdminAsset = { ...prev, ...data, id: prev.id, created_at: prev.created_at };
    if (updated.symbol) updated.symbol = updated.symbol.toUpperCase();
    s.adminAssets[idx] = updated;
    writeStore(s);
    return updated;
  },
  deleteAdminAsset(id: number): boolean {
    const s = readStore();
    const before = s.adminAssets.length;
    s.adminAssets = s.adminAssets.filter(t => t.id !== id);
    writeStore(s);
    return s.adminAssets.length < before;
  },

  listTags(): AdminTag[] { return readStore().adminTags; },
  getTag(id: number): AdminTag | undefined { return readStore().adminTags.find(t => t.id === id); },
  createTag(data: Partial<AdminTag> & { name: string }): AdminTag {
    const s = readStore();
    const item: AdminTag = {
      id: nextId(s.adminTags),
      name: data.name,
      category: data.category ?? "",
      is_active: data.is_active !== false,
      created_at: new Date().toISOString(),
    };
    s.adminTags.push(item);
    writeStore(s);
    return item;
  },
  updateTag(id: number, data: Partial<AdminTag>): AdminTag | undefined {
    const s = readStore();
    const idx = s.adminTags.findIndex(t => t.id === id);
    if (idx === -1) return undefined;
    const prev = s.adminTags[idx];
    const updated: AdminTag = { ...prev, ...data, id: prev.id, created_at: prev.created_at };
    s.adminTags[idx] = updated;
    writeStore(s);
    return updated;
  },
  deleteTag(id: number): boolean {
    const s = readStore();
    const before = s.adminTags.length;
    s.adminTags = s.adminTags.filter(t => t.id !== id);
    writeStore(s);
    return s.adminTags.length < before;
  },
};
