import { Transaction, Vault, VaultEntry, LoanAgreement } from "../types";
import {
  AdminType,
  AdminAccount,
  AdminAsset,
  AdminTag,
  PendingAction,
  StoreShape,
} from "./base.repository";

// Transaction repository interface
export interface ITransactionRepository {
  findAll(): Transaction[];
  findById(id: string): Transaction | undefined;
  findByLoanId(loanId: string): Transaction[];
  create(transaction: Transaction): Transaction;
  delete(id: string): boolean;
  findByAccount(account: string): Transaction[];
  findByType(type: string): Transaction[];
  findByDateRange(startDate: string, endDate: string): Transaction[];
  findBySourceRef(sourceRef: string): Transaction | undefined;
  findExisting(params: {
    sourceRef?: string;
    date: string;
    amount: number;
    type: string;
    account?: string;
  }): Transaction | undefined;
}

// Vault repository interface
export interface IVaultRepository {
  findAll(): Vault[];
  findByName(name: string): Vault | undefined;
  findByStatus(status: string): Vault[];
  create(vault: Vault): Vault;
  update(name: string, updates: Partial<Vault>): Vault | undefined;
  delete(name: string): boolean;
  findAllEntries(vaultName: string): VaultEntry[];
  createEntry(entry: VaultEntry): VaultEntry;
  findEntriesByType(vaultName: string, type: string): VaultEntry[];
  findEntriesByDateRange(
    vaultName: string,
    startDate: string,
    endDate: string,
  ): VaultEntry[];
}

// Loan repository interface
export interface ILoanRepository {
  findAll(): LoanAgreement[];
  findById(id: string): LoanAgreement | undefined;
  findByCounterparty(counterparty: string): LoanAgreement[];
  findByStatus(status: string): LoanAgreement[];
  create(loan: LoanAgreement): LoanAgreement;
  update(
    id: string,
    updates: Partial<LoanAgreement>,
  ): LoanAgreement | undefined;
  delete(id: string): boolean;
}

// Admin repository interface
export interface IAdminRepository {
  // Admin types
  findAllTypes(): AdminType[];
  findTypeById(id: number): AdminType | undefined;
  createType(type: Omit<AdminType, "id" | "created_at">): AdminType;
  updateType(id: number, updates: Partial<AdminType>): AdminType | undefined;
  deleteType(id: number): boolean;

  // Admin accounts
  findAllAccounts(): AdminAccount[];
  findAccountById(id: number): AdminAccount | undefined;
  createAccount(account: Omit<AdminAccount, "id" | "created_at">): AdminAccount;
  updateAccount(
    id: number,
    updates: Partial<AdminAccount>,
  ): AdminAccount | undefined;
  deleteAccount(id: number): boolean;

  // Admin assets
  findAllAssets(): AdminAsset[];
  findAssetById(id: number): AdminAsset | undefined;
  createAsset(asset: Omit<AdminAsset, "id" | "created_at">): AdminAsset;
  updateAsset(id: number, updates: Partial<AdminAsset>): AdminAsset | undefined;
  deleteAsset(id: number): boolean;

  // Admin tags
  findAllTags(): AdminTag[];
  findTagById(id: number): AdminTag | undefined;
  createTag(tag: Omit<AdminTag, "id" | "created_at">): AdminTag;
  updateTag(id: number, updates: Partial<AdminTag>): AdminTag | undefined;
  deleteTag(id: number): boolean;
}

// Settings repository interface
export interface ISettingsRepository {
  getSettings(): StoreShape["settings"];
  getSetting(key: string): string | undefined;
  setSetting(key: string, value: string): void;
  deleteSetting(key: string): void;

  // Vault settings
  getDefaultSpendingVaultName(): string;
  setDefaultSpendingVaultName(name: string): void;
  getDefaultIncomeVaultName(): string;
  setDefaultIncomeVaultName(name: string): void;

  // Borrowing settings
  getBorrowingSettings(): {
    name: string;
    rate: number;
    lastAccrualStart?: string;
  };
  updateBorrowingSettings(settings: {
    name?: string;
    rate?: number;
    lastAccrualStart?: string;
  }): void;
}

// Pending actions repository interface
export interface IPendingActionsRepository {
  findAll(): PendingAction[];
  findById(id: string): PendingAction | undefined;
  findByStatus(status: string): PendingAction[];
  findByBatchId(batchId: string): PendingAction[];
  findDuplicate(params: {
    action: string;
    date: string;
    amount: number;
    counterparty?: string;
  }): PendingAction | undefined;
  create(action: PendingAction): PendingAction;
  update(
    id: string,
    updates: Partial<PendingAction>,
  ): PendingAction | undefined;
  delete(id: string): boolean;
}
