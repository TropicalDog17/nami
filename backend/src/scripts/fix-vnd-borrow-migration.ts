/*
  Migration script: Fix VND borrow transactions that were created with incorrect asset/amount

  This script fixes borrow transactions where:
  1. The asset was set to USDT but the amount was actually in VND
  2. The usdAmount was calculated incorrectly

  The script will:
  1. Backup the database
  2. Fix the USDT borrow transaction to convert it to VND with proper USD conversion
  3. Update the rate object to reflect VND instead of USDT

  Usage:
    npm run migrate:fix-vnd-borrow

  Or run directly:
    npx ts-node src/scripts/fix-vnd-borrow-migration.ts
*/

import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import {
  getConnection,
  closeConnection,
  initializeDatabase,
} from "../database/connection";

const DATA_DIR = path.resolve(__dirname, "..", "..", "data");
const DB_PATH = path.join(DATA_DIR, "nami.db");

function backupFile(src: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = `${src}.bak-${timestamp}`;
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }
  return dest;
}

// VND to USD conversion rate (fallback)
const VND_TO_USD_RATE = 1 / 24000;

async function getVNDRateForDate(dateStr: string): Promise<number> {
  // Try to get historical rate from price cache
  const db = getConnection();
  const cacheKey = `FIAT:VND:${dateStr}`;

  const row = db
    .prepare("SELECT rate_usd FROM price_cache WHERE cache_key = ?")
    .get(cacheKey) as { rate_usd: number } | undefined;

  if (row && row.rate_usd > 0) {
    return row.rate_usd;
  }

  // Fallback to fixed rate
  return VND_TO_USD_RATE;
}

async function run(): Promise<void> {
  console.log("Starting migration to fix VND borrow transactions...\n");

  // Validate database exists
  if (!fs.existsSync(DB_PATH)) {
    console.error("Error: Database file not found at", DB_PATH);
    process.exit(1);
  }

  // Backup database
  const backupPath = backupFile(DB_PATH);
  console.log("Backed up database to:", backupPath);

  // Initialize database connection
  initializeDatabase();
  const db = getConnection();

  try {
    // Find the problematic USDT borrow transaction
    const usdtBorrow = db
      .prepare(
        `
        SELECT id, type, asset_type, asset_symbol, amount, usd_amount, rate, created_at
        FROM transactions
        WHERE type = 'BORROW' AND asset_symbol = 'USDT'
      `,
      )
      .get() as {
      id: string;
      type: string;
      asset_type: string;
      asset_symbol: string;
      amount: number;
      usd_amount: number;
      rate: string;
      created_at: string;
    } | undefined;

    if (!usdtBorrow) {
      console.log("No USDT BORROW transaction found. Nothing to fix.");
      return;
    }

    console.log("Found USDT BORROW transaction:");
    console.log("  ID:", usdtBorrow.id);
    console.log("  Amount:", usdtBorrow.amount, "USDT");
    console.log("  USD Amount:", usdtBorrow.usd_amount);
    console.log("  Created At:", usdtBorrow.created_at);

    // Get the VND rate for the transaction date
    const dateStr = usdtBorrow.created_at.split("T")[0];
    const vndRateUsd = await getVNDRateForDate(dateStr);

    console.log("\nConverting to VND:");
    console.log("  VND Rate (1 VND in USD):", vndRateUsd);
    console.log("  Original amount (treated as VND):", usdtBorrow.amount);
    console.log("  New USD amount:", usdtBorrow.amount * vndRateUsd);

    // Create the new rate object for VND
    const oldRate = JSON.parse(usdtBorrow.rate);
    const newRate = {
      asset: { type: "FIAT" as const, symbol: "VND" },
      rateUSD: vndRateUsd,
      timestamp: oldRate.timestamp || dateStr + "T00:00:00.000Z",
      source: "MIGRATION_FIX" as const,
    };

    // Update the transaction
    const updateStmt = db.prepare(`
      UPDATE transactions
      SET asset_type = ?,
          asset_symbol = ?,
          usd_amount = ?,
          rate = ?
      WHERE id = ?
    `);

    updateStmt.run(
      newRate.asset.type,
      newRate.asset.symbol,
      usdtBorrow.amount * vndRateUsd,
      JSON.stringify(newRate),
      usdtBorrow.id,
    );

    console.log("\n✓ Fixed transaction:");
    console.log("  Asset: USDT -> VND");
    console.log("  USD Amount:", usdtBorrow.usd_amount, "->", usdtBorrow.amount * vndRateUsd);

    // Verify the fix
    const fixed = db
      .prepare(
        `
        SELECT asset_symbol, amount, usd_amount
        FROM transactions
        WHERE id = ?
      `,
      )
      .get(usdtBorrow.id) as { asset_symbol: string; amount: number; usd_amount: number };

    console.log("\nVerification:");
    console.log("  Asset:", fixed.asset_symbol);
    console.log("  Amount:", fixed.amount);
    console.log("  USD Amount:", fixed.usd_amount);

    // Check if the USD amount is now reasonable (should be around $3,000-$4,000 for 79M VND)
    if (fixed.usd_amount > 10000) {
      console.warn("\n⚠ Warning: USD amount still seems high (> $10,000). Please verify.");
    } else {
      console.log("\n✓ USD amount looks reasonable!");
    }

    console.log("\nMigration completed successfully!");
    console.log(`\nDatabase backup saved at: ${backupPath}`);
    console.log("If there are any issues, you can restore from the backup.");
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    console.log(`\nYou can restore from backup: ${backupPath}`);
    process.exit(1);
  } finally {
    closeConnection();
  }
}

run().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
