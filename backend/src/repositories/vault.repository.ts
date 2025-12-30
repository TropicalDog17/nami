import { Vault, VaultEntry } from "../types";
import { readStore, writeStore } from "./base.repository";
import { IVaultRepository } from "./repository.interface";
import {
  BaseDbRepository,
  rowToVault,
  vaultToRow,
  rowToVaultEntry,
  vaultEntryToRow,
} from "./base-db.repository";

// JSON-based implementation
export class VaultRepositoryJson implements IVaultRepository {
  findAll(): Vault[] {
    return readStore().vaults;
  }

  findByName(name: string): Vault | undefined {
    return readStore().vaults.find((v) => v.name === name);
  }

  findByStatus(status: string): Vault[] {
    return readStore().vaults.filter((v) => v.status === status);
  }

  create(vault: Vault): Vault {
    const store = readStore();
    store.vaults.push(vault);
    writeStore(store);
    return vault;
  }

  update(name: string, updates: Partial<Vault>): Vault | undefined {
    const store = readStore();
    const index = store.vaults.findIndex((v) => v.name === name);
    if (index === -1) return undefined;

    store.vaults[index] = { ...store.vaults[index], ...updates };
    writeStore(store);
    return store.vaults[index];
  }

  delete(name: string): boolean {
    const store = readStore();
    const initialLength = store.vaults.length;
    store.vaults = store.vaults.filter((v) => v.name !== name);
    // Also delete associated vault entries
    store.vaultEntries = store.vaultEntries.filter((e) => e.vault !== name);
    writeStore(store);
    return store.vaults.length < initialLength;
  }

  // Vault Entry methods
  findAllEntries(vaultName: string): VaultEntry[] {
    return readStore()
      .vaultEntries.filter((e) => e.vault === vaultName)
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
      (e) => e.vault === vaultName && e.type === type,
    );
  }

  findEntriesByDateRange(
    vaultName: string,
    startDate: string,
    endDate: string,
  ): VaultEntry[] {
    return readStore().vaultEntries.filter(
      (e) => e.vault === vaultName && e.at >= startDate && e.at <= endDate,
    );
  }
}

// Database-based implementation
export class VaultRepositoryDb
  extends BaseDbRepository
  implements IVaultRepository
{
  findAll(): Vault[] {
    return this.findMany(
      "SELECT * FROM vaults ORDER BY created_at DESC",
      [],
      rowToVault,
    );
  }

  findByName(name: string): Vault | undefined {
    return this.findOne(
      "SELECT * FROM vaults WHERE name = ?",
      [name],
      rowToVault,
    );
  }

  findByStatus(status: string): Vault[] {
    return this.findMany(
      "SELECT * FROM vaults WHERE status = ?",
      [status],
      rowToVault,
    );
  }

  create(vault: Vault): Vault {
    const row = vaultToRow(vault);
    this.execute(
      "INSERT INTO vaults (name, status, created_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET status = excluded.status",
      [row.name, row.status, row.created_at],
    );
    return vault;
  }

  update(name: string, updates: Partial<Vault>): Vault | undefined {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) {
      fields.push("status = ?");
      values.push(updates.status);
    }

    if (fields.length === 0) return this.findByName(name);

    values.push(name);
    this.execute(
      `UPDATE vaults SET ${fields.join(", ")} WHERE name = ?`,
      values,
    );
    return this.findByName(name);
  }

  delete(name: string): boolean {
    const result = this.execute("DELETE FROM vaults WHERE name = ?", [name]);
    return result.changes > 0;
  }

  // Vault Entry methods
  findAllEntries(vaultName: string): VaultEntry[] {
    return this.findMany(
      `SELECT * FROM vault_entries WHERE vault = ? ORDER BY at ASC`,
      [vaultName],
      rowToVaultEntry,
    );
  }

  createEntry(entry: VaultEntry): VaultEntry {
    const row = vaultEntryToRow(entry);
    this.execute(
      `INSERT INTO vault_entries (vault, type, asset_type, asset_symbol, amount, usd_value, at, account, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.vault,
        row.type,
        row.asset_type,
        row.asset_symbol,
        row.amount,
        row.usd_value,
        row.at,
        row.account,
        row.note,
      ],
    );
    return entry;
  }

  findEntriesByType(vaultName: string, type: string): VaultEntry[] {
    return this.findMany(
      `SELECT * FROM vault_entries WHERE vault = ? AND type = ? ORDER BY at DESC`,
      [vaultName, type],
      rowToVaultEntry,
    );
  }

  findEntriesByDateRange(
    vaultName: string,
    startDate: string,
    endDate: string,
  ): VaultEntry[] {
    return this.findMany(
      `SELECT * FROM vault_entries WHERE vault = ? AND at >= ? AND at <= ? ORDER BY at ASC`,
      [vaultName, startDate, endDate],
      rowToVaultEntry,
    );
  }
}
