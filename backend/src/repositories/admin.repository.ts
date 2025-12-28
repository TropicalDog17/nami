import { AdminType, AdminAccount, AdminAsset, AdminTag, readStore, writeStore, nextId } from "./base.repository";

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

const DEFAULT_ADMIN_ASSETS: Array<Pick<AdminAsset, 'symbol' | 'name' | 'decimals'>> = [
  { symbol: 'BTC', name: 'Bitcoin', decimals: 8 },
  { symbol: 'ETH', name: 'Ethereum', decimals: 18 },
  { symbol: 'USDT', name: 'Tether USD', decimals: 6 },
  { symbol: 'VND', name: 'Vietnamese Dong', decimals: 0 },
];

export class AdminRepository {
  // Transaction Types
  findAllTypes(): AdminType[] {
    this.seedDefaultTypesIfEmpty();
    return readStore().adminTypes;
  }

  findTypeById(id: number): AdminType | undefined {
    return readStore().adminTypes.find(t => t.id === id);
  }

  createType(data: Partial<AdminType> & { name: string }): AdminType {
    const store = readStore();
    const item: AdminType = {
      id: nextId(store.adminTypes),
      name: data.name,
      description: data.description ?? "",
      is_active: data.is_active !== false,
      created_at: new Date().toISOString(),
    };
    store.adminTypes.push(item);
    writeStore(store);
    return item;
  }

  updateType(id: number, data: Partial<AdminType>): AdminType | undefined {
    const store = readStore();
    const index = store.adminTypes.findIndex(t => t.id === id);
    if (index === -1) return undefined;

    const prev = store.adminTypes[index];
    store.adminTypes[index] = { ...prev, ...data, id: prev.id, created_at: prev.created_at };
    writeStore(store);
    return store.adminTypes[index];
  }

  deleteType(id: number): boolean {
    const store = readStore();
    const initialLength = store.adminTypes.length;
    store.adminTypes = store.adminTypes.filter(t => t.id !== id);
    writeStore(store);
    return store.adminTypes.length < initialLength;
  }

  // Accounts
  findAllAccounts(): AdminAccount[] {
    return readStore().adminAccounts;
  }

  findAccountById(id: number): AdminAccount | undefined {
    return readStore().adminAccounts.find(a => a.id === id);
  }

  createAccount(data: Partial<AdminAccount> & { name: string }): AdminAccount {
    const store = readStore();
    const item: AdminAccount = {
      id: nextId(store.adminAccounts),
      name: data.name,
      type: data.type ?? "",
      is_active: data.is_active !== false,
      created_at: new Date().toISOString(),
    };
    store.adminAccounts.push(item);
    writeStore(store);
    return item;
  }

  updateAccount(id: number, data: Partial<AdminAccount>): AdminAccount | undefined {
    const store = readStore();
    const index = store.adminAccounts.findIndex(a => a.id === id);
    if (index === -1) return undefined;

    const prev = store.adminAccounts[index];
    store.adminAccounts[index] = { ...prev, ...data, id: prev.id, created_at: prev.created_at };
    writeStore(store);
    return store.adminAccounts[index];
  }

  deleteAccount(id: number): boolean {
    const store = readStore();
    const initialLength = store.adminAccounts.length;
    store.adminAccounts = store.adminAccounts.filter(a => a.id !== id);
    writeStore(store);
    return store.adminAccounts.length < initialLength;
  }

  // Assets
  findAllAssets(): AdminAsset[] {
    this.seedDefaultAssetsIfEmpty();
    return readStore().adminAssets;
  }

  findAssetById(id: number): AdminAsset | undefined {
    return readStore().adminAssets.find(a => a.id === id);
  }

  createAsset(data: Partial<AdminAsset> & { symbol: string }): AdminAsset {
    const store = readStore();
    const item: AdminAsset = {
      id: nextId(store.adminAssets),
      symbol: data.symbol.toUpperCase(),
      name: data.name ?? "",
      decimals: typeof data.decimals === 'number' ? data.decimals : 8,
      is_active: data.is_active !== false,
      created_at: new Date().toISOString(),
    };
    store.adminAssets.push(item);
    writeStore(store);
    return item;
  }

  updateAsset(id: number, data: Partial<AdminAsset>): AdminAsset | undefined {
    const store = readStore();
    const index = store.adminAssets.findIndex(a => a.id === id);
    if (index === -1) return undefined;

    const prev = store.adminAssets[index];
    const updated = { ...prev, ...data, id: prev.id, created_at: prev.created_at };
    if (updated.symbol) updated.symbol = updated.symbol.toUpperCase();
    store.adminAssets[index] = updated;
    writeStore(store);
    return store.adminAssets[index];
  }

  deleteAsset(id: number): boolean {
    const store = readStore();
    const initialLength = store.adminAssets.length;
    store.adminAssets = store.adminAssets.filter(a => a.id !== id);
    writeStore(store);
    return store.adminAssets.length < initialLength;
  }

  // Tags
  findAllTags(): AdminTag[] {
    return readStore().adminTags;
  }

  findTagById(id: number): AdminTag | undefined {
    return readStore().adminTags.find(t => t.id === id);
  }

  createTag(data: Partial<AdminTag> & { name: string }): AdminTag {
    const store = readStore();
    const item: AdminTag = {
      id: nextId(store.adminTags),
      name: data.name,
      category: data.category ?? "",
      is_active: data.is_active !== false,
      created_at: new Date().toISOString(),
    };
    store.adminTags.push(item);
    writeStore(store);
    return item;
  }

  updateTag(id: number, data: Partial<AdminTag>): AdminTag | undefined {
    const store = readStore();
    const index = store.adminTags.findIndex(t => t.id === id);
    if (index === -1) return undefined;

    const prev = store.adminTags[index];
    store.adminTags[index] = { ...prev, ...data, id: prev.id, created_at: prev.created_at };
    writeStore(store);
    return store.adminTags[index];
  }

  deleteTag(id: number): boolean {
    const store = readStore();
    const initialLength = store.adminTags.length;
    store.adminTags = store.adminTags.filter(t => t.id !== id);
    writeStore(store);
    return store.adminTags.length < initialLength;
  }

  // Seed methods
  private seedDefaultTypesIfEmpty(): void {
    const store = readStore();
    if ((store.adminTypes?.length ?? 0) > 0) return;

    const now = new Date().toISOString();
    store.adminTypes = DEFAULT_TRANSACTION_TYPES.map((t, idx) => ({
      id: idx + 1,
      name: t.name,
      description: t.description,
      is_active: true,
      created_at: now,
    }));
    writeStore(store);
  }

  private seedDefaultAssetsIfEmpty(): void {
    const store = readStore();
    if ((store.adminAssets?.length ?? 0) > 0) return;

    const now = new Date().toISOString();
    store.adminAssets = DEFAULT_ADMIN_ASSETS.map((a, idx) => ({
      id: idx + 1,
      symbol: a.symbol.toUpperCase(),
      name: a.name ?? '',
      decimals: typeof a.decimals === 'number' ? a.decimals : 8,
      is_active: true,
      created_at: now,
    }));
    writeStore(store);
  }
}

export const adminRepository = new AdminRepository();
