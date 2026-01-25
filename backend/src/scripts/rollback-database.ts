/*
  Rollback script: Database -> JSON store.json

  Usage:
    npm run migrate:rollback-database

  This script:
  1. Reads all data from SQLite database
  2. Writes it back to store.json
  3. Used to export data from DB back to JSON format
*/

import fs from "fs";
import path from "path";
import {
  getConnection,
  closeConnection,
  initializeDatabase,
} from "../database/connection";
import { writeStore, StoreShape } from "../repositories/base.repository";

const DATA_DIR = path.resolve(__dirname, "..", "..", "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const DB_PATH = path.join(DATA_DIR, "nami.db");

function backupFile(src: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = `${src}.bak-${timestamp}`;
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }
  return dest;
}

async function run(): Promise<void> {
  console.log("Starting rollback from database to JSON...\n");

  // Validate database exists
  if (!fs.existsSync(DB_PATH)) {
    console.error("Error: Database file not found at", DB_PATH);
    process.exit(1);
  }

  // Initialize database connection
  initializeDatabase();
  const db = getConnection();

  // Backup existing store.json
  const backupPath = backupFile(STORE_FILE);
  if (fs.existsSync(STORE_FILE)) {
    console.log("Backed up current store to:", backupPath);
  }

  try {
    // Read all data from database
    const transactions = db
      .prepare(
        `
      SELECT id, type, asset_type as assetType, asset_symbol as assetSymbol,
             amount, created_at as createdAt, account, note, category, tags,
             counterparty, due_date as dueDate, transfer_id as transferId,
             loan_id as loanId, source_ref as sourceRef, repay_direction as direction,
             rate, usd_amount as usdAmount
      FROM transactions
    `,
      )
      .all();

    const vaults = db.prepare("SELECT * FROM vaults").all();

    const vaultEntries = db
      .prepare(
        `
      SELECT vault, type, asset_type as assetType, asset_symbol as assetSymbol,
             amount, usd_value as usdValue, at, account, note
      FROM vault_entries
    `,
      )
      .all();

    const loans = db
      .prepare(
        `
      SELECT id, counterparty, asset_type as assetType, asset_symbol as assetSymbol,
             principal, interest_rate as interestRate, period, start_at as startAt,
             maturity_at as maturityAt, note, account, status, created_at as createdAt
      FROM loans
    `,
      )
      .all();

    const borrowings = db
      .prepare(
        `
      SELECT id, counterparty, asset_type as assetType, asset_symbol as assetSymbol,
             principal, monthly_payment as monthlyPayment, start_at as startAt,
             first_due_at as firstDueAt, next_payment_at as nextPaymentAt,
             outstanding, note, account, status, created_at as createdAt
      FROM borrowings
    `,
      )
      .all();

    const adminTypes = db.prepare("SELECT * FROM admin_types").all();
    const adminAccounts = db.prepare("SELECT * FROM admin_accounts").all();
    const adminAssets = db.prepare("SELECT * FROM admin_assets").all();
    const adminTags = db.prepare("SELECT * FROM admin_tags").all();
    const pendingActions = db.prepare("SELECT * FROM pending_actions").all();

    const settingsRows = db.prepare("SELECT * FROM settings").all();
    const settings: Record<string, any> = {};
    for (const row of settingsRows) {
      const value = (row as any).value;
      // Try to parse as number or boolean
      if (value === "true") {
        settings[(row as any).key] = true;
      } else if (value === "false") {
        settings[(row as any).key] = false;
      } else if (/^\d+\.?\d*$/.test(value)) {
        settings[(row as any).key] = parseFloat(value);
      } else {
        settings[(row as any).key] = value;
      }
    }

    // Build store object
    const store: StoreShape = {
      transactions: transactions.map((t: any) => ({
        ...t,
        asset: { type: t.assetType, symbol: t.assetSymbol },
        rate: JSON.parse(t.rate),
        tags: t.tags ? JSON.parse(t.tags) : undefined,
      })),
      vaults: vaults.map((v: any) => ({
        name: v.name,
        status: v.status,
        createdAt: v.created_at,
      })),
      vaultEntries: vaultEntries.map((e: any) => ({
        vault: e.vault,
        type: e.type,
        asset: { type: e.assetType, symbol: e.assetSymbol },
        amount: e.amount,
        usdValue: e.usdValue,
        at: e.at,
        account: e.account,
        note: e.note,
      })),
      loans: loans.map((l: any) => ({
        ...l,
        asset: { type: l.assetType, symbol: l.assetSymbol },
      })),
      borrowings: borrowings.map((b: any) => ({
        ...b,
        asset: { type: b.assetType, symbol: b.assetSymbol },
      })),
      adminTypes: adminTypes.map((t: any) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        is_active: !!t.is_active,
        created_at: t.created_at,
      })),
      adminAccounts: adminAccounts.map((a: any) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        is_active: !!a.is_active,
        created_at: a.created_at,
      })),
      adminAssets: adminAssets.map((a: any) => ({
        id: a.id,
        symbol: a.symbol,
        name: a.name,
        decimals: a.decimals,
        is_active: !!a.is_active,
        created_at: a.created_at,
      })),
      adminTags: adminTags.map((t: any) => ({
        id: t.id,
        name: t.name,
        category: t.category,
        is_active: !!t.is_active,
        created_at: t.created_at,
      })),
      pendingActions: pendingActions.map((a: any) => ({
        ...a,
        action_json: a.action_json ? JSON.parse(a.action_json) : undefined,
        meta: a.meta ? JSON.parse(a.meta) : undefined,
        created_tx_ids: a.created_tx_ids
          ? JSON.parse(a.created_tx_ids)
          : undefined,
      })),
      settings: settings as StoreShape["settings"],
    };

    // Write to store.json
    writeStore(store);

    console.log("✅ Rollback completed successfully!");
    console.log(`\nData written to: ${STORE_FILE}`);
    console.log("\nTo switch back to JSON mode:");
    console.log("  STORAGE_BACKEND=json npm run dev");
    console.log(`\nOriginal backup is at: ${backupPath}`);
  } catch (err: any) {
    console.error("\n❌ Rollback failed:", err.message);
    console.error("\nTo restore from backup:");
    console.error(`  cp ${backupPath} ${STORE_FILE}`);
    process.exit(1);
  } finally {
    closeConnection();
  }
}

run();
