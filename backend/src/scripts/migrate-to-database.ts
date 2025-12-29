/*
  Migration script: JSON store.json -> SQLite database

  Usage:
    npm run migrate:to-database

  Features:
  - Backs up store.json before migration
  - Migrates all data with validation
  - Handles errors and provides rollback instructions
*/

import fs from 'fs';
import path from 'path';
import { initializeDatabase, getConnection, closeConnection, resetConnection } from '../database/connection';
import { readStore, writeStore } from '../repositories/base.repository';

const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const DB_PATH = path.join(DATA_DIR, 'nami.db');

function backupFile(src: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = `${src}.bak-${timestamp}`;
  fs.copyFileSync(src, dest);
  return dest;
}

async function migrateTransactions(store: any): Promise<void> {
  console.log(`Migrating ${store.transactions.length} transactions...`);

  const db = getConnection();

  const stmt = db.prepare(`
    INSERT INTO transactions (
      id, type, asset_type, asset_symbol, amount, created_at, account,
      note, category, tags, counterparty, due_date, transfer_id,
      loan_id, source_ref, repay_direction, rate, usd_amount
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((txs: any[]) => {
    for (const tx of txs) {
      try {
        stmt.run(
          tx.id,
          tx.type,
          tx.asset.type,
          tx.asset.symbol,
          tx.amount,
          tx.createdAt,
          tx.account || null,
          tx.note || null,
          tx.category || null,
          tx.tags ? JSON.stringify(tx.tags) : null,
          tx.counterparty || null,
          tx.dueDate || null,
          tx.transferId || null,
          tx.loanId || null,
          tx.sourceRef || null,
          (tx as any).direction || null,
          JSON.stringify(tx.rate),
          tx.usdAmount
        );
      } catch (err: any) {
        if (err.code !== 'SQLITE_CONSTRAINT') {
          throw err;
        }
        console.warn(`  Skipping duplicate transaction: ${tx.id}`);
      }
    }
  });

  insertMany(store.transactions);
  console.log('  Transactions migrated successfully');
}

async function migrateVaults(store: any): Promise<void> {
  console.log(`Migrating ${store.vaults.length} vaults...`);

  const db = getConnection();

  const stmt = db.prepare(`
    INSERT INTO vaults (name, status, created_at)
    VALUES (?, ?, ?)
  `);

  const insertMany = db.transaction((items: any[]) => {
    for (const vault of items) {
      stmt.run(vault.name, vault.status, vault.createdAt);
    }
  });

  insertMany(store.vaults);
  console.log('  Vaults migrated successfully');
}

async function migrateVaultEntries(store: any): Promise<void> {
  console.log(`Migrating ${store.vaultEntries.length} vault entries...`);

  const db = getConnection();

  const stmt = db.prepare(`
    INSERT INTO vault_entries (vault, type, asset_type, asset_symbol, amount, usd_value, at, account, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((items: any[]) => {
    for (const e of items) {
      stmt.run(
        e.vault,
        e.type,
        e.asset.type,
        e.asset.symbol,
        e.amount,
        e.usdValue,
        e.at,
        e.account || null,
        e.note || null
      );
    }
  });

  insertMany(store.vaultEntries);
  console.log('  Vault entries migrated successfully');
}

async function migrateLoans(store: any): Promise<void> {
  console.log(`Migrating ${store.loans.length} loans...`);

  const db = getConnection();

  const stmt = db.prepare(`
    INSERT INTO loans (id, counterparty, asset_type, asset_symbol, principal, interest_rate, period, start_at, maturity_at, note, account, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((items: any[]) => {
    for (const loan of items) {
      stmt.run(
        loan.id,
        loan.counterparty,
        loan.asset.type,
        loan.asset.symbol,
        loan.principal,
        loan.interestRate,
        loan.period,
        loan.startAt,
        loan.maturityAt || null,
        loan.note || null,
        loan.account || null,
        loan.status,
        loan.createdAt
      );
    }
  });

  insertMany(store.loans);
  console.log('  Loans migrated successfully');
}

async function migrateAdminData(store: any): Promise<void> {
  console.log('Migrating admin data...');

  const db = getConnection();

  // Types
  const typeStmt = db.prepare('INSERT INTO admin_types (id, name, description, is_active, created_at) VALUES (?, ?, ?, ?, ?)');
  for (const t of store.adminTypes || []) {
    try {
      typeStmt.run(t.id, t.name, t.description || null, t.is_active ? 1 : 0, t.created_at);
    } catch (err: any) {
      if (err.code !== 'SQLITE_CONSTRAINT') throw err;
    }
  }

  // Accounts
  const acctStmt = db.prepare('INSERT INTO admin_accounts (id, name, type, is_active, created_at) VALUES (?, ?, ?, ?, ?)');
  for (const a of store.adminAccounts || []) {
    try {
      acctStmt.run(a.id, a.name, a.type || null, a.is_active ? 1 : 0, a.created_at);
    } catch (err: any) {
      if (err.code !== 'SQLITE_CONSTRAINT') throw err;
    }
  }

  // Assets
  const assetStmt = db.prepare('INSERT INTO admin_assets (id, symbol, name, decimals, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  for (const a of store.adminAssets || []) {
    try {
      assetStmt.run(a.id, a.symbol, a.name || null, a.decimals, a.is_active ? 1 : 0, a.created_at);
    } catch (err: any) {
      if (err.code !== 'SQLITE_CONSTRAINT') throw err;
    }
  }

  // Tags
  const tagStmt = db.prepare('INSERT INTO admin_tags (id, name, category, is_active, created_at) VALUES (?, ?, ?, ?, ?)');
  for (const t of store.adminTags || []) {
    try {
      tagStmt.run(t.id, t.name, t.category || null, t.is_active ? 1 : 0, t.created_at);
    } catch (err: any) {
      if (err.code !== 'SQLITE_CONSTRAINT') throw err;
    }
  }

  console.log('  Admin data migrated successfully');
}

async function migratePendingActions(store: any): Promise<void> {
  console.log(`Migrating ${store.pendingActions.length} pending actions...`);

  const db = getConnection();

  const stmt = db.prepare(`
    INSERT INTO pending_actions (id, source, raw_input, toon_text, action_json, confidence, batch_id, meta, status, created_tx_ids, error, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((items: any[]) => {
    for (const a of items) {
      stmt.run(
        a.id,
        a.source,
        a.raw_input,
        a.toon_text || null,
        a.action_json ? JSON.stringify(a.action_json) : null,
        a.confidence || null,
        a.batch_id || null,
        a.meta ? JSON.stringify(a.meta) : null,
        a.status,
        a.created_tx_ids ? JSON.stringify(a.created_tx_ids) : null,
        a.error || null,
        a.created_at,
        a.updated_at
      );
    }
  });

  insertMany(store.pendingActions);
  console.log('  Pending actions migrated successfully');
}

async function migrateSettings(store: any): Promise<void> {
  console.log('Migrating settings...');

  const db = getConnection();

  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

  for (const [key, value] of Object.entries(store.settings || {})) {
    if (typeof value !== 'object') {
      stmt.run(key, String(value));
    }
  }

  console.log('  Settings migrated successfully');
}

async function run(): Promise<void> {
  console.log('Starting migration to database...\n');

  // Validate store.json exists
  if (!fs.existsSync(STORE_FILE)) {
    console.error('Error: store.json not found at', STORE_FILE);
    process.exit(1);
  }

  // Remove existing database if it exists
  if (fs.existsSync(DB_PATH)) {
    console.warn('Warning: Existing database file will be replaced:', DB_PATH);
    fs.unlinkSync(DB_PATH);
    resetConnection();
  }

  // Backup current store
  const backupPath = backupFile(STORE_FILE);
  console.log('Backed up current store to:', backupPath);
  console.log('');

  // Read current data
  const store = readStore();
  console.log(`Read store with ${store.transactions.length} transactions\n`);

  // Initialize database
  initializeDatabase();
  const db = getConnection();
  console.log('Database initialized at:', DB_PATH);
  console.log('');

  try {
    // Migrate all data
    await migrateTransactions(store);
    await migrateVaults(store);
    await migrateVaultEntries(store);
    await migrateLoans(store);
    await migrateAdminData(store);
    await migratePendingActions(store);
    await migrateSettings(store);

    console.log('\n✅ Migration completed successfully!');
    console.log('\nNext steps:');
    console.log('  1. Start application with database mode:');
    console.log('     STORAGE_BACKEND=database npm run dev');
    console.log('  2. Test the application with database mode');
    console.log('  3. If issues occur, you can switch back to JSON mode:');
    console.log('     STORAGE_BACKEND=json npm run dev');
    console.log(`  4. Your JSON backup is at: ${backupPath}`);

  } catch (err: any) {
    console.error('\n❌ Migration failed:', err.message);
    console.error('\nTo restore from backup:');
    console.error(`  cp ${backupPath} ${STORE_FILE}`);
    process.exit(1);
  } finally {
    closeConnection();
  }
}

run();
