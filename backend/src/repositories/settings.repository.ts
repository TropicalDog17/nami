import { readStore, writeStore } from "./base.repository";

export interface BorrowingSettings {
  name: string;
  rate: number;
  lastAccrualStart: string;
}

export class SettingsRepository {
  getSettings() {
    const store = readStore();
    return store.settings || {};
  }

  getBorrowingSettings(): BorrowingSettings {
    const store = readStore();
    const name = store.settings?.borrowingVaultName?.trim() || 'Borrowings';
    const rate = typeof store.settings?.borrowingMonthlyRate === 'number'
      ? store.settings.borrowingMonthlyRate
      : 0.02;
    const lastAccrualStart = store.settings?.borrowingLastAccrualAt || new Date().toISOString();

    return { name, rate, lastAccrualStart };
  }

  updateBorrowingSettings(settings: Partial<BorrowingSettings>): void {
    const store = readStore();
    if (!store.settings) store.settings = {};

    if (settings.name) store.settings.borrowingVaultName = settings.name;
    if (settings.rate !== undefined) store.settings.borrowingMonthlyRate = settings.rate;
    if (settings.lastAccrualStart) store.settings.borrowingLastAccrualAt = settings.lastAccrualStart;

    writeStore(store);
  }

  getDefaultSpendingVaultName(): string {
    const store = readStore();
    return store.settings?.defaultSpendingVaultName?.trim() || 'Spend';
  }

  setDefaultSpendingVaultName(name: string): void {
    const store = readStore();
    if (!store.settings) store.settings = {};
    store.settings.defaultSpendingVaultName = name.trim() || 'Spend';
    writeStore(store);
  }

  getDefaultIncomeVaultName(): string {
    const store = readStore();
    // After migration, all income goes to Spend
    if (this.isMigratedIncomeToSpend()) {
      return 'Spend';
    }
    return store.settings?.defaultIncomeVaultName?.trim() || 'Income';
  }

  setDefaultIncomeVaultName(name: string): void {
    const store = readStore();
    if (!store.settings) store.settings = {};
    store.settings.defaultIncomeVaultName = name.trim() || 'Income';
    writeStore(store);
  }

  isMigratedToVaultOnly(): boolean {
    const store = readStore();
    return store.settings?.migratedVaultOnly === true;
  }

  setMigratedToVaultOnly(value: boolean): void {
    const store = readStore();
    if (!store.settings) store.settings = {};
    store.settings.migratedVaultOnly = value;
    writeStore(store);
  }

  isMigratedBorrowingPrincipal(): boolean {
    const store = readStore();
    return store.settings?.migratedBorrowingPrincipal === true;
  }

  setMigratedBorrowingPrincipal(value: boolean): void {
    const store = readStore();
    if (!store.settings) store.settings = {};
    store.settings.migratedBorrowingPrincipal = value;
    writeStore(store);
  }

  isMigratedIncomeToSpend(): boolean {
    const store = readStore();
    return store.settings?.migratedIncomeToSpend === true;
  }

  setMigratedIncomeToSpend(value: boolean): void {
    const store = readStore();
    if (!store.settings) store.settings = {};
    store.settings.migratedIncomeToSpend = value;
    writeStore(store);
  }
}

export const settingsRepository = new SettingsRepository();
