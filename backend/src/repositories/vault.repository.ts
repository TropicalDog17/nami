import { Vault, VaultEntry } from "../types";
import { readStore, writeStore } from "./base.repository";

export class VaultRepository {
  findAll(): Vault[] {
    return readStore().vaults;
  }

  findByName(name: string): Vault | undefined {
    return readStore().vaults.find(v => v.name === name);
  }

  findByStatus(status: string): Vault[] {
    return readStore().vaults.filter(v => v.status === status);
  }

  create(vault: Vault): Vault {
    const store = readStore();
    store.vaults.push(vault);
    writeStore(store);
    return vault;
  }

  update(name: string, updates: Partial<Vault>): Vault | undefined {
    const store = readStore();
    const index = store.vaults.findIndex(v => v.name === name);
    if (index === -1) return undefined;

    store.vaults[index] = { ...store.vaults[index], ...updates };
    writeStore(store);
    return store.vaults[index];
  }

  delete(name: string): boolean {
    const store = readStore();
    const initialLength = store.vaults.length;
    store.vaults = store.vaults.filter(v => v.name !== name);
    // Also delete associated vault entries
    store.vaultEntries = store.vaultEntries.filter(e => e.vault !== name);
    writeStore(store);
    return store.vaults.length < initialLength;
  }

  // Vault Entry methods
  findAllEntries(vaultName: string): VaultEntry[] {
    return readStore().vaultEntries
      .filter(e => e.vault === vaultName)
      .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  }

  createEntry(entry: VaultEntry): VaultEntry {
    const store = readStore();
    store.vaultEntries.push(entry);
    writeStore(store);
    return entry;
  }

  findEntriesByType(vaultName: string, type: string): VaultEntry[] {
    return readStore().vaultEntries.filter(
      e => e.vault === vaultName && e.type === type
    );
  }

  findEntriesByDateRange(vaultName: string, startDate: string, endDate: string): VaultEntry[] {
    return readStore().vaultEntries.filter(
      e => e.vault === vaultName && e.at >= startDate && e.at <= endDate
    );
  }
}

export const vaultRepository = new VaultRepository();
