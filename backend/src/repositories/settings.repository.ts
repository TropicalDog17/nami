import { readStore, writeStore, StoreShape } from "./base.repository";
import { ISettingsRepository } from "./repository.interface";
import { BaseDbRepository } from "./base-db.repository";

export interface BorrowingSettings {
  name: string;
  rate: number;
  lastAccrualStart: string;
}

// JSON-based implementation
export class SettingsRepositoryJson implements ISettingsRepository {
  getSettings(): StoreShape["settings"] {
    const store = readStore();
    return store.settings || {};
  }

  getSetting(key: string): string | undefined {
    const settings = this.getSettings();
    const value = settings?.[key as keyof StoreShape["settings"]];
    return typeof value === "string"
      ? value
      : value !== undefined
        ? String(value)
        : undefined;
  }

  setSetting(key: string, value: string): void {
    const store = readStore();
    if (!store.settings) store.settings = {};
    (store.settings as any)[key] = value;
    writeStore(store);
  }

  deleteSetting(key: string): void {
    const store = readStore();
    if (!store.settings) return;
    delete (store.settings as any)[key];
    writeStore(store);
  }

  // Additional helper methods
  getBorrowingSettings(): BorrowingSettings {
    const settings = this.getSettings();
    const name = settings?.borrowingVaultName?.trim() || "Borrowings";
    const rate =
      typeof settings?.borrowingMonthlyRate === "number"
        ? settings.borrowingMonthlyRate
        : 0.02;
    const lastAccrualStart =
      settings?.borrowingLastAccrualAt || new Date().toISOString();

    return { name, rate, lastAccrualStart };
  }

  updateBorrowingSettings(settings: Partial<BorrowingSettings>): void {
    if (settings.name) this.setSetting("borrowingVaultName", settings.name);
    if (settings.rate !== undefined)
      this.setSetting("borrowingMonthlyRate", String(settings.rate));
    if (settings.lastAccrualStart)
      this.setSetting("borrowingLastAccrualAt", settings.lastAccrualStart);
  }

  getDefaultSpendingVaultName(): string {
    return this.getSetting("defaultSpendingVaultName") || "Spend";
  }

  setDefaultSpendingVaultName(name: string): void {
    this.setSetting("defaultSpendingVaultName", name.trim() || "Spend");
  }

  getDefaultIncomeVaultName(): string {
    // After migration, all income goes to Spend
    if (this.isMigratedIncomeToSpend()) {
      return "Spend";
    }
    return this.getSetting("defaultIncomeVaultName") || "Income";
  }

  setDefaultIncomeVaultName(name: string): void {
    this.setSetting("defaultIncomeVaultName", name.trim() || "Income");
  }

  isMigratedToVaultOnly(): boolean {
    return this.getSetting("migratedVaultOnly") === "true";
  }

  setMigratedToVaultOnly(value: boolean): void {
    this.setSetting("migratedVaultOnly", value ? "true" : "false");
  }

  isMigratedBorrowingPrincipal(): boolean {
    return this.getSetting("migratedBorrowingPrincipal") === "true";
  }

  setMigratedBorrowingPrincipal(value: boolean): void {
    this.setSetting("migratedBorrowingPrincipal", value ? "true" : "false");
  }

  isMigratedIncomeToSpend(): boolean {
    return this.getSetting("migratedIncomeToSpend") === "true";
  }

  setMigratedIncomeToSpend(value: boolean): void {
    this.setSetting("migratedIncomeToSpend", value ? "true" : "false");
  }
}

// Database-based implementation
export class SettingsRepositoryDb
  extends BaseDbRepository
  implements ISettingsRepository
{
  getSettings(): StoreShape["settings"] {
    const rows = this.findMany("SELECT * FROM settings", [], (row: any) => row);
    const settings: Record<string, string | number | boolean> = {};
    for (const row of rows) {
      // Try to parse as number or boolean
      const value = row.value;
      if (value === "true") {
        settings[row.key] = true;
      } else if (value === "false") {
        settings[row.key] = false;
      } else if (/^\d+\.?\d*$/.test(value)) {
        settings[row.key] = parseFloat(value);
      } else {
        settings[row.key] = value;
      }
    }
    return settings as StoreShape["settings"];
  }

  getSetting(key: string): string | undefined {
    const row = this.findOne(
      "SELECT value FROM settings WHERE key = ?",
      [key],
      (r: any) => r.value,
    );
    return row;
  }

  setSetting(key: string, value: string): void {
    this.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
      key,
      value,
    ]);
  }

  deleteSetting(key: string): void {
    this.execute("DELETE FROM settings WHERE key = ?", [key]);
  }

  // Additional helper methods
  getBorrowingSettings(): BorrowingSettings {
    const name = this.getSetting("borrowingVaultName") || "Borrowings";
    const rateValue = this.getSetting("borrowingMonthlyRate");
    const rate = rateValue ? parseFloat(rateValue) : 0.02;
    const lastAccrualStart =
      this.getSetting("borrowingLastAccrualAt") || new Date().toISOString();

    return { name, rate, lastAccrualStart };
  }

  updateBorrowingSettings(settings: Partial<BorrowingSettings>): void {
    if (settings.name) this.setSetting("borrowingVaultName", settings.name);
    if (settings.rate !== undefined)
      this.setSetting("borrowingMonthlyRate", String(settings.rate));
    if (settings.lastAccrualStart)
      this.setSetting("borrowingLastAccrualAt", settings.lastAccrualStart);
  }

  getDefaultSpendingVaultName(): string {
    return this.getSetting("defaultSpendingVaultName") || "Spend";
  }

  setDefaultSpendingVaultName(name: string): void {
    this.setSetting("defaultSpendingVaultName", name.trim() || "Spend");
  }

  getDefaultIncomeVaultName(): string {
    // After migration, all income goes to Spend
    if (this.isMigratedIncomeToSpend()) {
      return "Spend";
    }
    return this.getSetting("defaultIncomeVaultName") || "Income";
  }

  setDefaultIncomeVaultName(name: string): void {
    this.setSetting("defaultIncomeVaultName", name.trim() || "Income");
  }

  isMigratedToVaultOnly(): boolean {
    return this.getSetting("migratedVaultOnly") === "true";
  }

  setMigratedToVaultOnly(value: boolean): void {
    this.setSetting("migratedVaultOnly", value ? "true" : "false");
  }

  isMigratedBorrowingPrincipal(): boolean {
    return this.getSetting("migratedBorrowingPrincipal") === "true";
  }

  setMigratedBorrowingPrincipal(value: boolean): void {
    this.setSetting("migratedBorrowingPrincipal", value ? "true" : "false");
  }

  isMigratedIncomeToSpend(): boolean {
    return this.getSetting("migratedIncomeToSpend") === "true";
  }

  setMigratedIncomeToSpend(value: boolean): void {
    this.setSetting("migratedIncomeToSpend", value ? "true" : "false");
  }
}
