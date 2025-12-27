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

import { LoanAgreement, LoanCreateRequest } from "./types";

interface StoreShape {
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
    borrowingMonthlyRate?: number; // e.g., 0.02 means 2% per month
    borrowingLastAccrualAt?: string; // ISO date at start of month
    migratedVaultOnly?: boolean;
    migratedBorrowingPrincipal?: boolean;
    defaultSpendingVaultName?: string; // single dedicated spending vault name
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

function startOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}
function endOfMonthUTC(d: Date): Date {
  const start = startOfMonthUTC(d);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

function readStore(): StoreShape {
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
    return { transactions: [], loans: [], vaults: [], vaultEntries: [], adminTypes: [], adminAccounts: [], adminAssets: [], adminTags: [], settings: {} } as StoreShape;
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

// Default admin assets and accounts seeding ---------------------------------
const DEFAULT_ADMIN_ASSETS: Array<Pick<AdminAsset, 'symbol' | 'name' | 'decimals'>> = [
  { symbol: 'BTC', name: 'Bitcoin', decimals: 8 },
  { symbol: 'ETH', name: 'Ethereum', decimals: 18 },
  { symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  { symbol: 'VND', name: 'Vietnamese Dong', decimals: 0 },
];

function seedDefaultAdminAssetsIfEmpty(): void {
  const s = readStore();
  if ((s.adminAssets?.length ?? 0) > 0) return;
  const now = new Date().toISOString();
  s.adminAssets = DEFAULT_ADMIN_ASSETS.map((a, idx) => ({
    id: idx + 1,
    symbol: a.symbol.toUpperCase(),
    name: a.name ?? '',
    decimals: typeof a.decimals === 'number' ? a.decimals : 8,
    is_active: true,
    created_at: now,
  }));
  writeStore(s);
}

const DEFAULT_ADMIN_ACCOUNTS: Array<Pick<AdminAccount, 'name' | 'type'>> = [
  { name: 'Binance', type: 'exchange' },
  { name: 'Web3 Wallet', type: 'wallet' },
  { name: 'Cash', type: 'cash' },
];

function seedDefaultAdminAccountsIfEmpty(): void {
  // No-op in vault-only model to remove account concept
  const s = readStore();
  if ((s.adminAccounts?.length ?? 0) > 0) return;
  s.adminAccounts = [];
  writeStore(s);
}

export const store = {
  // Migration and settings --------------------------------------------------
  ensureBorrowingSettings(): { name: string; rate: number; lastAccrualStart: string } {
    const s = readStore();
    const name = s.settings?.borrowingVaultName?.trim() || 'Borrowings';
    const rate = typeof s.settings?.borrowingMonthlyRate === 'number' ? (s.settings!.borrowingMonthlyRate as number) : 0.02;
    const last = s.settings?.borrowingLastAccrualAt || startOfMonthUTC(new Date()).toISOString();
    if (!s.settings) s.settings = {} as any;
    if (!s.settings.borrowingVaultName) s.settings.borrowingVaultName = name;
    if (s.settings.borrowingMonthlyRate === undefined) s.settings.borrowingMonthlyRate = rate;
    if (!s.settings.borrowingLastAccrualAt) s.settings.borrowingLastAccrualAt = last;
    // Ensure borrowing vault exists
    const existed = this.getVault(name);
    if (!existed) {
      this.ensureVault(name);
    }
    writeStore(s);
    return { name, rate, lastAccrualStart: s.settings.borrowingLastAccrualAt! };
  },
  getDefaultSpendingVaultName(): string {
    const s = readStore();
    const name = s.settings?.defaultSpendingVaultName?.trim() || 'Spend';
    if (!s.settings) (s as any).settings = {};
    if (!s.settings!.defaultSpendingVaultName) s.settings!.defaultSpendingVaultName = name;
    if (!this.getVault(name)) this.ensureVault(name);
    writeStore(s);
    return name;
  },
  setDefaultSpendingVaultName(name: string): string {
    const s = readStore();
    const trimmed = String(name || '').trim() || 'Spend';
    if (!s.settings) (s as any).settings = {};
    s.settings!.defaultSpendingVaultName = trimmed;
    if (!this.getVault(trimmed)) this.ensureVault(trimmed);
    writeStore(s);
    return trimmed;
  },
  async migrateToVaultOnly(): Promise<void> {
    const s = readStore();
    if (s.settings?.migratedVaultOnly) return; // already migrated

    // 1) Ensure every transaction account is a vault; if missing, route to 'Main'
    const mainVault = 'Main';
    if (!this.getVault(mainVault)) this.ensureVault(mainVault);

    const seenAccounts = new Set<string>();
    for (const tx of s.transactions) {
      if (!tx.account || !String(tx.account).trim()) {
        tx.account = mainVault;
      }
      const acc = String(tx.account).trim();
      if (acc) seenAccounts.add(acc);
    }
    // Create vaults for all seen accounts
    for (const acc of seenAccounts) {
      if (!this.getVault(acc)) this.ensureVault(acc);
    }

    // 2) Clear adminAccounts (remove account concept)
    s.adminAccounts = [];

    // 3) Seed borrowing settings and ensure vault, baseline principal as negative USD in borrowing vault once
    const { name } = this.ensureBorrowingSettings();
    if (!this.getVault(name)) this.ensureVault(name);
    if (!s.settings?.migratedBorrowingPrincipal) {
      const outstandingUSD = await this.outstandingBorrowUSD();
      if (outstandingUSD > 1e-8) {
        const usd: Asset = { type: 'FIAT', symbol: 'USD' };
        await this.recordExpenseTx({ asset: usd, amount: outstandingUSD, at: new Date().toISOString(), account: name, note: 'Borrowing principal baseline' });
      }
      if (!s.settings) s.settings = {} as any;
      s.settings.migratedBorrowingPrincipal = true;
    }

    // 4) Mark migrated
    if (!s.settings) s.settings = {} as any;
    s.settings.migratedVaultOnly = true;

    writeStore(s);
  },
  async accrueBorrowingInterestIfDue(): Promise<number> {
    const cfg = this.ensureBorrowingSettings();
    const s = readStore();
    const startFrom = new Date(cfg.lastAccrualStart);
    const now = new Date();
    let cursor = startOfMonthUTC(startFrom);
    const end = startOfMonthUTC(now);
    let created = 0;

    while (cursor < end) {
      // Compute outstanding BORROW principal in USD as of this month end
      const monthEnd = endOfMonthUTC(cursor);
      const outstandingUSD = await this.outstandingBorrowUSD();
      const interest = outstandingUSD * cfg.rate;
      if (interest > 1e-8) {
        // Record EXPENSE in borrowing vault (USD)
        const asset: Asset = { type: 'FIAT', symbol: 'USD' };
        await this.recordExpenseTx({ asset, amount: interest, at: monthEnd.toISOString(), account: cfg.name, note: `Monthly borrowing interest ${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth()+1).padStart(2,'0')}` });
        created++;
      }
      // advance to next month
      cursor = startOfMonthUTC(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1)));
      s.settings!.borrowingLastAccrualAt = cursor.toISOString();
      writeStore(s);
    }
    return created;
  },
  async outstandingBorrowUSD(at?: string): Promise<number> {
    const s = readStore();
    let outstandingUSD = 0;
    // Aggregate per asset as-of time
    const cutoff = at ? new Date(at).toISOString() : undefined;
    const agg = new Map<string, { asset: Asset; units: number }>();
    for (const tx of s.transactions) {
      if (cutoff && tx.createdAt > cutoff) continue;
      if (tx.type === 'BORROW') {
        const k = assetKey(tx.asset);
        const cur = agg.get(k) || { asset: tx.asset, units: 0 };
        cur.units += tx.amount;
        agg.set(k, cur);
      } else if (tx.type === 'REPAY' && (tx as any).direction === 'BORROW') {
        const k = assetKey(tx.asset);
        const cur = agg.get(k) || { asset: tx.asset, units: 0 };
        cur.units -= tx.amount;
        agg.set(k, cur);
      }
    }
    for (const v of agg.values()) {
      if (v.units > 1e-12) {
        const rate = await priceService.getRateUSD(v.asset, cutoff);
        outstandingUSD += v.units * rate.rateUSD;
      }
    }
    return outstandingUSD;
  },

  // Loans -------------------------------------------------------------------
  createLoan: async (data: LoanCreateRequest): Promise<{ loan: LoanAgreement; tx: Transaction }> => {
    const s = readStore();
    const id = uuidv4();
    const startAt = data.startAt ?? new Date().toISOString();
    const createdAt = new Date().toISOString();
    const loan: LoanAgreement = {
      id,
      counterparty: data.counterparty || "general",
      asset: data.asset,
      principal: data.principal,
      interestRate: data.interestRate,
      period: data.period,
      startAt,
      maturityAt: data.maturityAt,
      note: data.note,
      account: data.account,
      status: "ACTIVE",
      createdAt,
    };
    // Record LOAN transaction that funds the loan (cash out)
    const rate = await priceService.getRateUSD(data.asset, startAt);
    const tx: Transaction = {
      id: uuidv4(),
      type: "LOAN",
      asset: data.asset,
      amount: data.principal,
      createdAt: startAt,
      account: data.account,
      note: data.note ?? `Loan to ${loan.counterparty}`,
      counterparty: loan.counterparty,
      loanId: id,
      rate,
      usdAmount: data.principal * rate.rateUSD,
    } as Transaction;

    s.loans.push(loan);
    s.transactions.push(tx);
    writeStore(s);
    return { loan, tx };
  },
  listLoans(): LoanAgreement[] { return readStore().loans; },
  getLoan(id: string): LoanAgreement | undefined { return readStore().loans.find(l => l.id === id); },
  async listLoansView() {
    const s = readStore();
    const out: any[] = [];
    for (const loan of s.loans) {
      const view = await this.getLoanView(loan.id);
      if (view) out.push(view);
    }
    return out;
  },
  async getLoanView(id: string) {
    const s = readStore();
    const loan = s.loans.find(l => l.id === id);
    if (!loan) return undefined;
    const related = s.transactions.filter(t => t.loanId === id);
    const principalIssued = related.filter(t => t.type === "LOAN").reduce((sum, t) => sum + t.amount, 0);
    const principalRepaid = related.filter(t => t.type === "REPAY" && (t as any).direction === "LOAN").reduce((sum, t) => sum + t.amount, 0);
    const principalOutstanding = Math.max(0, principalIssued - principalRepaid);
    const interestTxs = related.filter(t => t.type === "INCOME" && (t.category === "INTEREST_INCOME" || /interest/i.test(t.note || "")));
    const interestReceived = interestTxs.reduce((sum, t) => sum + t.amount, 0);
    const rate = await priceService.getRateUSD(loan.asset);
    const metrics = {
      principalIssued,
      principalRepaid,
      principalOutstanding,
      principalOutstandingUSD: principalOutstanding * rate.rateUSD,
      interestRate: loan.interestRate,
      period: loan.period,
      suggestedNextPeriodInterest: principalOutstanding * loan.interestRate,
      totalInterestReceived: interestReceived,
      totalInterestReceivedUSD: interestReceived * rate.rateUSD,
    };
    return { loan, metrics, transactions: related };
  },
  async recordLoanPrincipalRepayment(loanId: string, input: { amount: number; at?: string; account?: string; note?: string; }) {
    const s = readStore();
    const loan = s.loans.find(l => l.id === loanId);
    if (!loan) return undefined;
    const at = input.at ?? new Date().toISOString();
    const rate = await priceService.getRateUSD(loan.asset, at);
    const tx: Transaction = {
      id: uuidv4(),
      type: "REPAY",
      asset: loan.asset,
      amount: input.amount,
      createdAt: at,
      account: input.account,
      note: input.note ?? `Repay principal for loan ${loan.id}`,
      direction: "LOAN" as any,
      counterparty: loan.counterparty,
      loanId: loan.id,
      rate,
      usdAmount: input.amount * rate.rateUSD,
    } as Transaction;
    s.transactions.push(tx);
    writeStore(s);
    return tx;
  },
  async recordLoanInterestIncome(loanId: string, input: { amount: number; at?: string; account?: string; note?: string; }) {
    const s = readStore();
    const loan = s.loans.find(l => l.id === loanId);
    if (!loan) return undefined;
    const at = input.at ?? new Date().toISOString();
    const rate = await priceService.getRateUSD(loan.asset, at);
    const tx: Transaction = {
      id: uuidv4(),
      type: "INCOME",
      asset: loan.asset,
      amount: input.amount,
      createdAt: at,
      account: input.account,
      note: input.note ?? `Interest income for loan ${loan.id}`,
      category: "INTEREST_INCOME",
      counterparty: loan.counterparty,
      loanId: loan.id,
      rate,
      usdAmount: input.amount * rate.rateUSD,
    } as Transaction;
    s.transactions.push(tx);
    writeStore(s);
    return tx;
  },

  // Transactions -------------------------------------------------------------
  addTransaction(tx: Transaction) {
    const s = readStore();
    s.transactions.push(tx);
    writeStore(s);
  },
  async recordIncomeTx({ asset, amount, at, account, note }: { asset: Asset; amount: number; at?: string; account?: string; note?: string; }) {
    const createdAt = at ?? new Date().toISOString();
    const rate = await priceService.getRateUSD(asset, at);
    const acc = normAccount(account) || this.getDefaultSpendingVaultName();
    if (acc) this.ensureVault(acc);
    const tx: Transaction = {
      id: uuidv4(),
      type: 'INCOME',
      asset,
      amount,
      createdAt,
      account: acc,
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
    const acc = normAccount(account) || this.getDefaultSpendingVaultName();
    if (acc) this.ensureVault(acc);
    const tx: Transaction = {
      id: uuidv4(),
      type: 'EXPENSE',
      asset,
      amount,
      createdAt,
      account: acc,
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
    const entries = s.vaultEntries
      .filter(e => e.vault === name)
      .sort((a, b) => String(a.at).localeCompare(String(b.at)));

    let deposited = 0;
    let withdrawn = 0;

    // Track positions and support rolling AUM: last valuation + net flows since valuation
    const positions = new Map<string, { asset: Asset; units: number }>();
    let lastValuationUSD: number | undefined = undefined;
    let netFlowSinceValUSD = 0; // deposits - withdrawals since the last valuation snapshot

    for (const e of entries) {
      if (e.type === 'DEPOSIT') {
        const usd = Number(e.usdValue || 0);
        deposited += usd;
        const k = assetKey(e.asset);
        const cur = positions.get(k) || { asset: e.asset, units: 0 };
        cur.units += e.amount;
        positions.set(k, cur);
        if (typeof lastValuationUSD === 'number') netFlowSinceValUSD += usd;
      } else if (e.type === 'WITHDRAW') {
        const usd = Number(e.usdValue || 0);
        withdrawn += usd;
        const k = assetKey(e.asset);
        const cur = positions.get(k) || { asset: e.asset, units: 0 };
        cur.units -= e.amount;
        positions.set(k, cur);
        if (typeof lastValuationUSD === 'number') netFlowSinceValUSD -= usd;
      } else if (e.type === 'VALUATION') {
        if (typeof e.usdValue === 'number') lastValuationUSD = e.usdValue;
        netFlowSinceValUSD = 0; // reset after recording a valuation snapshot
      }
    }

    // Compute AUM: prefer rolling valuation if available, else mark-to-market from positions
    let aum = 0;
    if (typeof lastValuationUSD === 'number') {
      aum = lastValuationUSD + netFlowSinceValUSD;
    } else {
      for (const v of positions.values()) {
        if (Math.abs(v.units) < 1e-12) continue;
        const rate = await priceService.getRateUSD(v.asset);
        aum += v.units * rate.rateUSD;
      }
    }

    return { totalDepositedUSD: deposited, totalWithdrawnUSD: withdrawn, aumUSD: aum };
  },

  // Reports -----------------------------------------------------------------
  async report(): Promise<PortfolioReport> {
    // Vault-only report: compute balances from vault entries
    const s = readStore();
    const balances = new Map<string, { asset: Asset; account?: string; units: number }>();

    for (const e of s.vaultEntries) {
      const account = e.vault;
      const k = `${assetKey(e.asset)}|${account}`;
      const cur = balances.get(k) || { asset: e.asset, account, units: 0 };
      cur.units += e.type === 'DEPOSIT' ? e.amount : -e.amount;
      balances.set(k, cur);
    }

    const holdings: PortfolioReportItem[] = [];
    for (const v of balances.values()) {
      if (Math.abs(v.units) > 1e-12) {
        holdings.push({ asset: v.asset, account: v.account, balance: v.units, rateUSD: 0, valueUSD: 0 });
      }
    }

    for (const h of holdings) {
      const rate = await priceService.getRateUSD(h.asset);
      h.rateUSD = rate.rateUSD;
      h.valueUSD = h.balance * rate.rateUSD;
    }

    const holdingsUSD = holdings.reduce((s, i) => s + i.valueUSD, 0);

    return {
      holdings,
      liabilities: [],
      receivables: [],
      totals: {
        holdingsUSD,
        liabilitiesUSD: 0,
        receivablesUSD: 0,
        netWorthUSD: holdingsUSD,
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

  listAccounts(): AdminAccount[] { seedDefaultAdminAccountsIfEmpty(); return readStore().adminAccounts; },
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

  listAdminAssets(): AdminAsset[] { seedDefaultAdminAssetsIfEmpty(); return readStore().adminAssets; },
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
